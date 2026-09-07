export const CAPABILITY_KEYS = Object.freeze([
  "canonicalDefinition",
  "actorOwned",
  "inventory",
  "equippable",
  "actionProvider",
  "progressionContent",
  "chargenSelectable",
  "marketSellable"
]);

const NONE = Object.freeze(Object.fromEntries(CAPABILITY_KEYS.map(key => [key, false])));

function capabilities(enabled = []) {
  const selected = new Set(enabled);
  return Object.freeze(Object.fromEntries(CAPABILITY_KEYS.map(key => [key, selected.has(key)])));
}

const DEFINITION = ["canonicalDefinition", "actorOwned"];
const PHYSICAL = [...DEFINITION, "inventory", "marketSellable"];
const EQUIPPABLE = [...PHYSICAL, "equippable"];
const CHARGEN = [...DEFINITION, "chargenSelectable"];

/** Structural semantics keyed by document type, never by display tags or UI state. */
export const ITEM_TYPE_CAPABILITIES = Object.freeze({
  action: capabilities([...DEFINITION, "actionProvider"]),
  ability: capabilities([...DEFINITION, "actionProvider", "progressionContent"]),
  spell: capabilities([...DEFINITION, "actionProvider", "progressionContent"]),
  talent: capabilities([...DEFINITION, "progressionContent"]),
  skill: capabilities([...DEFINITION, "actionProvider", "progressionContent"]),
  quality: capabilities([...CHARGEN, "progressionContent"]),
  practice: capabilities(DEFINITION),
  trait: capabilities([...DEFINITION, "progressionContent"]),
  progression: capabilities(["canonicalDefinition"]),
  weapon: capabilities([...EQUIPPABLE, "actionProvider"]),
  armor: capabilities(EQUIPPABLE),
  shield: capabilities(EQUIPPABLE),
  ammunition: capabilities(PHYSICAL),
  magazine: capabilities(PHYSICAL),
  accessory: capabilities(EQUIPPABLE),
  consumable: capabilities([...PHYSICAL, "actionProvider"]),
  container: capabilities(PHYSICAL),
  equipment: capabilities(EQUIPPABLE),
  treasure: capabilities(PHYSICAL),
  species: capabilities(CHARGEN),
  origin: capabilities(CHARGEN),
  background: capabilities(CHARGEN),
  archetype: capabilities(CHARGEN),
  profession: capabilities(CHARGEN),
  discipline: capabilities(CHARGEN),
  language: capabilities(CHARGEN)
});

export const SEMANTIC_ITEM_TYPES = Object.freeze(Object.keys(ITEM_TYPE_CAPABILITIES));

export function normalizeSemanticItemType(type) {
  const value = String(type ?? "").trim().toLowerCase();
  return value;
}

export function isSemanticItemType(type) {
  const value = String(type ?? "").trim().toLowerCase();
  return Object.hasOwn(ITEM_TYPE_CAPABILITIES, value);
}

export function itemCapabilities(itemOrType) {
  const type = normalizeSemanticItemType(typeof itemOrType === "string" ? itemOrType : itemOrType?.type);
  return ITEM_TYPE_CAPABILITIES[type] ?? NONE;
}

export function itemHasCapability(itemOrType, capability) {
  if (!CAPABILITY_KEYS.includes(capability)) throw new TypeError(`Unknown Item capability: ${capability}`);
  return itemCapabilities(itemOrType)[capability];
}

export function itemTypesWithCapability(capability) {
  if (!CAPABILITY_KEYS.includes(capability)) throw new TypeError(`Unknown Item capability: ${capability}`);
  return SEMANTIC_ITEM_TYPES.filter(type => ITEM_TYPE_CAPABILITIES[type][capability]);
}
