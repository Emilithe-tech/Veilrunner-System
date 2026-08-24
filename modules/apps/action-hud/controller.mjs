import { buildHudProjection } from "./projection.mjs";
import { HUD_WORKSPACES, EFFECT_DISCLOSURE, systemId } from "./constants.mjs";
import { executeHudAction } from "./execution.mjs";
import { combatantForActor, economyCycleKey, ensureCombatEconomy, getCombatEconomy, resetCombatEconomy } from "./economy.mjs";
import { getHudPreferences, setHudPreferences, togglePinnedAction } from "./preferences.mjs";
import { switchEquippedWeapon } from "./weapons.mjs";
import { grantTargetIntel } from "./target-intel.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

function controlledCombatActor() {
  const combat = globalThis.game?.combat;
  if (!combat) return null;
  const controlled = (globalThis.canvas?.tokens?.controlled ?? []).map(token => token.actor).filter(actor => actor && combatantForActor(actor, combat) && (globalThis.game.user.isGM || actor.isOwner));
  if (controlled.length === 1) return controlled[0];
  const active = globalThis.game?.veilrunner?.getActivePhaseCombatants?.() ?? [combat.combatant].filter(Boolean);
  const owned = active.map(entry => entry.actor).find(actor => actor && actor.isOwner);
  if (owned) return owned;
  if (globalThis.game.user.isGM) return combat.combatant?.actor ?? null;
  return Array.from(combat.combatants ?? []).map(entry => entry.actor).find(actor => actor?.isOwner) ?? null;
}

function actionFromProjection(view, id) {
  return [...view.allActions, ...view.pinned, ...view.recent, ...view.context].find(action => action.id === id)
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
      toggleMotion: VeilrunnerActionHud.onToggleMotion
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
  state = { workspace: HUD_WORKSPACES.NORMAL, domain: "", query: "", composerActionId: "", composerSelections: {}, selectedAssetUuid: "", requestedSave: null };
  #searchTimer = null;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const view = buildHudProjection(this.actor, this.state);
    return { ...context, ...view, isGM: Boolean(game.user?.isGM), hud: this.state, workspaceNormal: this.state.workspace === HUD_WORKSPACES.NORMAL, workspaceLibrary: this.state.workspace === HUD_WORKSPACES.LIBRARY, workspaceWeapons: this.state.workspace === HUD_WORKSPACES.WEAPONS, workspaceComposer: this.state.workspace === HUD_WORKSPACES.COMPOSER, workspaceAsset: this.state.workspace === HUD_WORKSPACES.ASSET, workspaceSaves: this.state.workspace === HUD_WORKSPACES.SAVES, requestedSave: this.state.requestedSave };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.syncBounds();
    window.requestAnimationFrame(() => this.syncBounds());
    this.element.dataset.panState = context.panState;
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
    this.element.querySelectorAll("[data-composer-input]").forEach(input => input.addEventListener("change", () => {
      this.state.composerSelections = Object.fromEntries(new FormData(this.element.querySelector(".vr-hud-composer")));
      this.render({ parts: ["workspace", "economy"] });
    }));
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
  }

  async showForCombat() {
    const actor = controlledCombatActor();
    if (!actor) return this.close({ animate: false });
    const changed = actor.id !== this.actor?.id;
    this.actor = actor;
    if (changed) {
      const prefs = getHudPreferences(actor);
      this.state = { ...this.state, workspace: HUD_WORKSPACES.NORMAL, domain: prefs.filters.domain, query: prefs.filters.query, composerActionId: "", composerSelections: {}, selectedAssetUuid: prefs.selectedAssetUuid };
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
    if (this.state.workspace !== HUD_WORKSPACES.COMPOSER) this.state.composerActionId = "";
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
    if ((action.generated && action.operation === "fire") || action.composer?.length || action.enhancements?.length || action.augments?.length || action.rankScaling?.enabled) return this.openComposer(action);
    const actionActor = action.assetActorUuid ? view.assets.find(asset => asset.uuid === action.assetActorUuid)?.actor ?? this.actor : this.actor;
    await executeHudAction(actionActor, action);
    this.refresh(["self", "workspace", "economy", "target", "party"]);
  }

  openComposer(action) {
    const remembered = getHudPreferences(this.actor).remembered?.[action.id] ?? {};
    this.state = { ...this.state, workspace: HUD_WORKSPACES.COMPOSER, composerActionId: action.id, composerSelections: remembered };
    this.render({ parts: ["workspace", "economy"] });
  }

  static onOpenComposer(event, target) {
    const view = buildHudProjection(this.actor, this.state);
    const action = actionFromProjection(view, target.dataset.actionId);
    if (action) this.openComposer(action);
  }

  static async onExecuteComposer() {
    const form = this.element.querySelector(".vr-hud-composer");
    const selections = form ? Object.fromEntries(new FormData(form)) : this.state.composerSelections;
    const id = this.state.composerActionId;
    const result = await executeHudAction(this.actor, id, { selections });
    if (result.success) this.state = { ...this.state, workspace: HUD_WORKSPACES.NORMAL, composerActionId: "", composerSelections: {} };
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
    const token = [...game.user.targets][0];
    if (token) await grantTargetIntel(token, this.actor, target.dataset.intelModule);
    this.refresh(["target", "workspace"]);
  }

  static async onToggleMotion() {
    const current = getHudPreferences(this.actor);
    await setHudPreferences(this.actor, { reducedMotion: !current.reducedMotion });
    this.refresh();
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
  Hooks.on("deleteCombat", () => { syncCombatChrome(false); hud.close({ animate: false }); });
  Hooks.on("updateCombat", async combat => {
    for (const combatant of game.veilrunner?.getActivePhaseCombatants?.() ?? [combat.combatant].filter(Boolean)) {
      const economy = getCombatEconomy(combatant.actor, combat);
      if (economy && economy.key !== economyCycleKey(combat) && (game.user.isGM || combatant.actor?.isOwner)) await resetCombatEconomy(combatant, combat);
    }
    refresh();
  });
  for (const hook of ["createCombatant", "updateCombatant", "deleteCombatant", "controlToken", "targetToken", "canvasReady"]) Hooks.on(hook, () => refresh());
  Hooks.on("updateActor", actor => refresh(actor.id === hud.actor?.id ? ["self", "workspace", "economy", "party"] : ["party", "target", "workspace"]));
  for (const hook of ["createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(hook, () => refresh(["self", "workspace", "target", "party", "economy"]));
  Hooks.on("updateToken", () => refresh(["target", "workspace", "party"]));
  Hooks.on("updateUser", (user, changes) => {
    const hotbarChanged = foundry.utils.hasProperty(changes, "hotbar") || Object.keys(changes ?? {}).some(key => key === "hotbar" || key.startsWith("hotbar."));
    if (user.id === game.user.id && hotbarChanged) refresh(["economy", "workspace"]);
  });
  window.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !hud?.rendered || hud.state.workspace === HUD_WORKSPACES.NORMAL) return;
    hud.state = { ...hud.state, workspace: HUD_WORKSPACES.NORMAL, composerActionId: "", composerSelections: {}, requestedSave: null };
    hud.render({ parts: ["workspace", "economy"] });
  });
  window.addEventListener("resize", () => hud?.syncBounds());
  Hooks.on("collapseSidebar", () => window.requestAnimationFrame(() => hud?.syncBounds()));
  Hooks.on("changeSidebarTab", () => window.requestAnimationFrame(() => hud?.syncBounds()));
  Hooks.on("renderSidebarTab", () => window.requestAnimationFrame(() => hud?.syncBounds()));
}
