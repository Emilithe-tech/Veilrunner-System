const {
  ArrayField,
  BooleanField,
  HTMLField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

export const PHYSICAL_ITEM_TYPES = Object.freeze([
  "weapon", "ammunition", "magazine", "armor", "accessory", "shield",
  "consumable", "container", "equipment", "treasure"
]);

export const EQUIPMENT_SLOTS = Object.freeze([
  "head", "chest", "arms", "legs", "feet", "mainHand",
  "ears", "neck", "wrists", "leftRing", "rightRing", "offhand"
]);

export const EQUIPMENT_SLOT_COLUMNS = Object.freeze({
  left: Object.freeze(["head", "chest", "arms", "legs", "feet", "mainHand"]),
  right: Object.freeze(["ears", "neck", "wrists", "leftRing", "rightRing", "offhand"])
});

export const WEAPON_TYPE_GROUPS = Object.freeze([
  Object.freeze({ key: "arcane", icon: "fa-solid fa-book-open", types: Object.freeze(["grimoire", "scepter", "wand"]) }),
  Object.freeze({ key: "blades", icon: "fa-solid fa-sword", types: Object.freeze(["shortBlade", "longBlade", "heavyBlade"]) }),
  Object.freeze({ key: "finesse", icon: "fa-solid fa-bow-arrow", types: Object.freeze(["bow", "coil", "thrown"]) }),
  Object.freeze({ key: "martial", icon: "fa-solid fa-hammer", types: Object.freeze(["blunt", "polearm", "staff", "unarmed"]) }),
  Object.freeze({ key: "lightFirearms", icon: "fa-solid fa-gun", types: Object.freeze(["pistol", "smg", "taser"]) }),
  Object.freeze({ key: "mediumFirearms", icon: "fa-solid fa-person-rifle", types: Object.freeze(["assaultRifle", "marksmanRifle", "shotgun", "sniperRifle"]) }),
  Object.freeze({ key: "heavyFirearms", icon: "fa-solid fa-rocket", types: Object.freeze(["launcher", "machineGun", "projector"]) })
]);
export const WEAPON_TYPES = Object.freeze(WEAPON_TYPE_GROUPS.flatMap(group => group.types));

const WEAPON_TYPE_ALIASES = new Map([
  ["grimoire", "grimoire"], ["greatstaff", "grimoire"], ["greatstave", "grimoire"], ["greatstaves", "grimoire"],
  ["scepter", "scepter"], ["scepters", "scepter"], ["sceptre", "scepter"], ["sceptres", "scepter"],
  ["wand", "wand"], ["wands", "wand"],
  ["shortblade", "shortBlade"], ["shortblades", "shortBlade"],
  ["longblade", "longBlade"], ["longblades", "longBlade"],
  ["heavyblade", "heavyBlade"], ["heavyblades", "heavyBlade"],
  ["bow", "bow"], ["bows", "bow"],
  ["coil", "coil"], ["flexible", "coil"],
  ["thrown", "thrown"],
  ["blunt", "blunt"],
  ["polearm", "polearm"], ["polearms", "polearm"],
  ["staff", "staff"], ["staves", "staff"],
  ["unarmed", "unarmed"], ["melee", "unarmed"],
  ["pistol", "pistol"], ["pistols", "pistol"],
  ["smg", "smg"], ["smgs", "smg"],
  ["taser", "taser"], ["tasers", "taser"],
  ["assaultrifle", "assaultRifle"], ["assaultrifles", "assaultRifle"],
  ["marksmanrifle", "marksmanRifle"], ["marksmanrifles", "marksmanRifle"], ["heavyrifle", "marksmanRifle"], ["heavyrifles", "marksmanRifle"],
  ["shotgun", "shotgun"], ["shotguns", "shotgun"],
  ["sniperrifle", "sniperRifle"], ["sniperrifles", "sniperRifle"],
  ["launcher", "launcher"], ["launchers", "launcher"],
  ["machinegun", "machineGun"], ["machineguns", "machineGun"], ["lmg", "machineGun"], ["lmgs", "machineGun"],
  ["projector", "projector"], ["projectors", "projector"], ["heavycannon", "projector"], ["heavycannons", "projector"]
]);

export function normalizeWeaponType(value) {
  const original = String(value ?? "").trim();
  const token = original.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return WEAPON_TYPE_ALIASES.get(token) ?? original;
}

export const DAMAGE_TYPE_GROUPS = Object.freeze([
  Object.freeze({ key: "physical", types: Object.freeze(["slashing", "bludgeoning", "piercing"]) }),
  Object.freeze({ key: "elemental", types: Object.freeze(["pyro", "hydro", "cryo", "floral", "geo", "aero", "electric", "sonic"]) }),
  Object.freeze({ key: "cosmic", types: Object.freeze(["light", "void"]) })
]);
export const DAMAGE_TYPES = Object.freeze(DAMAGE_TYPE_GROUPS.flatMap(group => group.types));

export const ITEM_RARITIES = Object.freeze([
  Object.freeze({ tier: 1, slug: "salvage", name: "Salvage", colorName: "Iron Charcoal", color: "#52525B", role: "Muted dark grey; recedes into inventory backgrounds as vendor scrap." }),
  Object.freeze({ tier: 2, slug: "crude", name: "Crude", colorName: "Weathered Rust", color: "#9A3412", role: "Muted bronze-earth tone; clearly signals low-grade or damaged gear." }),
  Object.freeze({ tier: 3, slug: "common", name: "Common", colorName: "Ash White", color: "#E2E8F0", role: "High-contrast clean neutral; standard baseline issue." }),
  Object.freeze({ tier: 4, slug: "uncommon", name: "Uncommon", colorName: "Emerald Green", color: "#22C55E", role: "Bright foliage green; basic stat upgrades and utility perks." }),
  Object.freeze({ tier: 5, slug: "superior", name: "Superior", colorName: "Sky Azure", color: "#0284C7", role: "Bright sky blue; marks refined baseline stats and extra sockets." }),
  Object.freeze({ tier: 6, slug: "rare", name: "Rare", colorName: "Cobalt Blue", color: "#2563EB", role: "Rich deep blue; solid multi-stat items and conditional perks." }),
  Object.freeze({ tier: 7, slug: "epic", name: "Epic", colorName: "Amethyst Violet", color: "#9333EA", role: "Royal purple; indicates active abilities and skill modifications." }),
  Object.freeze({ tier: 8, slug: "renowned", name: "Renowned", colorName: "Crimson Rose", color: "#E11D48", role: "Vivid red-pink; bridges purple and orange to mark heroic reputation." }),
  Object.freeze({ tier: 9, slug: "legendary", name: "Legendary", colorName: "Amber Orange", color: "#F97316", role: "Warm fire-orange glow; build-defining focal items." }),
  Object.freeze({ tier: 10, slug: "mythic", name: "Mythic", colorName: "Celestial Cyan", color: "#06B6D4", role: "Radiant electric cyan; high-tier cosmic/mythic presence." }),
  Object.freeze({ tier: 11, slug: "artisan", name: "Artisan", colorName: "Solar Gold", color: "#FACC15", role: "Bright radiant gold; highlights peak mastercraft and maxed base rolls." }),
  Object.freeze({ tier: 12, slug: "unique", name: "Unique", colorName: "Neon Magenta", color: "#FF007F", role: "High-potency magenta/pearlescent glow; signals 1-of-1 singular items." })
]);

const ITEM_RARITY_BY_SLUG = new Map(ITEM_RARITIES.map(rarity => [rarity.slug, rarity]));
const ITEM_RARITY_ALIASES = new Map(ITEM_RARITIES.flatMap(rarity => [
  [rarity.slug, rarity.slug],
  [rarity.name.toLowerCase(), rarity.slug],
  [rarity.colorName.toLowerCase(), rarity.slug],
  [String(rarity.tier), rarity.slug]
]));

export function normalizeItemRarity(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return ITEM_RARITY_ALIASES.get(normalized) ?? "common";
}

export function itemRarityData(itemOrValue) {
  const value = typeof itemOrValue === "string" ? itemOrValue : itemOrValue?.system?.rarity;
  return ITEM_RARITY_BY_SLUG.get(normalizeItemRarity(value)) ?? ITEM_RARITY_BY_SLUG.get("common");
}

export const RULE_ELEMENT_KEYS = Object.freeze([
  "ActiveEffectLike", "FlatModifier", "RollOption", "DamageDice",
  "Resistance", "Weakness", "ChoiceSet", "GrantItem",
  "ItemAlteration", "DegreeOfSuccess"
]);

const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const whole = (initial = 0, min = 0) => new NumberField({
  required: true,
  integer: true,
  min,
  initial,
  nullable: false
});

export function ruleElementSchema() {
  return new SchemaField({
    key: new StringField({
      required: true,
      blank: false,
      initial: "FlatModifier",
      choices: Object.fromEntries(RULE_ELEMENT_KEYS.map(key => [key, `VEILRUNNER.RuleElement.${key}`]))
    }),
    label: text(),
    enabled: new BooleanField({ required: true, initial: true }),
    requiresEquipped: new BooleanField({ required: true, initial: true }),
    priority: new NumberField({ required: true, integer: true, initial: 20, nullable: false }),
    predicate: new ArrayField(text(), { initial: [] }),
    selector: text("all"),
    path: text(),
    mode: new StringField({ required: true, blank: false, initial: "add" }),
    value: text("0"),
    type: text("untyped"),
    slug: text(),
    option: text(),
    diceNumber: whole(1),
    dieSize: whole(6, 2),
    damageType: text(),
    amount: whole(),
    uuid: text(),
    choices: new ArrayField(text(), { initial: [] }),
    selection: text(),
    target: text("self"),
    adjustment: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
    duration: text("while-equipped"),
    notes: text()
  });
}

/** Shared fields used by all actor-owned physical documents. */
export function physicalItemFields() {
  return {
    ...itemIdentityFields(),
    quantity: whole(1),
    bulk: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
    weight: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
    price: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
    currency: text("credits"),
    grade: whole(1, 1),
    rarity: new StringField({
      required: true,
      blank: false,
      initial: "common",
      choices: Object.fromEntries(ITEM_RARITIES.map(rarity => [rarity.slug, rarity.name]))
    }),
    traits: new ArrayField(text(), { initial: [] }),
    favorite: new BooleanField({ required: true, initial: false }),
    identified: new BooleanField({ required: true, initial: true }),
    requiredSlots: new ArrayField(new StringField({
      required: true,
      blank: false,
      choices: Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, `VEILRUNNER.EquipmentSlot.${slot}`]))
    }), { initial: [] }),
    containerId: text(),
    durability: new SchemaField({
      value: whole(),
      max: whole(),
      wearRate: whole(1, 1),
      wearAmount: whole(1),
      wearProgress: whole()
    }),
    rules: new ArrayField(ruleElementSchema(), { initial: [] }),
    hudActions: new ArrayField(new SchemaField({
      id: text(),
      name: text(),
      img: text(),
      category: text("item-actions"),
      actionType: text("standard"),
      actions: whole(1),
      traits: new ArrayField(text(), { initial: [] }),
      requiresTarget: new BooleanField({ required: true, initial: false }),
      resourceCosts: new SchemaField({ mana: whole(), stamina: whole(), health: whole() })
    }), { initial: [] }),
    description: new SchemaField({
      value: new HTMLField({ required: false, blank: true, initial: "" }),
      gm: new HTMLField({ required: false, blank: true, initial: "" })
    })
  };
}

