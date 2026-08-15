const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

import { bringVeilrunnerApplicationToFront } from "../helpers/application-layer.mjs";

const ARMOR_TRAITS = ["pyro", "hydro", "cryo", "floral", "geo", "aero", "electric", "sonic", "light", "void", "slashing", "bludgeoning", "piercing"];
const ARMOR_EFFECT_TARGETS = ["action", "trait", "attribute"];

function entryList(entries = []) {
  if (Array.isArray(entries)) return entries;
  if (entries && typeof entries === "object") return Object.values(entries);
  return [];
}

function normalizeArmorTraitEntries(entries = []) {
  return entryList(entries)
    .map(entry => ({
      trait: String(entry?.trait ?? entry?.type ?? "").trim(),
      level: Math.max(0, Number(entry?.level ?? entry?.value ?? 1) || 0)
    }))
    .filter(entry => entry.trait);
}

function normalizeArmorEffectEntries(entries = []) {
  return entryList(entries)
    .map(entry => ({
      targetType: ARMOR_EFFECT_TARGETS.includes(entry?.targetType) ? entry.targetType : "attribute",
      target: String(entry?.target ?? "").trim(),
      value: Number(entry?.value ?? 0) || 0,
      notes: String(entry?.notes ?? "").trim()
    }))
    .filter(entry => entry.target || entry.value || entry.notes);
}

function normalizeActionEffects(entries = []) {
  return entryList(entries).map(entry => ({
    scope: entry?.scope === "area" ? "area" : "actor",
    target: String(entry?.target ?? "").trim(), value: String(entry?.value ?? "").trim(),
    duration: String(entry?.duration ?? "").trim(), notes: String(entry?.notes ?? "").trim()
  })).filter(entry => entry.target);
}

