import assert from "node:assert/strict";
import fs from "node:fs";

class Field { constructor(options = {}) { this.options = options; } }
class SchemaField extends Field { constructor(fields, options = {}) { super(options); this.fields = fields; } }
class ArrayField extends Field { constructor(element, options = {}) { super(options); this.element = element; } }
class TypeDataModel { static migrateData(source) { return source; } }

const getProperty = (object, path) => String(path).split(".").reduce((value, part) => value?.[part], object);
const setProperty = (object, path, value) => {
  const parts = String(path).split(".");
  const last = parts.pop();
  const target = parts.reduce((entry, part) => entry[part] ??= {}, object);
  target[last] = value;
  return true;
};

globalThis.foundry = {
  abstract: { TypeDataModel },
  data: { fields: {
    ArrayField, BooleanField: Field, FilePathField: Field, HTMLField: Field,
    NumberField: Field, SchemaField, StringField: Field
  } },
  utils: {
    deepClone: value => structuredClone(value),
    escapeHTML: value => String(value),
    getProperty,
    setProperty
  }
};
globalThis.Actor = class {};
globalThis.Item = class {};
globalThis.CONFIG = { Actor: { dataModels: {} }, Item: { dataModels: {} }, Combat: {} };
globalThis.game = { system: { id: "Veilrunner" }, i18n: { localize: key => key } };
globalThis.ui = { notifications: { warn: () => undefined } };
globalThis.Roll = class {
  constructor(formula) { this.formula = formula; this.total = 7; }
  async evaluate() { return this; }
  async toMessage() { return this; }
};
globalThis.ChatMessage = { getSpeaker: () => ({}) };

const modelFiles = [
  "weapon", "ammunition", "magazine", "shield", "consumable", "container", "equipment", "armor", "accessory", "treasure"
];
for (const file of modelFiles) {
  const { default: Model } = await import(`../modules/data/item/${file}.mjs`);
  const schema = Model.defineSchema();
  assert.ok(schema.rules, `${file} exposes shared rules`);
  assert.ok(schema.requiredSlots, `${file} exposes slot restrictions`);
  assert.ok(schema.description, `${file} exposes descriptions`);
  assert.ok(schema.definitionId && schema.intents && schema.providedActionIds, `${file} exposes shared identity fields`);
  assert.ok(schema.durability.fields.wearRate, `${file} exposes durability wear rate`);
  assert.ok(schema.durability.fields.wearAmount, `${file} exposes durability wear amount`);
}

const { registerConfig } = await import("../modules/config.mjs");
registerConfig();
assert.ok(CONFIG.Item.dataModels.quality, "quality is registered in CONFIG.Item.dataModels");
assert.ok(CONFIG.Item.dataModels.perk, "perk is registered in CONFIG.Item.dataModels");
assert.ok(CONFIG.Item.dataModels.flaw, "flaw is registered in CONFIG.Item.dataModels");
const qualitySchema = CONFIG.Item.dataModels.quality.defineSchema();
assert.ok(qualitySchema.kind && qualitySchema.tier && qualitySchema.pillar, "quality exposes catalog identity fields");
assert.ok(qualitySchema.requirements.fields.requiredDefinitionIds, "quality exposes structured prerequisites");
for (const type of ["weapon", "ammunition", "magazine", "shield", "consumable", "container", "equipment"]) {
  assert.ok(CONFIG.Item.dataModels[type], `${type} is registered in CONFIG.Item.dataModels`);
}
const partialEquipmentUpdate = CONFIG.Actor.dataModels.hero.migrateData({ equipment: { mainHand: "weapon-1" } });
assert.equal(partialEquipmentUpdate.equipmentAssignments, undefined, "partial equipment updates do not replace the full assignment map");
const fullEquipment = Object.fromEntries(["head", "chest", "arms", "legs", "feet", "mainHand", "ears", "neck", "wrists", "leftRing", "rightRing", "offhand"].map(slot => [slot, ["mainHand", "offhand"].includes(slot) ? "weapon-1" : ""]));
assert.deepEqual(CONFIG.Actor.dataModels.hero.migrateData({ equipment: fullEquipment }).equipmentAssignments, [{ itemId: "weapon-1", slots: ["mainHand", "offhand"] }]);

