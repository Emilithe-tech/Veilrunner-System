const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

import { bringVeilrunnerApplicationToFront } from "../helpers/application-layer.mjs";
import { itemHasCapability, SEMANTIC_ITEM_TYPES } from "../data/definitions/item-capabilities.mjs";
import { CanonicalDefinitionReader } from "../data/definitions/canonical-reader.mjs";
import { SEMANTIC_TYPE_DOMAINS } from "../data/definitions/canonical-id.mjs";
import { actionAuthoringContracts } from "./action-authoring.mjs";
import { firearmActionForItem, firearmLoadedState, executeFirearmAction } from "../items/firearms.mjs";
import { normalizeHudAction, itemHudActions } from "../apps/action-hud/discovery.mjs";
import { resolveActionConfiguration } from "../actions/action-configuration.mjs";
import { getHudPreferences, setHudPreferences, replaceHudPreferences } from "../apps/action-hud/preferences.mjs";
import { normalizeContractForm, contractArrayEdit } from "./contract-editor.mjs";
import { ITEM_TABS, ITEM_DETAIL_PATHS, projectItemOverview, projectItemDetails, projectActionCard, projectConfigurationChoices, humanize } from "./item-view.mjs";

const PART = "systems/veilrunner/templates/item/parts/";
const contents = collection => Array.from(collection?.contents ?? collection ?? []);