export function compatibilitySchema() {
  return new SchemaField({
    flexible: new BooleanField({ required: true, initial: false }),
    caliber: text(),
    ammoTypes: new ArrayField(text(), { initial: [] }),
    allowDefinitionIds: new ArrayField(text(), { initial: [] }),
    blockDefinitionIds: new ArrayField(text(), { initial: [] }),
    allow: new ArrayField(text(), { initial: [] }),
    block: new ArrayField(text(), { initial: [] })
  });
}

/** Presence-aware migration for legacy physical documents and partial updates. */
export function migratePhysicalItemData(source) {
  if (!source || typeof source !== "object") return source;
  source = migrateItemIdentityData(source);
  if (source.requiredSlots === undefined && source.equipmentSlot) source.requiredSlots = [source.equipmentSlot];
  if (source.price === undefined && source.cost !== undefined) source.price = Math.max(0, Number(source.cost) || 0);
  if (source.grade !== undefined) source.grade = Math.max(1, Math.floor(Number(source.grade) || 1));
  if (source.traits !== undefined && !Array.isArray(source.traits)) {
    source.traits = String(source.traits).split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  }
  if (source.rarity !== undefined) source.rarity = normalizeItemRarity(source.rarity);
  if (source.weaponType !== undefined) source.weaponType = normalizeWeaponType(source.weaponType);
  if (source.rules !== undefined && !Array.isArray(source.rules)) source.rules = [];
  if (source.hudActions !== undefined && !Array.isArray(source.hudActions)) source.hudActions = [];
  return source;
}

export class PhysicalItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return physicalItemFields();
  }

  static migrateData(source) {
    return migratePhysicalItemData(super.migrateData(source));
  }
}
