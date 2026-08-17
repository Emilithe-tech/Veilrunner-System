const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

import { bringVeilrunnerApplicationToFront } from "../helpers/application-layer.mjs";
import {
  DAMAGE_TYPE_GROUPS, EQUIPMENT_SLOT_COLUMNS, EQUIPMENT_SLOTS, ITEM_RARITIES,
  PHYSICAL_ITEM_TYPES, RULE_ELEMENT_KEYS, WEAPON_TYPE_GROUPS, itemRarityData
} from "../data/item/physical.mjs";
import { itemRequiredSlots, normalizeRuleElement, validateRuleElement } from "../rules/item-rules.mjs";
import { VEILRUNNER_SETTINGS } from "../settings.mjs";

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

function normalizeTextList(value) {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : String(value ?? "").split(/[,\n]/);
  return [...new Set(values.map(entry => String(entry ?? "").trim()).filter(Boolean))];
}

function collectionContents(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  if (collection?.[Symbol.iterator]) return [...collection];
  return [];
}

function physicalItemTraitCatalog(currentItem) {
  const selected = new Set(normalizeTextList(currentItem?.system?.traits).map(trait => trait.toLowerCase()));
  const catalog = new Map();
  const remember = trait => {
    const label = String(trait ?? "").trim();
    if (!label) return null;
    const key = label.toLowerCase();
    if (!catalog.has(key)) catalog.set(key, { trait: label, references: new Set() });
    return catalog.get(key);
  };
  for (const trait of normalizeTextList(game.settings.get(game.system.id, VEILRUNNER_SETTINGS.physicalItemTraits))) remember(trait);

  const documents = new Map();
  for (const item of collectionContents(game.items)) if (item?.uuid) documents.set(item.uuid, item);
  for (const actor of collectionContents(game.actors)) {
    if (actor?.visible === false) continue;
    for (const item of collectionContents(actor.items)) if (item?.uuid) documents.set(item.uuid, item);
  }
  if (currentItem?.uuid) documents.set(currentItem.uuid, currentItem);
  for (const item of documents.values()) {
    if (!PHYSICAL_ITEM_TYPES.includes(item.type) || item.visible === false) continue;
    for (const trait of normalizeTextList(item.system?.traits)) remember(trait)?.references.add(item.uuid);
  }

  return [...catalog.entries()]
    .map(([key, entry]) => ({
      trait: entry.trait,
      selected: selected.has(key),
      referenceCount: entry.references.size
    }))
    .sort((left, right) => left.trait.localeCompare(right.trait, undefined, { sensitivity: "base" }));
}

function normalizePhysicalRules(entries = []) {
  return entryList(entries).map((entry, index) => normalizeRuleElement({
    ...entry,
    predicate: normalizeTextList(entry?.predicateText ?? entry?.predicate),
    choices: normalizeTextList(entry?.choicesText ?? entry?.choices)
  }, index));
}

