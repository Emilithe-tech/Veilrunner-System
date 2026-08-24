/**
 * Creation-only storefront context. Entries deliberately contain commerce
 * terms only: canonical Item definitions remain the mechanical source.
 *
 * Example entry: { definitionId: "veilrunner.weapon.example", price: 120,
 * availability: "available", stock: null, options: {} }
 */
export const VEILRUNNER_STARTER_STORE = Object.freeze({
  id: "veilrunner.chargen-store",
  label: "Starter Storefront",
  entries: Object.freeze([])
});

const SAMPLE_WEAPONS = Object.freeze([
  ["VX-7 Harrier", "assaultRifle", "rare", 2, 1800, 3.6, "2d6+2", 60, 30, ["Burst Fire", "Balanced"]],
  ["Manticore Shotgun", "shotgun", "uncommon", 1, 1250, 4.2, "3d6", 15, 8, ["Scatter", "Close Quarters"]],
  ["Ironwind Pistol", "pistol", "common", 1, 650, 1.1, "1d6+1", 25, 15, ["Accurate", "Concealable"]],
  ["Adjudicator Blade", "longBlade", "rare", 2, 1600, 1.7, "2d6+3", 1, 0, ["Deadly", "Balanced"]],
  ["Axiom Wand", "wand", "epic", 3, 2750, 1, "3d6", 30, 0, ["Arcane", "Focus"]]
]);
const SAMPLE_TYPES = Object.freeze(["grimoire", "scepter", "wand", "shortBlade", "longBlade", "heavyBlade", "bow", "coil", "thrown", "blunt", "polearm", "staff", "unarmed", "pistol", "smg", "taser", "assaultRifle", "marksmanRifle", "shotgun", "sniperRifle", "launcher", "machineGun", "projector"]);
const FIREARM_TYPES = new Set(["pistol", "smg", "taser", "assaultRifle", "marksmanRifle", "shotgun", "sniperRifle", "launcher", "machineGun", "projector"]);
const SAMPLE_RARITIES = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);

function sampleWeaponSource(index) {
  const supplied = SAMPLE_WEAPONS[index];
  const number = index + 1;
  const [name, weaponType, rarity, grade, price, weight, damage, range, capacity, traits] = supplied ?? [
    `Storefront Test Weapon ${String(number).padStart(2, "0")}`, SAMPLE_TYPES[index % SAMPLE_TYPES.length], SAMPLE_RARITIES[index % SAMPLE_RARITIES.length], (index % 4) + 1,
    300 + (index * 95), .8 + ((index % 8) * .45), `${(index % 3) + 1}d6`, 10 + ((index % 7) * 10), index % 3 ? 12 + index : 0, ["Test Fixture"]
  ];
  const definitionId = `veilrunner.weapon.storefront-test-${String(number).padStart(2, "0")}`;
  return {
    name, type: "weapon", img: "icons/svg/sword.svg",
    system: {
      definitionId, intents: ["weapon", "market-sellable"], quantity: 1, bulk: 0, weight, price, currency: "credits", rarity, grade,
      traits, identified: true, requiredSlots: ["mainHand"], rules: [], weaponType,
      weaponKind: FIREARM_TYPES.has(weaponType) ? "firearm" : ["bow", "thrown"].includes(weaponType) ? "ranged" : "melee",
      handedness: "one", actions: 1, attack: { formula: "1d10", selector: "attack" }, damage: { base: damage, max: damage, modifier: 0, type: "piercing" }, range,
      firearm: { magazineMode: capacity ? "internal" : "none", capacity, internal: { quantity: 0 }, compatibility: { flexible: false, caliber: "", ammoTypes: [], allowDefinitionIds: [], blockDefinitionIds: [], allow: [], block: [] } },
      description: { value: "Opt-in storefront layout test fixture. It is not canonical Veilrunner rules content.", gm: "" }
    }
  };
}

export const VEILRUNNER_STARTER_STORE_FIXTURES = Object.freeze(Array.from({ length: 32 }, (_, index) => {
  const source = sampleWeaponSource(index);
  return Object.freeze({ definitionId: source.system.definitionId, price: source.system.price, availability: "available", stock: null, storeCategory: "weapons", source });
}));

export function starterStoreContext({ includeSamples = false } = {}) {
  return Object.freeze({ ...VEILRUNNER_STARTER_STORE, entries: includeSamples ? VEILRUNNER_STARTER_STORE_FIXTURES : VEILRUNNER_STARTER_STORE.entries });
}