const systemManifest = JSON.parse(fs.readFileSync(new URL("../system.json", import.meta.url), "utf8"));
const localization = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
assert.ok(systemManifest.documentTypes.Item.quality, "quality is declared in system.json");
assert.equal(localization.TYPES.Item.quality, "Perk / Flaw", "quality has a Create Item label");
assert.ok(systemManifest.documentTypes.Item.perk && systemManifest.documentTypes.Item.flaw, "perk and flaw are declared in system.json");
assert.equal(localization.TYPES.Item.perk, "Perk");
assert.equal(localization.TYPES.Item.flaw, "Flaw");
assert.ok(systemManifest.packs.some(pack => pack.name === "qualities-perks" && pack.type === "Item"), "Perks & Flaws Library is registered as an Item compendium");
for (const type of ["weapon", "ammunition", "magazine", "shield", "consumable", "container", "equipment"]) {
  assert.ok(systemManifest.documentTypes.Item[type], `${type} is declared in system.json`);
  assert.equal(typeof localization.TYPES.Item[type], "string", `${type} has a Create Item label`);
}

for (const relative of ["../templates/item/item-sheet.hbs", "../templates/item/parts/physical.hbs", "../templates/actor/hero/parts/main.hbs"]) {
  const template = fs.readFileSync(new URL(relative, import.meta.url), "utf8");
  const stack = [];
  for (const match of template.matchAll(/\{\{([#/](?:if|each|unless|with))\b[^}]*\}\}/g)) {
    const token = match[1];
    if (token.startsWith("#")) stack.push(token.slice(1));
    else assert.equal(stack.pop(), token.slice(1), `${relative} has balanced ${token}`);
  }
  assert.deepEqual(stack, [], `${relative} closes all Handlebars blocks`);
}
const physicalTemplate = fs.readFileSync(new URL("../templates/item/parts/physical.hbs", import.meta.url), "utf8");
const heroSheetSource = fs.readFileSync(new URL("../modules/sheets/hero-sheet.mjs", import.meta.url), "utf8");
const itemSheetSource = fs.readFileSync(new URL("../modules/sheets/item-sheet.mjs", import.meta.url), "utf8");
const settingsSource = fs.readFileSync(new URL("../modules/settings.mjs", import.meta.url), "utf8");
assert.match(heroSheetSource, /#inventoryItemFromTarget\(actor, target\)/);
assert.doesNotMatch(heroSheetSource, /#inventoryItemFromTarget\(target\)/,
  "inventory actions pass the bound sheet actor into their static helper");
assert.doesNotMatch(physicalTemplate, /name="system\.damage\.(?:dice|die)"/, "weapon sheet omits redundant damage dice fields");
assert.match(physicalTemplate, /name="system\.damage\.base"/);
assert.match(physicalTemplate, /name="system\.damage\.max"/);
assert.match(physicalTemplate, /name="system\.weaponType"><select|name="system\.weaponType"/);
assert.match(physicalTemplate, /name="system\.grade"/, "physical Item authoring exposes canonical Grade");
assert.match(physicalTemplate, /data-physical-trait-list/);
assert.match(physicalTemplate, /data-action="togglePhysicalTrait"/);
assert.match(physicalTemplate, /data-trait-catalog="true"/);
assert.match(itemSheetSource, /function physicalItemTraitCatalog/);
assert.match(itemSheetSource, /VEILRUNNER_SETTINGS\.physicalItemTraits/);
assert.match(settingsSource, /physicalItemTraits:\s*"physicalItemTraits"/);
assert.match(physicalTemplate, /class="vr-item-slot-layout"/);
assert.doesNotMatch(physicalTemplate, /data-tab="slots"/, "slots are part of Details rather than a separate tab");
for (const match of physicalTemplate.matchAll(/localize\s+['"]([^'"]+)['"]/g)) {
  assert.equal(typeof getProperty(localization, match[1]), "string", `${match[1]} is localized`);
}

const {
  applyResolvedChanges,
  itemRequiredSlots,
  resolveActorItemRules,
  stackedModifiers,
  validateRuleElement
} = await import("../modules/rules/item-rules.mjs");
const { executeFirearmAction, firearmActionsForActor, isAmmoCompatible, isMagazineCompatible } = await import("../modules/items/firearms.mjs");
const { equipPhysicalItem, equipmentAssignments, itemAcceptsEquipmentSlot, unequipPhysicalItem } = await import("../modules/items/equipment.mjs");
const { equipmentBySlot } = await import("../modules/rules/item-rules.mjs");
const {
  DAMAGE_TYPE_GROUPS, ITEM_RARITIES, WEAPON_TYPE_GROUPS,
  itemRarityData, migratePhysicalItemData, normalizeItemRarity, normalizeWeaponType
} = await import("../modules/data/item/physical.mjs");
const { default: WeaponModel, migrateWeaponData, parseDamageFormula } = await import("../modules/data/item/weapon.mjs");
const { nextDurabilityState } = await import("../modules/items/durability.mjs");

class ItemCollection extends Array {
  get contents() { return this; }
  get(id) { return this.find(item => item.id === id); }
}

const weapon = {
  id: "weapon-1", uuid: "Actor.hero.Item.weapon-1", name: "Test Pistol", type: "weapon", img: "pistol.webp",
  system: {
    definitionId: "veilrunner.weapon.test-pistol", intents: ["weapon", "equippable", "action-provider"],
    requiredSlots: ["mainHand", "offhand"], traits: ["firearm"], weaponKind: "firearm", actions: 1,
    attack: { formula: "1d10", selector: "attack" }, damage: { dice: 1, die: 6, modifier: 0, type: "piercing" },
    firearm: {
      magazineMode: "detachable", loadedMagazineId: "mag-1", capacity: 0,
      compatibility: { flexible: false, caliber: "9mm", ammoTypes: ["ballistic"], allowDefinitionIds: [], blockDefinitionIds: [], allow: [], block: [] }
    },
    rules: [
      { key: "RollOption", option: "weapon:ready", enabled: true, requiresEquipped: true },
      { key: "FlatModifier", selector: "attack", value: "2", type: "item", predicate: ["weapon:ready"], enabled: true, requiresEquipped: true },
      { key: "ActiveEffectLike", path: "attributes.physical.strength", value: "2", mode: "add", enabled: true, requiresEquipped: true }
    ]
  }
};
const magazine = {
  id: "mag-1", uuid: "Actor.hero.Item.mag-1", name: "9mm Magazine", type: "magazine", img: "mag.webp",
  system: { definitionId: "veilrunner.magazine.test-9mm", intents: ["market-sellable"], capacity: 10, rounds: 4, ammoId: "ammo-1", ammoCaliber: "9mm", ammoType: "ballistic", compatibility: { caliber: "9mm", ammoTypes: ["ballistic"], allowDefinitionIds: [], blockDefinitionIds: [], allow: [], block: [], flexible: false }, rules: [], requiredSlots: [] }
};
const ammo = {
  id: "ammo-1", uuid: "Actor.hero.Item.ammo-1", name: "9mm Rounds", type: "ammunition", img: "ammo.webp",
  system: { definitionId: "veilrunner.ammunition.test-9mm", intents: ["ammunition", "market-sellable"], quantity: 20, caliber: "9mm", ammoType: "ballistic", rules: [], requiredSlots: [] }
};
const accessory = {
  id: "item-2", uuid: "Actor.hero.Item.item-2", name: "Sight", type: "accessory",
  system: { requiredSlots: ["head"], rules: [
    { key: "FlatModifier", selector: "attack", value: "1", type: "item", enabled: true, requiresEquipped: true },
    { key: "FlatModifier", selector: "attack", value: "-1", type: "untyped", enabled: true, requiresEquipped: true }
  ] }
};
const actor = {
  id: "hero", type: "hero", isOwner: true,
  system: { equipment: { mainHand: weapon.id, offhand: weapon.id, head: accessory.id } },
  items: new ItemCollection(weapon, magazine, ammo, accessory)
};

assert.deepEqual(itemRequiredSlots(weapon), ["mainHand", "offhand"]);
const resolved = resolveActorItemRules(actor, { options: ["attack"], data: { attributes: { physical: { strength: 5 } } } });
assert.ok(resolved.options.has("weapon:ready"));
assert.equal(stackedModifiers(resolved, ["attack"]).total, 1, "typed modifiers stack and untyped modifiers accumulate");
const rollData = { attributes: { physical: { strength: 5 } } };
applyResolvedChanges(rollData, resolved);
assert.equal(rollData.attributes.physical.strength, 7);

assert.equal(isAmmoCompatible(weapon, ammo), true);
assert.equal(isMagazineCompatible(weapon, magazine), true);
weapon.system.firearm.compatibility.block = [ammo.id];
assert.equal(isAmmoCompatible(weapon, ammo), false, "explicit blocks override normal compatibility");
weapon.system.firearm.compatibility.block = [];
weapon.system.firearm.compatibility.blockDefinitionIds = [ammo.system.definitionId];
assert.equal(isAmmoCompatible(weapon, ammo), false, "canonical blocks override normal compatibility");
weapon.system.firearm.compatibility.blockDefinitionIds = [];
weapon.system.firearm.compatibility.allowDefinitionIds = [ammo.system.definitionId];
assert.equal(isAmmoCompatible(weapon, ammo), true, "canonical definition IDs support specific ammunition compatibility");
weapon.system.firearm.compatibility.allowDefinitionIds = [];
assert.equal(validateRuleElement({ key: "ActiveEffectLike", path: "__proto__.unsafe" }).valid, false);
const { default: MagazineModel } = await import("../modules/data/item/magazine.mjs");
assert.equal(MagazineModel.migrateData({ capacity: 4, rounds: 9 }).rounds, 4);

const actions = firearmActionsForActor(actor);
assert.ok(actions.some(action => action.operation === "fire" && !action.disabled));
assert.ok(actions.some(action => action.operation === "reload"));
assert.ok(actions.some(action => action.operation === "unload"));

assert.deepEqual(migratePhysicalItemData({ equipmentSlot: "mainHand", cost: 12 }), {
  equipmentSlot: "mainHand", requiredSlots: ["mainHand"], cost: 12, price: 12
});
assert.deepEqual(ITEM_RARITIES.map(({ tier, name, color }) => [tier, name, color]), [
  [1, "Salvage", "#52525B"], [2, "Crude", "#9A3412"], [3, "Common", "#E2E8F0"],
  [4, "Uncommon", "#22C55E"], [5, "Superior", "#0284C7"], [6, "Rare", "#2563EB"],
  [7, "Epic", "#9333EA"], [8, "Renowned", "#E11D48"], [9, "Legendary", "#F97316"],
  [10, "Mythic", "#06B6D4"], [11, "Artisan", "#FACC15"], [12, "Unique", "#FF007F"]
]);
assert.equal(normalizeItemRarity("Ash White"), "common", "legacy color names normalize to rarity slugs");
assert.equal(migratePhysicalItemData({ rarity: "Legendary" }).rarity, "legendary");
assert.equal(migratePhysicalItemData({ grade: 0 }).grade, 1, "physical Item Grade is a positive integer");
assert.equal(itemRarityData({ system: { rarity: "unique" } }).color, "#FF007F");
assert.deepEqual(WEAPON_TYPE_GROUPS.map(group => group.key), ["arcane", "blades", "finesse", "martial", "lightFirearms", "mediumFirearms", "heavyFirearms"]);
assert.equal(WEAPON_TYPE_GROUPS.flatMap(group => group.types).length, 23, "one catalog mirrors every Weapons compendium subtype folder");
assert.equal(WEAPON_TYPE_GROUPS.at(-1).types.at(-1), "projector", "Projector is the final weapon option");
assert.equal(normalizeWeaponType("Heavy Rifles"), "marksmanRifle", "legacy weapon types migrate to the compendium roster");
assert.deepEqual(DAMAGE_TYPE_GROUPS.map(group => group.key), ["physical", "elemental", "cosmic"]);
assert.deepEqual(parseDamageFormula("1d10"), { dice: 1, die: 10 });
assert.equal(parseDamageFormula("2d8 + 3"), null, "only a simple dice term is derived into dice and die parts");
assert.deepEqual(migrateWeaponData({ damage: { dice: 1, die: 10, modifier: 2 }, requiredSlots: ["mainHand", "offhand"] }), {
  damage: { base: "1d10", max: "1d10", modifier: 2 }, requiredSlots: ["mainHand", "offhand"], handedness: "two"
});
const weaponSchema = WeaponModel.defineSchema();
assert.ok(weaponSchema.damage.fields.base && weaponSchema.damage.fields.max, "weapons store base and maximum damage formulas");
assert.equal(weaponSchema.damage.fields.dice, undefined, "redundant damage dice field is removed");
assert.equal(weaponSchema.damage.fields.die, undefined, "redundant damage die field is removed");
assert.deepEqual(nextDurabilityState({ value: 10, max: 10, wearRate: 2, wearAmount: 3, wearProgress: 1 }, 1), {
  value: 7, max: 10, wearRate: 2, wearAmount: 3, wearProgress: 0
});
assert.deepEqual(equipmentAssignments({ mainHand: "two-hand", offhand: "two-hand", head: "hat" }), [
  { itemId: "hat", slots: ["head"] },
  { itemId: "two-hand", slots: ["mainHand", "offhand"] }
]);
assert.deepEqual(equipmentBySlot({ system: {
  equipment: { head: "legacy-hat" },
  equipmentAssignments: [{ itemId: "assignment-hat", slots: ["head"] }, { itemId: "two-hand", slots: ["mainHand", "offhand"] }]
} }), { head: "legacy-hat", mainHand: "two-hand", offhand: "two-hand" }, "drawer state includes assignment-only Items without displacing stable keys");

const twoHanded = { id: "two-hand", uuid: "Actor.equip.Item.two-hand", name: "Two-Handed Weapon", type: "weapon", parent: { id: "equip" }, system: { requiredSlots: ["mainHand", "offhand"], rules: [] } };
assert.equal(itemAcceptsEquipmentSlot(twoHanded, "mainHand"), true);
assert.equal(itemAcceptsEquipmentSlot(twoHanded, "head"), false);
const equipActor = {
  id: "equip", type: "hero", isOwner: true, system: { equipment: {} }, items: new ItemCollection(twoHanded),
  async update(changes) { for (const [path, value] of Object.entries(changes)) setProperty(this, path, value); },
  async createEmbeddedDocuments() {}, async deleteEmbeddedDocuments() {}
};
assert.equal(await equipPhysicalItem(equipActor, twoHanded), true);
assert.equal(equipActor.system.equipment.mainHand, twoHanded.id);
assert.equal(equipActor.system.equipment.offhand, twoHanded.id);
assert.deepEqual(equipActor.system.equipmentAssignments, [{ itemId: twoHanded.id, slots: ["mainHand", "offhand"] }]);
const grantedItem = {
  id: "granted-item",
  flags: { Veilrunner: { grantedBy: `${twoHanded.id}:test-grant`, grantDuration: "while-equipped" } },
  getFlag(scope, key) {
    assert.equal(scope, game.system.id, "equipment grant flags use the active Foundry system scope");
    return this.flags?.[scope]?.[key];
  }
};
equipActor.items.push(grantedItem);
let deletedGrantIds = [];
equipActor.deleteEmbeddedDocuments = async (type, ids) => {
  assert.equal(type, "Item");
  deletedGrantIds = ids;
};
assert.equal(await unequipPhysicalItem(equipActor, twoHanded), true);
assert.deepEqual([...deletedGrantIds], [grantedItem.id]);
assert.equal(equipActor.system.equipment.mainHand, "");
assert.equal(equipActor.system.equipment.offhand, "");
const blocker = { id: "blocker", name: "Occupied Item", type: "equipment", parent: { id: "blocked" }, system: { requiredSlots: ["offhand"], rules: [] } };
const blockedItem = { ...twoHanded, parent: { id: "blocked" } };
const blockedActor = { ...equipActor, id: "blocked", system: { equipment: { offhand: blocker.id } }, items: new ItemCollection(blocker, blockedItem) };
assert.equal(await equipPhysicalItem(blockedActor, blockedItem), undefined, "slot conflicts are rejected");
assert.equal(blockedActor.system.equipment.offhand, blocker.id);

const internalWeapon = {
  id: "internal-gun", uuid: "Actor.firearm.Item.internal-gun", name: "Internal Pistol", type: "weapon", img: "gun.webp",
  system: {
    requiredSlots: ["mainHand"], traits: ["firearm"], weaponKind: "firearm", actions: 1,
    attack: { formula: "1d10", selector: "attack" }, damage: { dice: 1, die: 6, modifier: 0, type: "piercing" }, rules: [],
    firearm: { magazineMode: "internal", capacity: 6, internal: { quantity: 0, ammoId: "", sourceAmmoId: "", name: "", img: "", caliber: "", ammoType: "" }, compatibility: { caliber: "9mm", ammoTypes: ["ballistic"], allow: [], block: [], flexible: false } }
  },
  async update(changes) { for (const [path, value] of Object.entries(changes)) setProperty(this, path, value); }
};
const internalAmmo = { ...ammo, id: "internal-ammo", uuid: "Actor.firearm.Item.internal-ammo", system: { ...ammo.system, quantity: 10 } };
const firearmActor = {
  id: "firearm", type: "hero", isOwner: true, system: { equipment: { mainHand: internalWeapon.id } },
  items: new ItemCollection(internalWeapon, internalAmmo),
  async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "Item");
    for (const update of updates) {
      const document = this.items.get(update._id);
      for (const [path, value] of Object.entries(update)) if (path !== "_id") setProperty(document, path, value);
    }
  },
  async createEmbeddedDocuments() { throw new Error("unexpected recovery stack"); },
  getItemRuleContext() { return { resolved: { alterations: [], damageDice: [] }, modifiers: { total: 0 }, rollData: {} }; }
};
assert.equal(await executeFirearmAction(firearmActor, internalWeapon.id, "reload"), true);
assert.equal(internalWeapon.system.firearm.internal.quantity, 6);
assert.equal(internalAmmo.system.quantity, 4);
assert.equal(await executeFirearmAction(firearmActor, internalWeapon.id, "unload"), true);
assert.equal(internalWeapon.system.firearm.internal.quantity, 0);
assert.equal(internalAmmo.system.quantity, 10);
assert.equal(await executeFirearmAction(firearmActor, internalWeapon.id, "reload"), true);
assert.equal(await executeFirearmAction(firearmActor, internalWeapon.id, "fire"), true);
assert.equal(internalWeapon.system.firearm.internal.quantity, 5, "firing consumes exactly one internal round");

const orphanWeapon = JSON.parse(JSON.stringify(internalWeapon));
orphanWeapon.id = "orphan-gun";
orphanWeapon.system.firearm.internal = { quantity: 2, ammoId: "missing-ammo", sourceAmmoId: "missing-ammo", name: "Recovered 9mm", img: "ammo.webp", caliber: "9mm", ammoType: "ballistic" };
let recovered = null;
const orphanActor = {
  id: "orphan", type: "hero", isOwner: true, system: { equipment: { mainHand: orphanWeapon.id } }, items: new ItemCollection(orphanWeapon),
  async updateEmbeddedDocuments(type, updates) { for (const update of updates) for (const [path, value] of Object.entries(update)) if (path !== "_id") setProperty(this.items.get(update._id), path, value); },
  async createEmbeddedDocuments(type, documents) { recovered = documents[0]; }
};
assert.equal(await executeFirearmAction(orphanActor, orphanWeapon.id, "unload"), true);
assert.equal(recovered.type, "ammunition");
assert.equal(recovered.system.quantity, 2);

console.log("physical item schema, rules, compatibility, and generated action checks passed");