/** Basic item sheet. */
export default class VeilrunnerItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  physicalTab = "summary";

  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "item"],
    position: { width: 720, height: 700 },
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
    context.isPhysical = PHYSICAL_ITEM_TYPES.includes(this.item.type);
    context.physicalType = this.item.type;
    context.isPhysicalWeapon = this.item.type === "weapon";
    context.isPhysicalAmmunition = this.item.type === "ammunition";
    context.isPhysicalMagazine = this.item.type === "magazine";
    context.isPhysicalArmor = this.item.type === "armor";
    context.isPhysicalAccessory = this.item.type === "accessory";
    context.isPhysicalShield = this.item.type === "shield";
    context.isPhysicalConsumable = this.item.type === "consumable";
    context.isPhysicalContainer = this.item.type === "container";
    context.isPhysicalEquipment = this.item.type === "equipment";
    context.isPhysicalTreasure = this.item.type === "treasure";
    context.physicalTab = this.physicalTab;
    context.physicalTabSummary = this.physicalTab === "summary";
    context.physicalTabDetails = this.physicalTab === "details";
    context.physicalTabSlots = this.physicalTab === "slots";
    context.physicalTabRules = this.physicalTab === "rules";
    context.equipmentSlots = EQUIPMENT_SLOTS;
    context.ruleElementKeys = RULE_ELEMENT_KEYS;
    context.itemRarity = itemRarityData(this.item);
    context.itemRarities = ITEM_RARITIES;
    context.weaponTypeGroups = WEAPON_TYPE_GROUPS;
    context.damageTypeGroups = DAMAGE_TYPE_GROUPS;
    const requiredSlots = new Set(itemRequiredSlots(this.item));
    context.itemEquipmentSlotColumns = Object.fromEntries(Object.entries(EQUIPMENT_SLOT_COLUMNS).map(([column, slots]) => [column, slots.map(slot => ({
      slot,
      selected: requiredSlots.has(slot),
      controlled: context.isPhysicalWeapon
    }))]));
    context.physicalTraits = normalizeTextList(context.system.traits).map((trait, index) => ({ trait, index }));
    context.physicalTraitsText = context.physicalTraits.map(entry => entry.trait).join(", ");
    context.physicalTraitCatalog = physicalItemTraitCatalog(this.item);
    context.compatibilityAmmoTypesText = (context.system.firearm?.compatibility?.ammoTypes ?? context.system.compatibility?.ammoTypes ?? []).join(", ");
    context.compatibilityAllowText = (context.system.firearm?.compatibility?.allow ?? context.system.compatibility?.allow ?? []).join(", ");
    context.compatibilityBlockText = (context.system.firearm?.compatibility?.block ?? context.system.compatibility?.block ?? []).join(", ");
    context.physicalRules = normalizePhysicalRules(context.system.rules).map(rule => ({
      ...rule,
      predicateText: rule.predicate.join(", "),
      choicesText: rule.choices.join(", "),
      validation: validateRuleElement(rule),
      isActiveEffectLike: rule.key === "ActiveEffectLike",
      isFlatModifier: rule.key === "FlatModifier",
      isRollOption: rule.key === "RollOption",
      isDamageDice: rule.key === "DamageDice",
      isResistance: rule.key === "Resistance",
      isWeakness: rule.key === "Weakness",
      isChoiceSet: rule.key === "ChoiceSet",
      isGrantItem: rule.key === "GrantItem",
      isItemAlteration: rule.key === "ItemAlteration",
      isDegreeOfSuccess: rule.key === "DegreeOfSuccess"
    }));
    context.isAction = this.item.type === "action";
    context.isAccessory = this.item.type === "accessory" && !context.isPhysical;
    context.isAbility = this.item.type === "ability";
    context.isActionOrAbility = context.isAction || context.isAbility;
    context.isArmor = this.item.type === "armor" && !context.isPhysical;
    context.isProfession = this.item.type === "profession";
    context.isTreasure = this.item.type === "treasure" && !context.isPhysical;
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
    context.actionRequiredItemTypesText = (context.system.requiredItemTypes ?? []).join(", ");
    context.actionRequiredItemTraitsText = (context.system.requiredItemTraits ?? []).join(", ");
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
    this.element.querySelectorAll("[data-action='setPhysicalTab']").forEach(button => button.addEventListener("click", event => this.#onSetPhysicalTab(event)));
    this.element.querySelectorAll("[data-action='addPhysicalRule']").forEach(button => button.addEventListener("click", event => this.#onAddPhysicalRule(event)));
    this.element.querySelectorAll("[data-action='removePhysicalRule']").forEach(button => button.addEventListener("click", event => this.#onRemovePhysicalRule(event)));
    this.element.querySelectorAll("[data-action='addPhysicalTrait']").forEach(button => button.addEventListener("click", event => this.#onAddPhysicalTrait(event)));
    this.element.querySelectorAll("[data-action='removePhysicalTrait']").forEach(button => button.addEventListener("click", event => this.#onRemovePhysicalTrait(event)));
    this.element.querySelectorAll("[data-action='togglePhysicalTrait']").forEach(button => button.addEventListener("click", event => this.#onTogglePhysicalTrait(event)));
    this.element.querySelectorAll("[data-physical-trait]").forEach(chip => {
      chip.addEventListener("dragstart", event => this.#onPhysicalTraitDragStart(event));
      chip.addEventListener("dragend", () => this.element.querySelector("[data-physical-trait-list]")?.classList.remove("drag-over"));
    });
    const traitList = this.element.querySelector("[data-physical-trait-list]");
    traitList?.addEventListener("dragover", event => { event.preventDefault(); traitList.classList.add("drag-over"); });
    traitList?.addEventListener("dragleave", event => { if (!traitList.contains(event.relatedTarget)) traitList.classList.remove("drag-over"); });
    traitList?.addEventListener("drop", event => this.#onPhysicalTraitDrop(event));
    this.element.querySelector("[data-physical-trait-input]")?.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.#onAddPhysicalTrait(event);
    });
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = super._prepareSubmitData(event, form, formData);
    if (PHYSICAL_ITEM_TYPES.includes(this.item.type)) {
      for (const path of ["system.traitsText", "system.requiredSlots", "system.rules"]) {
        if (!foundry.utils.hasProperty(submitData, path)) continue;
        if (path === "system.traitsText") {
          foundry.utils.setProperty(submitData, "system.traits", normalizeTextList(foundry.utils.getProperty(submitData, path)));
          foundry.utils.deleteProperty(submitData, path);
        } else if (path === "system.requiredSlots") {
          foundry.utils.setProperty(submitData, path, normalizeTextList(foundry.utils.getProperty(submitData, path)).filter(slot => EQUIPMENT_SLOTS.includes(slot)));
        } else {
          foundry.utils.setProperty(submitData, path, normalizePhysicalRules(foundry.utils.getProperty(submitData, path)));
        }
      }
      const compatibilityRoot = this.item.type === "weapon" ? "system.firearm.compatibility" : "system.compatibility";
      for (const key of ["ammoTypes", "allow", "block"]) {
        const textPath = `${compatibilityRoot}.${key}Text`;
        if (!foundry.utils.hasProperty(submitData, textPath)) continue;
        foundry.utils.setProperty(submitData, `${compatibilityRoot}.${key}`, normalizeTextList(foundry.utils.getProperty(submitData, textPath)));
        foundry.utils.deleteProperty(submitData, textPath);
      }
      if (this.item.type === "magazine") {
        const capacity = Math.max(0, Math.trunc(Number(foundry.utils.getProperty(submitData, "system.capacity")) || 0));
        const rounds = Math.min(capacity, Math.max(0, Math.trunc(Number(foundry.utils.getProperty(submitData, "system.rounds")) || 0)));
        foundry.utils.setProperty(submitData, "system.capacity", capacity);
        foundry.utils.setProperty(submitData, "system.rounds", rounds);
      }
      if (this.item.type === "weapon") {
        const handedness = foundry.utils.getProperty(submitData, "system.handedness") ?? this.item.system?.handedness;
        foundry.utils.setProperty(submitData, "system.handedness", handedness === "two" ? "two" : "one");
        foundry.utils.setProperty(submitData, "system.requiredSlots", handedness === "two" ? ["mainHand", "offhand"] : ["mainHand"]);
      }
    }
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
      if (this.item.type === "action") {
        for (const key of ["requiredItemTypes", "requiredItemTraits"]) {
          const textPath = `system.${key}Text`;
          if (!foundry.utils.hasProperty(submitData, textPath)) continue;
          foundry.utils.setProperty(submitData, `system.${key}`, normalizeTextList(foundry.utils.getProperty(submitData, textPath)));
          foundry.utils.deleteProperty(submitData, textPath);
        }
      }
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

  async #onSetPhysicalTab(event) {
    event.preventDefault();
    const tab = event.currentTarget?.dataset.tab;
    if (!["summary", "details", "rules"].includes(tab) || tab === this.physicalTab) return;
    this.physicalTab = tab;
    await this.submit({ preventClose: true });
    this.render();
  }

  async #onAddPhysicalRule(event) {
    event.preventDefault();
    await this.submit({ preventClose: true });
    const select = this.element.querySelector("[data-physical-rule-key]");
    const key = RULE_ELEMENT_KEYS.includes(select?.value) ? select.value : "FlatModifier";
    const current = normalizePhysicalRules(this.item.system?.rules ?? []);
    return this.item.update({ "system.rules": [...current, normalizeRuleElement({ key, label: game.i18n.localize(`VEILRUNNER.RuleElement.${key}`) }, current.length)] });
  }

  async #onRemovePhysicalRule(event) {
    event.preventDefault();
    const index = Number(event.currentTarget?.dataset.index);
    if (!Number.isInteger(index)) return;
    await this.submit({ preventClose: true });
    const current = normalizePhysicalRules(this.item.system?.rules ?? []);
    current.splice(index, 1);
    return this.item.update({ "system.rules": current });
  }

  async #onAddPhysicalTrait(event) {
    event.preventDefault();
    const input = this.element.querySelector("[data-physical-trait-input]");
    const trait = String(input?.value ?? "").trim();
    if (!trait) return;
    await this.submit({ preventClose: true });
    const current = normalizeTextList(this.item.system?.traits);
    if (current.some(entry => entry.toLowerCase() === trait.toLowerCase())) return;
    await this.#rememberPhysicalTrait(trait);
    return this.item.update({ "system.traits": [...current, trait] });
  }

  async #onTogglePhysicalTrait(event) {
    event.preventDefault();
    const trait = String(event.currentTarget?.dataset.trait ?? "").trim();
    if (!trait) return;
    await this.submit({ preventClose: true });
    const current = normalizeTextList(this.item.system?.traits);
    const index = current.findIndex(entry => entry.toLowerCase() === trait.toLowerCase());
    if (index >= 0) current.splice(index, 1);
    else {
      current.push(trait);
      await this.#rememberPhysicalTrait(trait);
    }
    return this.item.update({ "system.traits": current });
  }

  async #rememberPhysicalTrait(trait) {
    if (!game.user?.isGM) return;
    const current = normalizeTextList(game.settings.get(game.system.id, VEILRUNNER_SETTINGS.physicalItemTraits));
    if (current.some(entry => entry.toLowerCase() === trait.toLowerCase())) return;
    current.push(trait);
    current.sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }));
    await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.physicalItemTraits, current);
  }

  async #onRemovePhysicalTrait(event) {
    event.preventDefault();
    const index = Number(event.currentTarget?.dataset.index);
    if (!Number.isInteger(index)) return;
    await this.submit({ preventClose: true });
    const current = normalizeTextList(this.item.system?.traits);
    current.splice(index, 1);
    return this.item.update({ "system.traits": current });
  }

  #onPhysicalTraitDragStart(event) {
    const chip = event.currentTarget;
    const index = Number(chip.dataset.index);
    const trait = String(chip.dataset.physicalTrait ?? "");
    const fromCatalog = chip.dataset.traitCatalog === "true";
    event.dataTransfer.effectAllowed = "copyMove";
    event.dataTransfer.setData("text/plain", JSON.stringify({
      type: "VeilrunnerTrait",
      sourceItemUuid: fromCatalog ? "" : this.item.uuid,
      index,
      trait
    }));
  }

  async #onPhysicalTraitDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const list = event.currentTarget;
    list.classList.remove("drag-over");
    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData("text/plain"));
    } catch (_error) {
      return;
    }
    if (data?.type !== "VeilrunnerTrait" || !String(data.trait ?? "").trim()) return;
    const targetIndex = Number(event.target.closest?.("[data-physical-trait]")?.dataset.index);
    await this.submit({ preventClose: true });
    const traits = normalizeTextList(this.item.system?.traits);
    let insertAt = Number.isInteger(targetIndex) ? targetIndex : traits.length;
    if (data.sourceItemUuid === this.item.uuid) {
      const sourceIndex = Number(data.index);
      if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= traits.length) return;
      const [trait] = traits.splice(sourceIndex, 1);
      if (sourceIndex < insertAt) insertAt -= 1;
      traits.splice(Math.max(0, Math.min(insertAt, traits.length)), 0, trait);
    } else if (!traits.some(trait => trait.toLowerCase() === String(data.trait).toLowerCase())) {
      const trait = String(data.trait).trim();
      traits.splice(Math.max(0, Math.min(insertAt, traits.length)), 0, trait);
      await this.#rememberPhysicalTrait(trait);
    }
    return this.item.update({ "system.traits": traits });
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