/** Basic item sheet. */
export default class VeilrunnerItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "item"],
    position: { width: 480, height: 480 },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false }
  };

  static PARTS = {
    body: { template: "systems/veilrunner/templates/item/item-sheet.hbs" }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system ?? {};
    context.isAction = this.item.type === "action";
    context.isAccessory = this.item.type === "accessory";
    context.isAbility = this.item.type === "ability";
    context.isActionOrAbility = context.isAction || context.isAbility;
    context.isArmor = this.item.type === "armor";
    context.isProfession = this.item.type === "profession";
    context.isTreasure = this.item.type === "treasure";
    context.isCharacterOption = ["species", "origin", "background"].includes(this.item.type);
    context.characterOptionDescriptionLabel = {
      species: "VEILRUNNER.SpeciesItem.FIELDS.description.label",
      origin: "VEILRUNNER.OriginItem.FIELDS.description.label",
      background: "VEILRUNNER.BackgroundItem.FIELDS.description.label"
    }[this.item.type] ?? "";
    context.armorTraits = ARMOR_TRAITS;
    context.actionDamageTypes = ARMOR_TRAITS;
    context.traitsText = (context.system.traits ?? []).join(", ");
    context.actionTraits = (game.settings.get(game.system.id, "actionTraits") ?? []).filter(entry => !entry.retired);
    context.actionEffects = normalizeActionEffects(context.system.effects);
    const actionMaxLevel = Math.max(1, Number(context.system.maxLevel) || 1);
    context.actionLevelOptions = Array.from({ length: actionMaxLevel }, (_, index) => index + 1);
    context.armorEffectTargets = ARMOR_EFFECT_TARGETS;
    context.armorResistances = this.#withEmptyArmorTraitRow(context.system.resistances);
    context.armorWeaknesses = this.#withEmptyArmorTraitRow(context.system.weaknesses);
    context.armorEffects = this.#withEmptyArmorEffectRow(context.system.effects?.length ? context.system.effects : context.system.bonuses);
    context.isGM = game.user.isGM;
    return context;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.element && !this.element.dataset.veilrunnerFrontBinding) {
      this.element.dataset.veilrunnerFrontBinding = "true";
      this.element.addEventListener("pointerdown", () => bringVeilrunnerApplicationToFront(this.element, this), { passive: true });
    }
    this.element.querySelectorAll("[data-action='addArmorEntry']").forEach(button => {
      button.addEventListener("click", event => this.#onAddArmorEntry(event));
    });
    this.element.querySelectorAll("[data-action='removeArmorEntry']").forEach(button => {
      button.addEventListener("click", event => this.#onRemoveArmorEntry(event));
    });
    this.element.querySelectorAll("[data-action='addActionEffect']").forEach(button => button.addEventListener("click", event => this.#onAddActionEffect(event)));
    this.element.querySelectorAll("[data-action='removeActionEffect']").forEach(button => button.addEventListener("click", event => this.#onRemoveActionEffect(event)));
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = super._prepareSubmitData(event, form, formData);
    if (["action", "ability"].includes(this.item.type)) {
      const number = (path, minimum, fallback) => {
        const value = Number(foundry.utils.getProperty(submitData, path));
        return Math.max(minimum, Number.isFinite(value) ? Math.floor(value) : fallback);
      };
      const maxLevel = number("system.maxLevel", 1, 1);
      const currentLevel = Math.min(maxLevel, number("system.currentLevel", 1, 1));
      foundry.utils.setProperty(submitData, "system.maxLevel", maxLevel);
      foundry.utils.setProperty(submitData, "system.currentLevel", currentLevel);
      foundry.utils.setProperty(submitData, "system.damageDice", number("system.damageDice", 0, 0));
      foundry.utils.setProperty(submitData, "system.damageDie", number("system.damageDie", 2, 6));
      foundry.utils.setProperty(submitData, "system.damageLevelInterval", number("system.damageLevelInterval", 1, 3));
      if (this.item.type === "action" && foundry.utils.getProperty(submitData, "system.activationKind") === "ability") foundry.utils.setProperty(submitData, "system.actions", 0);
      const registry = game.settings.get(game.system.id, "actionTraits") ?? [];
      const traitIds = new Map(registry.flatMap(entry => [[String(entry.id).toLowerCase(), entry.id], [String(entry.label).toLowerCase(), entry.id]]));
      const traits = String(foundry.utils.getProperty(submitData, "system.traitsText") ?? "").split(",").map(value => value.trim()).filter(Boolean).map(value => traitIds.get(value.toLowerCase()) ?? value.toLowerCase().replace(/[^a-z0-9]+/g, "-")).filter(Boolean);
      foundry.utils.setProperty(submitData, "system.traits", [...new Set(traits)]);
      foundry.utils.deleteProperty(submitData, "system.traitsText");
      for (const key of ["mana", "stamina", "health"]) foundry.utils.setProperty(submitData, `system.resourceCosts.${key}`, number(`system.resourceCosts.${key}`, 0, 0));
      foundry.utils.setProperty(submitData, "system.tree.talentCost", number("system.tree.talentCost", 0, 1));
      foundry.utils.setProperty(submitData, "system.tree.rankCost", number("system.tree.rankCost", 0, 1));
      foundry.utils.setProperty(submitData, "system.tree.requiredLevel", number("system.tree.requiredLevel", 1, 1));
      if (foundry.utils.hasProperty(submitData, "system.effects")) foundry.utils.setProperty(submitData, "system.effects", normalizeActionEffects(foundry.utils.getProperty(submitData, "system.effects")));
    }
    if (["species", "origin", "background"].includes(this.item.type)
      && foundry.utils.hasProperty(submitData, "system.persona")) {
      const raw = foundry.utils.getProperty(submitData, "system.persona");
      const modifiers = Array.isArray(raw) ? raw : String(raw ?? "").split(/[\n,]/);
      foundry.utils.setProperty(submitData, "system.persona", modifiers.map(value => String(value).trim()).filter(Boolean));
    }
    if (this.item.type !== "armor") return submitData;

    for (const path of ["system.resistances", "system.weaknesses"]) {
      if (!foundry.utils.hasProperty(submitData, path)) continue;
      const entries = normalizeArmorTraitEntries(foundry.utils.getProperty(submitData, path));
      foundry.utils.setProperty(submitData, path, entries);
    }
    if (foundry.utils.hasProperty(submitData, "system.effects")) {
      const effects = normalizeArmorEffectEntries(foundry.utils.getProperty(submitData, "system.effects"));
      foundry.utils.setProperty(submitData, "system.effects", effects);
    }
    return submitData;
  }

  #withEmptyArmorTraitRow(entries = []) {
    const rows = normalizeArmorTraitEntries(entries);
    rows.push({ trait: "", level: 1, isEmpty: true });
    return rows;
  }

  #withEmptyArmorEffectRow(entries = []) {
    const rows = normalizeArmorEffectEntries(entries);
    rows.push({ targetType: "attribute", target: "", value: 0, notes: "", isEmpty: true });
    return rows;
  }

  async #onAddArmorEntry(event) {
    const path = event.currentTarget?.dataset.path;
    if (!path) return;
    await this.submit({ preventClose: true });
    const current = foundry.utils.getProperty(this.item.system, path) ?? [];
    const entry = path === "effects"
      ? { targetType: "attribute", target: "", value: 0, notes: "" }
      : { trait: ARMOR_TRAITS[0], level: 1 };
    return this.item.update({ [`system.${path}`]: [...entryList(current), entry] });
  }

  async #onRemoveArmorEntry(event) {
    const path = event.currentTarget?.dataset.path;
    const index = Number(event.currentTarget?.dataset.index);
    if (!path || !Number.isInteger(index)) return;
    await this.submit({ preventClose: true });
    const current = entryList(foundry.utils.getProperty(this.item.system, path) ?? []);
    current.splice(index, 1);
    return this.item.update({ [`system.${path}`]: current });
  }

  async #onAddActionEffect() {
    await this.submit({ preventClose: true });
    const current = entryList(this.item.system?.effects ?? []);
    return this.item.update({ "system.effects": [...current, { scope: "actor", target: "", value: "", duration: "", notes: "" }] });
  }

  async #onRemoveActionEffect(event) {
    const index = Number(event.currentTarget?.dataset.index);
    if (!Number.isInteger(index)) return;
    await this.submit({ preventClose: true });
    const current = entryList(this.item.system?.effects ?? []);
    current.splice(index, 1);
    return this.item.update({ "system.effects": current });
  }
}
