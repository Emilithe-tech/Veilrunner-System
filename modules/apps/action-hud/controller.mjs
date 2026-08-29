import { buildHudProjection } from "./projection.mjs";
import { HUD_WORKSPACES, EFFECT_DISCLOSURE, systemId } from "./constants.mjs";
import { executeHudAction } from "./execution.mjs";
import { combatantForActor, economyCycleKey, ensureCombatEconomy, getCombatEconomy, resetCombatEconomy } from "./economy.mjs";
import { getHudPreferences, prepareHudAction, removePreparedHudAction, setHudPreferences, togglePinnedAction } from "./preferences.mjs";
import { switchEquippedWeapon } from "./weapons.mjs";
import { grantTargetIntel } from "./target-intel.mjs";
import { recordHudMovementUndo, undoHudActionsThrough, undoLastHudAction } from "./undo.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

let gmSelectedCombatActorId = "";

function targetKey(token) {
  return String(token?.document?.uuid ?? token?.uuid ?? token?.id ?? "");
}

function localTargetTokens(user, token = null, targeted = null) {
  const targets = [...(user?.targets ?? [])];
  if (!token || typeof targeted !== "boolean") return targets;
  const key = targetKey(token);
  const withoutToken = targets.filter(entry => entry !== token && (!key || targetKey(entry) !== key));
  return targeted ? [...withoutToken, token] : withoutToken;
}

function controlledCombatActor() {
  const combat = globalThis.game?.combat;
  if (!combat) return null;
  if (globalThis.game?.user?.isGM && gmSelectedCombatActorId) {
    const selected = Array.from(combat.combatants ?? []).find(combatant => combatant.actor?.id === gmSelectedCombatActorId)?.actor;
    if (selected) return selected;
    gmSelectedCombatActorId = "";
  }
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).filter(actor => actor && combatantForActor(actor, combat) && (globalThis.game.user.isGM || actor.isOwner));
  if (controlled.length === 1) return controlled[0];
  const active = globalThis.game?.veilrunner?.getActivePhaseCombatants?.() ?? [combat.combatant].filter(Boolean);
  const owned = active.map(entry => entry.actor).find(actor => actor && actor.isOwner);
  if (owned) return owned;
  if (globalThis.game.user.isGM) return combat.combatant?.actor ?? null;
  return Array.from(combat.combatants ?? []).map(entry => entry.actor).find(actor => actor?.isOwner) ?? null;
}

function actionFromProjection(view, id) {
  return [...view.allActions, ...view.pinned, ...view.recent, ...view.context, ...view.prepared].find(action => action.id === id)
    ?? view.assets.flatMap(asset => asset.actions).find(action => action.id === id)
    ?? (view.composer?.action?.id === id ? view.composer.action : null);
}

function usableRightRect(element) {
  const rect = element?.getBoundingClientRect?.();
  return rect && rect.width > 0 && rect.right > 0 && rect.left > window.innerWidth * 0.5 && rect.left < window.innerWidth ? rect : null;
}

function activeSidebarTab(sidebar) {
  const apiTab = globalThis.ui?.sidebar?.tabGroups?.primary ?? globalThis.ui?.sidebar?.activeTab;
  if (typeof apiTab === "string" && apiTab) return apiTab.toLowerCase();
  const active = sidebar?.querySelector?.('#sidebar-tabs [data-tab].active, nav.tabs [data-tab].active, [role="tab"][data-tab][aria-selected="true"]');
  return String(active?.dataset?.tab ?? active?.dataset?.tabName ?? "").toLowerCase();
}

function sidebarIsCollapsed(sidebar) {
  const apiCollapsed = globalThis.ui?.sidebar?._collapsed ?? globalThis.ui?.sidebar?.collapsed;
  return apiCollapsed === true || Boolean(sidebar?.classList?.contains("collapsed") || sidebar?.closest?.("#ui-right")?.classList?.contains("collapsed"));
}

let sidebarBoundsFrame = null;
let sidebarBoundsSyncId = 0;

