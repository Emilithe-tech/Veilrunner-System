const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

const ARMOR_TRAITS = ["pyro", "hydro", "cryo", "floral", "geo", "aero", "electric", "sonic", "light", "void"];
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
    this.element.querySelectorAll("[data-action='addArmorEntry']").forEach(button => {
      button.addEventListener("click", event => this.#onAddArmorEntry(event));
    });
    this.element.querySelectorAll("[data-action='removeArmorEntry']").forEach(button => {
      button.addEventListener("click", event => this.#onRemoveArmorEntry(event));
    });
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = super._prepareSubmitData(event, form, formData);
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
}