/** One player-facing sheet for canonical definitions and owned snapshots. */
export default class VeilrunnerItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  itemTab = "summary";
  previewSelections = {};
  definitionChoices = [];
  descriptionEditing = false;
  #hooks = [];
  #configurationQueue = Promise.resolve();

  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "item", "vr-universal-item"],
    position: { width: 1100, height: 830 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = { body: { template: "systems/veilrunner/templates/item/item-sheet.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.item;
    const actor = item.actor;
    const system = item.system?.toObject?.() ?? item.system ?? {};
    const physical = itemHasCapability(item, "inventory");
    const isGM = Boolean(game.user?.isGM);
    const canConfigure = Boolean(actor && this.isEditable && actor.isOwner);
    const remembered = actor ? getHudPreferences(actor).remembered : {};
    const sources = [];
    const firearm = firearmActionForItem(item, actor);
    if (firearm) sources.push(firearm);
    if (itemHasCapability(item, "actionProvider") && !physical) sources.push(item);
    sources.push(...itemHudActions(item, actor).map(action => action.source));
    for (const grant of contents(actor?.items)) {
      if (grant.getFlag?.(game.system.id, "grantedBy")?.startsWith(`${item.id}:`) && itemHasCapability(grant, "actionProvider") && !itemHasCapability(grant, "inventory")) sources.push(grant);
    }
    const actions = sources.map(source => {
      const normalized = normalizeHudAction(source, { actor });
      if (!actor) normalized.currentLevel = normalized.maxLevel;
      return resolveActionConfiguration(actor, normalized, this.previewSelections[normalized.id] ?? remembered[normalized.id] ?? {});
    });
    const primary = actions[0];
    const loaded = firearm ? firearmLoadedState(actor, item) : null;
    const overview = projectItemOverview(item, { action: primary, loaded, effectiveSystem: firearm?.effectiveSystem, isGM, localize: key => game.i18n.localize(key) });
    const cards = actions.flatMap(action => {
      if (!action.weaponComposer) return [projectActionCard(action)];
      return action.weaponComposer.modes.map((mode, index) => projectActionCard(
        resolveActionConfiguration(actor, action, { ...action.resolvedSelections, fireMode: mode.id }),
        { label: mode.label, group: index ? "Alternate actions" : "Primary actions" }
      ));
    });
    const configurations = actions.map(action => ({ id: action.id, label: action.weaponComposer ? "Firing configuration" : action.name,
      choices: projectConfigurationChoices(action), breakdown: action.breakdown,
      comparison: this.#comparison(action, actor), preview: !canConfigure,
      hasSelections: Object.keys(this.previewSelections[action.id] ?? remembered[action.id] ?? {}).length > 0
    })).filter(entry => entry.choices.length);
    const descriptionValue = String(physical ? system.description?.value ?? "" : system.description ?? "");
    const enrich = value => foundry.applications.ux.TextEditor.enrichHTML(value, { secrets: item.isOwner, relativeTo: item });
    const [descriptionHTML, mechanicsHTML, gmDescriptionHTML] = await Promise.all([
      enrich(descriptionValue), enrich(String(system.mechanics ?? "")), isGM && physical ? enrich(String(system.description?.gm ?? "")) : ""
    ]);
    await foundry.applications.handlebars.loadTemplates(["rows", "summary", "actions", "configuration", "details", "field"].map(name => `${PART}${name}.hbs`));
    const catalogs = { definitions: this.definitionChoices, types: SEMANTIC_ITEM_TYPES,
      actorTypes: Object.keys(CONFIG.Actor.dataModels), effects: (CONFIG.statusEffects ?? []).map(effect => ({ id: effect.id, name: game.i18n.localize(effect.name ?? effect.label ?? effect.id) })),
      traits: game.settings.get(game.system.id, "actionTraits") ?? [], localize: key => game.i18n.localize(key),
      containers: contents(actor?.items).filter(entry => entry.type === "container" && entry !== item) };
    Object.assign(context, { id: this.id, item, system, overview, isGM, physical, canConfigure,
      editable: this.isEditable, descriptionEditing: this.descriptionEditing && this.isEditable,
      descriptionPath: physical ? "system.description.value" : "system.description", descriptionValue, descriptionHTML, mechanicsHTML, gmDescriptionHTML,
      actionGroups: [...new Set(cards.map(card => card.group))].map(label => ({ label, cards: cards.filter(card => card.group === label) })),
      configurations, details: this.itemTab === "details" ? projectItemDetails(item, catalogs, this.isEditable) : [],
      tabs: ITEM_TABS.map(tab => ({ ...tab, active: tab.id === this.itemTab })),
      tabSummary: this.itemTab === "summary", tabActions: this.itemTab === "actions", tabConfiguration: this.itemTab === "configuration", tabDetails: this.itemTab === "details",
      magazine: loaded?.mode === "detachable" ? { name: loaded.magazine?.name ?? "Empty slot", installed: Boolean(loaded.magazine),
        img: loaded.magazine?.img, rounds: loaded.rounds, capacity: loaded.capacity } : null,
      internalAmmo: loaded?.mode === "internal" ? { name: loaded.internal?.name || "Internal magazine", rounds: loaded.rounds, capacity: loaded.capacity } : null,
      ammoName: loaded?.magazine?.system?.ammoName || loaded?.internal?.name || "",
      definitionTypes: SEMANTIC_ITEM_TYPES.map(type => ({ value: type, label: humanize(type) }))
    });
    return context;
  }

  #comparison(action, actor) {
    const base = resolveActionConfiguration(actor, action, {});
    return [
      ["Damage", base.damageOutcome?.available ? base.damageOutcome.formula : "", action.damageOutcome?.available ? action.damageOutcome.formula : ""],
      ["Actions", base.economy.actions, action.economy.actions], ["Range", base.range, action.range],
      ...Object.keys(action.costs ?? {}).map(key => [humanize(key), base.costs?.[key] ?? 0, action.costs[key]])
    ].filter(([, before, after]) => before !== "" && (before || after)).map(([label, before, after]) => ({ label, before, after,
      change: typeof before === "number" && before !== after ? `${after > before ? "+" : ""}${after - before}` : "", changed: before !== after }));
  }

  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    this.element.querySelectorAll("[data-item-tab], [data-configuration], [data-sheet-action='openDefinition'], [data-sheet-action='resetConfiguration']").forEach(control => { control.disabled = false; });
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (!this.#hooks.length) {
      const refresh = document => {
        if (document !== this.item && this.item.actor && (document?.parent === this.item.actor || document === this.item.actor)) this.render();
      };
      this.#hooks.push(["updateItem", Hooks.on("updateItem", refresh)], ["updateActor", Hooks.on("updateActor", refresh)],
        ["updateCompendium", Hooks.on("updateCompendium", () => { this.definitionChoices = []; })],
        ["updateUser", Hooks.on("updateUser", user => { if (this.item.actor && user === game.user) { this.previewSelections = {}; this.render(); } })]);
    }
    if (!this.element.dataset.veilrunnerFrontBinding) {
      this.element.dataset.veilrunnerFrontBinding = "true";
      this.element.addEventListener("pointerdown", () => bringVeilrunnerApplicationToFront(this.element, this), { passive: true });
    }
    this.element.querySelectorAll("[data-item-tab]").forEach(button => button.addEventListener("click", () => {
      const tab = button.dataset.itemTab;
      if (!ITEM_TABS.some(entry => entry.id === tab) || tab === this.itemTab) return;
      this.itemTab = tab;
      this.descriptionEditing = false;
      this.render();
    }));
    this.element.querySelectorAll("[data-sheet-action]").forEach(button => button.addEventListener("click", event => {
      event.preventDefault();
      this.#dispatch(button).catch(error => { console.error("Veilrunner | Item sheet", error); ui.notifications.error(error.message); });
    }));
  }

  _onChangeForm(formConfig, event) {
    if (event.target.matches("[data-configuration]")) {
      const control = event.target;
      if (!control.reportValidity()) return;
      const id = control.closest("[data-configuration-id]").dataset.configurationId;
      const value = control.type === "checkbox" ? (control.checked ? "1" : "") : control.value;
      this.#configurationQueue = this.#configurationQueue.then(async () => {
        const remembered = this.item.actor ? getHudPreferences(this.item.actor).remembered : {};
        const selections = { ...(this.previewSelections[id] ?? remembered[id] ?? {}), [control.dataset.configuration]: value };
        if (control.dataset.enableKey) selections[control.dataset.enableKey] = Number(value) > 0 ? "1" : "0";
        if (control.dataset.configuration === "augment") selections.augmentRank = control.selectedOptions[0]?.dataset.minRank || "1";
        this.previewSelections[id] = selections;
        if (this.item.actor && this.isEditable && this.item.actor.isOwner) await setHudPreferences(this.item.actor, { remembered: { ...remembered, [id]: selections } });
        await this.render();
      }).catch(error => { console.error("Veilrunner | Item configuration", error); ui.notifications.error(error.message); });
      return;
    }
    if (event.target.matches("[data-reference-type]")) return;
    return super._onChangeForm(formConfig, event);
  }

  _prepareSubmitData(event, form, formData, updateData) {
    if (!this.isEditable) return {};
    return super._prepareSubmitData(event, form, formData, updateData);
  }

  _processFormData(event, form, formData) {
    // V14 validates and cleans after this hook. Rebuild array rows before that
    // cleaning step can discard numeric-keyed form objects.
    const submitted = super._processFormData(event, form, formData);
    if (!this.isEditable) return {};
    const schema = this.item.system.schema ?? this.item.system.constructor.schema;
    const current = this.item.system.toObject();
    if (submitted.system || submitted.contractArrays) submitted.system = normalizeContractForm(schema, submitted.system ?? {}, current, submitted.contractArrays ?? {}, ITEM_DETAIL_PATHS);
    delete submitted.contractArrays;
    if (submitted.system) { delete submitted.system.definitionId; delete submitted.system.quantity; delete submitted.system.owned; }
    if (submitted.system && itemHasCapability(this.item, "actionProvider") && !itemHasCapability(this.item, "inventory")) {
      submitted.system = actionAuthoringContracts(current, submitted.system, { actorOwned: Boolean(this.item.actor) });
    }
    if (this.item.type === "weapon" && submitted.system?.handedness !== undefined) submitted.system.requiredSlots = submitted.system.handedness === "two" ? ["mainHand", "offhand"] : ["mainHand"];
    return submitted;
  }

  async #dispatch(button) {
    const action = button.dataset.sheetAction;
    if (action === "resetConfiguration") {
      const id = button.closest("[data-configuration-id]").dataset.configurationId;
      this.previewSelections[id] = {};
      if (this.item.actor && this.isEditable && this.item.actor.isOwner) {
        const preferences = getHudPreferences(this.item.actor);
        preferences.remembered = { ...preferences.remembered };
        delete preferences.remembered[id];
        await replaceHudPreferences(this.item.actor, preferences);
      }
      return this.render();
    }
    if (action === "openDefinition") {
      const id = button.dataset.definitionId;
      const domain = String(id ?? "").split(".")[1];
      const types = SEMANTIC_ITEM_TYPES.filter(type => SEMANTIC_TYPE_DOMAINS[type] === domain);
      if (!types.length) throw new Error("This reference has no canonical definition route.");
      const document = await new CanonicalDefinitionReader(types).resolve(id);
      return document.sheet.render(true);
    }
    if (action === "editDescription" && this.isEditable) { this.descriptionEditing = !this.descriptionEditing; return this.render(); }
    if (action === "firearm" && this.isEditable && this.item.actor?.isOwner) {
      await executeFirearmAction(this.item.actor, this.item.id, button.dataset.operation);
      return this.render();
    }
    if (!this.isEditable) return;
    if (action === "loadDefinitions") {
      const type = this.element.querySelector("[data-reference-type]")?.value;
      if (!SEMANTIC_ITEM_TYPES.includes(type)) return;
      this.definitionChoices = await new CanonicalDefinitionReader([type]).records();
      return this.render();
    }
    if (action === "arrayAdd" || action === "arrayRemove") {
      await this.submit({ preventClose: true });
      const path = button.dataset.path;
      const value = contractArrayEdit(this.item.system.schema ?? this.item.system.constructor.schema, this.item.system.toObject(), path,
        { remove: action === "arrayRemove" ? Number(button.dataset.index) : null, createId: () => foundry.utils.randomID(), roots: ITEM_DETAIL_PATHS });
      await this.item.update({ [`system.${path}`]: value });
      return this.render();
    }
    if (action === "artwork") {
      const FilePickerClass = foundry.applications.apps.FilePicker.implementation;
      const picker = new FilePickerClass({ type: "image", current: this.item.img, callback: async path => { if (path) await this.item.update({ img: path }); } });
      return picker.browse();
    }
  }

  async close(options) {
    for (const [name, id] of this.#hooks) Hooks.off(name, id);
    this.#hooks = [];
    return super.close(options);
  }
}