function syncHudBoundsDuringSidebarTransition(hud) {
  const syncId = ++sidebarBoundsSyncId;
  if (sidebarBoundsFrame !== null) window.cancelAnimationFrame(sidebarBoundsFrame);
  const content = document.querySelector("#sidebar-content");
  hud?.element?.classList.add("is-syncing-sidebar");
  const sync = () => {
    if (syncId !== sidebarBoundsSyncId) return;
    hud?.syncBounds();
    sidebarBoundsFrame = window.requestAnimationFrame(sync);
  };
  const stop = () => {
    if (syncId !== sidebarBoundsSyncId) return;
    content?.removeEventListener("transitionend", onTransitionEnd);
    if (sidebarBoundsFrame !== null) window.cancelAnimationFrame(sidebarBoundsFrame);
    sidebarBoundsFrame = null;
    hud?.syncBounds();
    hud?.element?.classList.remove("is-syncing-sidebar");
  };
  const onTransitionEnd = event => {
    if (event.target === content && ["margin-left", "margin-right"].includes(event.propertyName)) stop();
  };
  content?.addEventListener("transitionend", onTransitionEnd);
  sync();
  window.setTimeout(stop, 300);
}

export class VeilrunnerActionHud extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "veilrunner-action-hud",
    tag: "section",
    classes: ["veilrunner", "vr-action-hud"],
    positioned: false,
    window: { frame: false },
    actions: {
      setWorkspace: VeilrunnerActionHud.onSetWorkspace,
      setDomain: VeilrunnerActionHud.onSetDomain,
      useAction: VeilrunnerActionHud.onUseAction,
      prepareAction: VeilrunnerActionHud.onPrepareAction,
      prepareComposer: VeilrunnerActionHud.onPrepareComposer,
      executePrepared: VeilrunnerActionHud.onExecutePrepared,
      removePrepared: VeilrunnerActionHud.onRemovePrepared,
      pinAction: VeilrunnerActionHud.onPinAction,
      openComposer: VeilrunnerActionHud.onOpenComposer,
      executeComposer: VeilrunnerActionHud.onExecuteComposer,
      switchWeapon: VeilrunnerActionHud.onSwitchWeapon,
      equipWeapon: VeilrunnerActionHud.onEquipWeapon,
      setWeaponFilter: VeilrunnerActionHud.onSetWeaponFilter,
      openEquipped: VeilrunnerActionHud.onOpenEquipped,
      rollSave: VeilrunnerActionHud.onRollSave,
      selectAsset: VeilrunnerActionHud.onSelectAsset,
      grantIntel: VeilrunnerActionHud.onGrantIntel,
      toggleMotion: VeilrunnerActionHud.onToggleMotion,
      toggleParty: VeilrunnerActionHud.onToggleParty,
      adjustSpellModifier: VeilrunnerActionHud.onAdjustSpellModifier,
      undoLastAction: VeilrunnerActionHud.onUndoLastAction,
      undoToHistory: VeilrunnerActionHud.onUndoToHistory
    }
  };

  static PARTS = {
    party: { template: "systems/veilrunner/templates/action-hud/party.hbs" },
    self: { template: "systems/veilrunner/templates/action-hud/self.hbs" },
    workspace: { template: "systems/veilrunner/templates/action-hud/workspace.hbs" },
    target: { template: "systems/veilrunner/templates/action-hud/target.hbs" },
    economy: { template: "systems/veilrunner/templates/action-hud/economy.hbs" }
  };

  actor = null;
  state = { workspace: HUD_WORKSPACES.NORMAL, domain: "", query: "", composerActionId: "", composerSelections: {}, composerPreparing: false, calculationOpen: false, selectedAssetUuid: "", requestedSave: null, partyOpen: true, targetTokens: null };
  #searchTimer = null;
  #composerTimer = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = buildHudProjection(this.actor, this.state);
    return { ...context, ...view, isGM: Boolean(game.user?.isGM), hud: this.state, partyOpen: this.state.partyOpen !== false, workspaceNormal: this.state.workspace === HUD_WORKSPACES.NORMAL, workspaceLibrary: this.state.workspace === HUD_WORKSPACES.LIBRARY, workspaceWeapons: this.state.workspace === HUD_WORKSPACES.WEAPONS, workspaceComposer: this.state.workspace === HUD_WORKSPACES.COMPOSER, workspaceAsset: this.state.workspace === HUD_WORKSPACES.ASSET, workspaceSaves: this.state.workspace === HUD_WORKSPACES.SAVES, composerPreparing: Boolean(this.state.composerPreparing), requestedSave: this.state.requestedSave };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.syncBounds();
    window.requestAnimationFrame(() => this.syncBounds());
    this.element.dataset.panState = context.panState;
    this.element.classList.toggle("composer-open", context.workspaceComposer);
    const panConfig = game.settings.get(systemId(), "combatHudPanConfig") ?? {};
    this.element.classList.toggle("reduce-motion", context.preferences.reducedMotion || context.preferences.reduceGlitch || panConfig.glitchEnabled === false);
    const search = this.element.querySelector("[data-hud-search]");
    search?.addEventListener("input", event => {
      window.clearTimeout(this.#searchTimer);
      this.#searchTimer = window.setTimeout(async () => {
        this.state.query = event.target.value;
        await setHudPreferences(this.actor, { filters: { ...getHudPreferences(this.actor).filters, query: this.state.query } });
        this.render({ parts: ["workspace"] });
      }, 120);
    });
    const weaponSearch = this.element.querySelector("[data-weapon-search]");
    weaponSearch?.addEventListener("input", event => {
      window.clearTimeout(this.#searchTimer);
      this.#searchTimer = window.setTimeout(() => { this.state.weaponQuery = event.target.value; this.render({ parts: ["workspace"] }); }, 120);
    });
    const updateComposer = input => {
      if (input.matches("[data-spell-level]")) {
        const min = Number(input.min) || 1;
        const max = Math.max(min, Number(input.max) || min);
        const level = Math.min(max, Math.max(min, Math.round(Number(input.value) || min)));
        this.element.querySelectorAll("[data-spell-level]").forEach(control => { control.value = String(level); });
      }
      this.state.calculationOpen = Boolean(this.element.querySelector(".vr-hud-calculation")?.open);
      this.state.composerSelections = Object.fromEntries(new FormData(this.element.querySelector(".vr-hud-composer")));
      window.clearTimeout(this.#composerTimer);
      this.#composerTimer = window.setTimeout(() => this.render({ parts: ["workspace", "economy"] }), 60);
    };
    this.element.querySelectorAll("[data-composer-input]").forEach(input => {
      input.addEventListener("change", () => updateComposer(input));
      if (input.matches("[data-spell-level]")) input.addEventListener("input", () => updateComposer(input));
    });
    this.element.querySelector(".vr-hud-calculation")?.addEventListener("toggle", event => {
      this.state.calculationOpen = event.currentTarget.open;
    });
  }

  syncBounds() {
    if (!this.element) return;
    const rightUi = document.querySelector("#ui-right");
    const sidebar = document.querySelector("#sidebar");
    const rightUiRect = usableRightRect(rightUi);
    const sidebarRect = usableRightRect(sidebar);
    const chatOpen = activeSidebarTab(sidebar) === "chat" && !sidebarIsCollapsed(sidebar) && Boolean(sidebarRect);
    const rightUiRects = chatOpen ? [sidebarRect] : [rightUiRect, sidebarRect].filter(Boolean);
    const boundary = rightUiRects.length ? Math.min(...rightUiRects.map(rect => rect.left)) : window.innerWidth;
    const inset = Math.max(8, Math.ceil(window.innerWidth - boundary + 8));
    this.element.dataset.sidebarLayout = chatOpen ? "chat-expanded" : "compact";
    this.element.style.setProperty("--vr-hud-sidebar-inset", `${inset}px`);
    const party = this.element.querySelector(".vr-hud-party");
    const self = this.element.querySelector(".vr-hud-self");
    if (party && self) {
      const currentOffset = Number.parseFloat(this.element.style.getPropertyValue("--vr-hud-party-offset")) || 0;
      const partyBottom = party.getBoundingClientRect().bottom;
      const selfTop = self.getBoundingClientRect().top;
      this.element.style.setProperty("--vr-hud-party-offset", `${Math.round(currentOffset + selfTop - partyBottom)}px`);
    }
  }

  async showForCombat() {
    const actor = controlledCombatActor();
    if (!actor) return this.close({ animate: false });
    const changed = actor.id !== this.actor?.id;
    this.actor = actor;
    this.state.targetTokens = localTargetTokens(globalThis.game?.user);
    if (changed) {
      const prefs = getHudPreferences(actor);
      this.state = { ...this.state, workspace: HUD_WORKSPACES.NORMAL, domain: prefs.filters.domain, query: prefs.filters.query, composerActionId: "", composerSelections: {}, composerPreparing: false, calculationOpen: false, selectedAssetUuid: prefs.selectedAssetUuid };
    }
    await ensureCombatEconomy(actor);
    return this.render({ force: true });
  }

  refresh(parts = null) {
    if (!globalThis.game?.combat) return this.close({ animate: false });
    const actor = controlledCombatActor();
    if (!actor || actor.id !== this.actor?.id) return this.showForCombat();
    return this.render(parts?.length ? { parts } : { force: true });
  }

  static onSetWorkspace(event, target) {
    this.state.workspace = target.dataset.workspace || HUD_WORKSPACES.NORMAL;
    if (this.state.workspace !== HUD_WORKSPACES.COMPOSER) {
      this.state.composerActionId = "";
      this.state.composerPreparing = false;
      this.state.calculationOpen = false;
    }
    this.render({ parts: ["workspace"] });
  }

  static async onSetDomain(event, target) {
    this.state.domain = target.dataset.domain ?? "";
    this.state.workspace = HUD_WORKSPACES.LIBRARY;
    const filters = { ...getHudPreferences(this.actor).filters, domain: this.state.domain };
    await setHudPreferences(this.actor, { filters });
    this.render({ parts: ["workspace"] });
  }

  static async onUseAction(event, target) {
    const view = buildHudProjection(this.actor, this.state);
    const action = actionFromProjection(view, target.dataset.actionId);
    if (!action) return;
    if (action.valid === false) return globalThis.ui?.notifications?.warn?.(action.errors?.[0] ?? "This action is invalid.");
    if ((action.generated && action.operation === "fire") || action.isSpell || action.composer?.length || action.enhancements?.length || action.augments?.length || action.rankScaling?.enabled) return this.openComposer(action);
    const actionActor = action.assetActorUuid ? view.assets.find(asset => asset.uuid === action.assetActorUuid)?.actor ?? this.actor : this.actor;
    await executeHudAction(actionActor, action, { targetToken: view.targetTokens[0] ?? null });
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  openComposer(action, { preparing = false } = {}) {
    const remembered = getHudPreferences(this.actor).remembered?.[action.id] ?? {};
    this.state = { ...this.state, workspace: HUD_WORKSPACES.COMPOSER, composerActionId: action.id, composerSelections: remembered, composerPreparing: preparing, calculationOpen: false };
    this.render({ parts: ["workspace", "economy"] });
  }

  static onOpenComposer(event, target) {
    const view = buildHudProjection(this.actor, this.state);
    const action = actionFromProjection(view, target.dataset.actionId);
    if (action) this.openComposer(action);
  }

  static async onPrepareAction(event, target) {
    const view = buildHudProjection(this.actor, this.state);
    const action = actionFromProjection(view, target.dataset.actionId);
    if (!action) return;
    if (action.valid === false) return globalThis.ui?.notifications?.warn?.(action.errors?.[0] ?? "This action cannot be prepared.");
    const configurable = (action.generated && action.operation === "fire") || action.isSpell || action.composer?.length || action.enhancements?.length || action.augments?.length || action.rankScaling?.enabled;
    if (configurable) return this.openComposer(action, { preparing: true });
    await prepareHudAction(this.actor, action.id, {}, view.targetTokens);
    globalThis.ui?.notifications?.info?.(`${action.name} is prepared for your turn.`);
    this.refresh(["workspace", "target"]);
  }

  static async onPrepareComposer() {
    const form = this.element.querySelector(".vr-hud-composer");
    const selections = form ? Object.fromEntries(new FormData(form)) : this.state.composerSelections;
    const view = buildHudProjection(this.actor, { ...this.state, composerSelections: selections });
    const action = view.composer?.action;
    if (!action) return;
    if (action.valid === false) return globalThis.ui?.notifications?.warn?.(action.errors?.[0] ?? "Finish configuring this action before preparing it.");
    await prepareHudAction(this.actor, action.id, selections, view.targetTokens);
    globalThis.ui?.notifications?.info?.(`${action.name} is prepared for your turn.`);
    this.state = { ...this.state, workspace: HUD_WORKSPACES.NORMAL, composerActionId: "", composerSelections: {}, composerPreparing: false, calculationOpen: false };
    this.refresh(["workspace", "target"]);
  }

  static async onExecutePrepared(event, target) {
    const view = buildHudProjection(this.actor, this.state);
    const prepared = view.prepared.find(entry => entry.preparedId === target.dataset.preparedId);
    if (!prepared) return;
    const result = await executeHudAction(this.actor, prepared, { selections: prepared.selections, targetToken: view.targetTokens[0] ?? null });
    if (result.success) await removePreparedHudAction(this.actor, prepared.preparedId);
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  static async onRemovePrepared(event, target) {
    await removePreparedHudAction(this.actor, target.dataset.preparedId);
    this.render({ parts: ["workspace"] });
  }

  static async onExecuteComposer() {
    const form = this.element.querySelector(".vr-hud-composer");
    const selections = form ? Object.fromEntries(new FormData(form)) : this.state.composerSelections;
    const id = this.state.composerActionId;
    const view = buildHudProjection(this.actor, this.state);
    const result = await executeHudAction(this.actor, id, { selections, targetToken: view.targetTokens[0] ?? null });
    if (result.success) this.state = { ...this.state, workspace: HUD_WORKSPACES.NORMAL, composerActionId: "", composerSelections: {}, composerPreparing: false, calculationOpen: false };
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  static async onPinAction(event, target) {
    await togglePinnedAction(this.actor, target.dataset.actionId);
    this.render({ parts: ["workspace"] });
  }

  static onSwitchWeapon() {
    this.state.workspace = HUD_WORKSPACES.WEAPONS;
    this.state.weaponFilter ??= "all";
    this.render({ parts: ["workspace"] });
  }

  static async onEquipWeapon(event, target) {
    const weapon = this.actor.items.get(target.dataset.weaponId);
    if (!weapon || !await switchEquippedWeapon(this.actor, weapon)) return;
    const preferences = getHudPreferences(this.actor);
    await setHudPreferences(this.actor, { recentWeapons: [weapon.id, ...(preferences.recentWeapons ?? []).filter(id => id !== weapon.id)].slice(0, 8) });
    this.state.workspace = HUD_WORKSPACES.NORMAL;
    this.refresh(["self", "workspace", "economy"]);
  }

  static onSetWeaponFilter(event, target) {
    this.state.weaponFilter = target.dataset.weaponFilter || "all";
    this.render({ parts: ["workspace"] });
  }

  static onOpenEquipped(event, target) {
    const itemId = target.dataset.itemId;
    const view = buildHudProjection(this.actor, this.state);
    const action = view.allActions.find(entry => entry.weaponId === itemId && entry.operation === "fire");
    if (action) this.openComposer(action);
    else this.actor.items.get(itemId)?.sheet?.render(true);
  }

  static async onRollSave(event, target) {
    const key = target.dataset.save;
    const modifier = Math.max(0, Number(this.actor.system?.saves?.[key]) || 0);
    const formula = game.settings.get(systemId(), "combatHudSaveFormula") || "1d10 + @modifier";
    const roll = await new Roll(formula, { modifier }).evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: `${foundry.utils.escapeHTML(this.actor.name)} — ${foundry.utils.escapeHTML(key)} Save${this.state.requestedSave?.dc ? ` vs DC ${Number(this.state.requestedSave.dc)}` : ""}` });
    this.state.requestedSave = null;
    this.render({ parts: ["workspace"] });
  }

  static async onSelectAsset(event, target) {
    this.state.selectedAssetUuid = target.dataset.assetUuid;
    this.state.workspace = HUD_WORKSPACES.ASSET;
    await setHudPreferences(this.actor, { selectedAssetUuid: this.state.selectedAssetUuid });
    this.render({ parts: ["workspace"] });
  }

  static async onGrantIntel(event, target) {
    if (!game.user.isGM) return;
    const token = buildHudProjection(this.actor, this.state).targetTokens[0] ?? null;
    if (token) await grantTargetIntel(token, this.actor, target.dataset.intelModule);
    this.refresh(["target", "workspace"]);
  }

  static async onToggleMotion() {
    const current = getHudPreferences(this.actor);
    await setHudPreferences(this.actor, { reducedMotion: !current.reducedMotion });
    this.refresh();
  }

  static onToggleParty() {
    this.state.partyOpen = this.state.partyOpen === false;
    this.render({ parts: ["party"] });
  }

  static onAdjustSpellModifier(event, target) {
    const modifier = target.closest("[data-spell-modifier]");
    const count = modifier?.querySelector("[data-spell-modifier-count]");
    const enabled = modifier?.querySelector("[data-spell-modifier-enabled]");
    if (!count || !enabled) return;
    const min = Number(count.min) || 0;
    const max = Number(count.max) || 100;
    const delta = Number(target.dataset.delta) || 0;
    const next = Math.min(max, Math.max(min, (Number(count.value) || 0) + delta));
    count.value = String(next);
    enabled.checked = next > 0;
    count.dispatchEvent(new Event("change", { bubbles: true }));
  }

  static async onUndoLastAction() {
    const result = await undoLastHudAction(this.actor);
    if (result.success) globalThis.ui?.notifications?.info?.(`${result.actionName} was undone.`);
    else globalThis.ui?.notifications?.warn?.(result.reason);
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  static async onUndoToHistory(event, target) {
    const result = await undoHudActionsThrough(this.actor, target.dataset.historyIndex);
    if (result.success) globalThis.ui?.notifications?.info?.(`Restored ${result.count} history ${result.count === 1 ? "entry" : "entries"} through ${result.actionName}.`);
    else globalThis.ui?.notifications?.warn?.(result.reason);
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  requestSave(request = {}) {
    if (request.actorUuid && ![this.actor?.uuid, this.actor?.id].includes(request.actorUuid)) return false;
    this.state.requestedSave = { key: request.key, dc: request.dc ?? null, label: request.label ?? `${request.key} Save` };
    this.state.workspace = HUD_WORKSPACES.SAVES;
    this.render({ parts: ["workspace"] });
    return true;
  }
}

let hud = null;
let refreshTimer = null;
const refresh = parts => {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => hud?.refresh(parts), 16);
};

function registerEffectVisibilityAuthoring() {
  Hooks.on("renderActiveEffectConfig", (app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    const form = root?.querySelector?.("form") ?? root;
    if (!form || form.querySelector("[name$='visibility.disclosure']")) return;
    const current = app.document?.flags?.[systemId()]?.visibility?.disclosure ?? EFFECT_DISCLOSURE.HIDDEN;
    const options = Object.values(EFFECT_DISCLOSURE).map(value => `<option value="${value}" ${value === current ? "selected" : ""}>${value}</option>`).join("");
    const group = document.createElement("div");
    group.className = "form-group";
    group.innerHTML = `<label>HUD Disclosure</label><div class="form-fields"><select name="flags.${systemId()}.visibility.disclosure">${options}</select></div>`;
    form.append(group);
  });
}

export function registerActionHud() {
  hud ??= new VeilrunnerActionHud();
  game.veilrunner = { ...(game.veilrunner ?? {}), actionHud: hud, refreshActionHud: refresh, executeAction: executeHudAction, requestSave: request => hud.requestSave(request), controlledCombatActor, getCombatEconomy };
  registerEffectVisibilityAuthoring();
  const syncCombatChrome = active => document.body?.classList.toggle("vr-combat-hud-active", Boolean(active));
  Hooks.once("ready", () => { syncCombatChrome(game.combat); hud.showForCombat(); });
  Hooks.on("createCombat", () => { syncCombatChrome(true); hud.showForCombat(); });
  Hooks.on("deleteCombat", () => { gmSelectedCombatActorId = ""; syncCombatChrome(false); hud.close({ animate: false }); });
  Hooks.on("updateCombat", async combat => {
    for (const combatant of game.veilrunner?.getActivePhaseCombatants?.() ?? [combat.combatant].filter(Boolean)) {
      const economy = getCombatEconomy(combatant.actor, combat);
      if (economy && economy.key !== economyCycleKey(combat) && (game.user.isGM || combatant.actor?.isOwner)) await resetCombatEconomy(combatant, combat);
    }
    refresh();
  });
  for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant"]) Hooks.on(hook, () => refresh());
  Hooks.on("targetToken", (user, token, targeted) => {
    if (user?.id !== game.user?.id) return;
    hud.state.targetTokens = localTargetTokens(user, token, targeted);
    refresh(["target", "workspace"]);
  });
  Hooks.on("canvasReady", () => {
    hud.state.targetTokens = localTargetTokens(globalThis.game?.user);
    refresh();
  });
  Hooks.on("controlToken", (token, controlled) => {
    if (game.user.isGM && controlled && token?.actor && combatantForActor(token.actor, game.combat)) gmSelectedCombatActorId = token.actor.id;
    refresh();
  });
  Hooks.on("updateActor", actor => refresh(actor.id === hud.actor?.id ? ["self", "workspace", "economy", "party"] : ["party", "target", "workspace"]));
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, () => refresh(["self", "workspace", "target", "party", "economy"]));
  Hooks.on("updateToken", () => refresh(["target", "workspace", "party", "economy"]));
  Hooks.on("moveToken", async (token, movement, operation, user) => {
    if (!operation?.isUndo) await recordHudMovementUndo(token, movement, user);
    refresh(["economy"]);
  });
  Hooks.on("recordToken", () => refresh(["economy"]));
  Hooks.on("updateUser", (user, changes) => {
    const hotbarChanged = foundry.utils.hasProperty(changes, "hotbar") || Object.keys(changes ?? {}).some(key => key === "hotbar" || key.startsWith("hotbar."));
    if (user.id === game.user.id && hotbarChanged) refresh(["economy", "workspace"]);
  });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !hud?.rendered || hud.state.workspace === HUD_WORKSPACES.NORMAL) return;
    hud.state = { ...hud.state, workspace: HUD_WORKSPACES.NORMAL, composerActionId: "", composerSelections: {}, composerPreparing: false, calculationOpen: false, requestedSave: null };
    hud.render({ parts: ["workspace", "economy"] });
  });
  window.addEventListener("resize", () => hud?.syncBounds());
  Hooks.on("collapseSidebar", () => syncHudBoundsDuringSidebarTransition(hud));
  Hooks.on("changeSidebarTab", () => window.requestAnimationFrame(() => hud?.syncBounds()));
  Hooks.on("renderSidebarTab", () => window.requestAnimationFrame(() => hud?.syncBounds()));
}
