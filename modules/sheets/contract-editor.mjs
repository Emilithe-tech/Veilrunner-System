/** Schema-backed form projection. Stored keys remain values; authors choose labels. */
const clone = value => structuredClone(value ?? null);
const humanize = value => String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, char => char.toUpperCase());
const LABELS = { selector: "Applies to", path: "Field", reference: "Required choice", definitionId: "Definition", uuid: "Legacy definition reference", providedActionIds: "Provided actions", consumes: "Consume effects", composer: "Action options", definitionIds: "Definitions", allowDefinitionIds: "Allowed definitions", blockDefinitionIds: "Blocked definitions", all: "All required", any: "At least one required", none: "Must not have" };
const fieldsOf = field => field?.fields ?? {};
const isArray = field => Boolean(field?.element);
const at = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const safeParts = path => String(path).split(".").every(key => /^[A-Za-z0-9_-]+$/.test(key) && !["__proto__", "constructor", "prototype"].includes(key));

export const CONTRACT_ROOTS = Object.freeze([
  "requirements", "timing", "economy", "targeting", "progression.maxLevel", "progression.purchase", "progression.scaling", "consumes", "composer", "enhancements", "augments", "effects",
  "hudActions", "firearm.fireModes", "firearm.options", "abilities", "rules", "providedActionIds",
  "firearm.compatibility.allowDefinitionIds", "firearm.compatibility.blockDefinitionIds", "compatibility.allowDefinitionIds", "compatibility.blockDefinitionIds",
  "attack.selector", "rollFormula", "selector", "containerId", "professionId", "archetypeId"
]);

const ATTRIBUTES = ["physical.strength", "physical.dexterity", "physical.agility", "physical.reaction", "mental.intelligence", "mental.wisdom", "mental.focus", "mental.logic", "social.charisma", "social.perception"];
const ACTOR_FIELDS = [
  ...ATTRIBUTES.map(key => [`attributes.${key}`, humanize(key.split(".").at(-1))]),
  ...["health", "mana", "stamina", "barrier"].flatMap(key => ["value", "max"].map(part => [`resources.${key}.${part}`, `${humanize(key)} ${part === "value" ? "current" : "maximum"}`]))
];
const SCALING_FIELDS = [
  ["resourceCosts.mana", "Mana cost"], ["resourceCosts.stamina", "Stamina cost"], ["resourceCosts.health", "Health cost"],
  ["economy.actions", "Action cost"], ["economy.reactions", "Reaction cost"], ["targeting.range", "Range"],
  ["damageFormula", "Damage"], ["baseSpellDamage", "Base spell damage"], ["spellDamagePerLevel", "Spell damage per level"], ["traits", "Traits"]
];
const ROLL_FIELDS = [["all", "All rolls"], ["action", "Action roll"], ["attack", "Attack roll"], ["damage", "Damage roll"], ...ATTRIBUTES.map(key => [key.split(".").at(-1), humanize(key.split(".").at(-1))])];

export function contractField(schema, path) {
  if (!safeParts(path)) throw new TypeError("Invalid authoring field.");
  let field = { fields: schema?.fields ?? schema };
  for (const part of path.split(".")) field = isArray(field) && /^\d+$/.test(part) ? field.element : fieldsOf(field)[part];
  return field;
}

function optionsFor(field, path, parent, catalogs) {
  const key = path.split(".").at(-1);
  const semanticKey = /^\d+$/.test(key) ? path.split(".").at(-2) : key;
  if (/^(definitionId|definitionIds|providedActionIds|allowDefinitionIds|blockDefinitionIds|requiredDefinitionIds|professionId|archetypeId)$/.test(semanticKey)) {
    return (catalogs.definitions ?? []).filter(record => semanticKey === "professionId" ? record.type === "profession" : semanticKey === "archetypeId" ? record.type === "archetype" : true)
      .map(record => [record.definitionId, `${record.name} (${humanize(record.type)})`]);
  }
  if (semanticKey === "uuid") return (catalogs.definitions ?? []).map(record => [record.uuid || `Compendium.${record.packCollection}.Item.${record.documentId}`, `${record.name} (${humanize(record.type)})`]);
  if (semanticKey === "containerId") return (catalogs.containers ?? []).map(item => [item.id, item.name]);
  if (semanticKey === "types") return (catalogs.types ?? []).map(type => [type, humanize(type)]);
  if (semanticKey === "capabilities") return ["equippable", "actionProvider", "chargenSelectable", "marketSellable", "inventory"].map(key => [key, humanize(key)]);
  if (semanticKey === "timing") return ["action", "reaction", "free", "passive"].map(key => [key, humanize(key)]);
  if (semanticKey === "reference") {
    if (["definition", "license", "practiceInvestment"].includes(parent?.kind)) return (catalogs.definitions ?? []).map(record => [record.definitionId, record.name]);
    if (parent?.kind === "equipped") return [...(catalogs.types ?? []).map(type => [type, humanize(type)]), ...(catalogs.definitions ?? []).map(record => [record.definitionId, record.name]), ...(catalogs.traits ?? []).map(trait => [trait.id ?? trait, trait.label ?? humanize(trait)])];
    if (parent?.kind === "effect") return (catalogs.effects ?? []).map(effect => [effect.id, effect.name]);
    if (parent?.kind === "trait") return (catalogs.traits ?? []).map(trait => [trait.id ?? trait, trait.label ?? humanize(trait)]);
    if (parent?.kind === "resource") return ["mana", "stamina", "health", "barrier"].map(value => [value, humanize(value)]);
    return [];
  }
  if (semanticKey === "path" || (semanticKey === "target" && /(?:^|\.)effects\.\d+\.target$/.test(path))) return ACTOR_FIELDS;
  if (semanticKey === "selector") return path.startsWith("progression.scaling.") ? SCALING_FIELDS : ROLL_FIELDS;
  if (semanticKey === "effect") return (catalogs.effects ?? []).map(effect => [effect.id, effect.name]);
  if (semanticKey === "value" && parent?.kind === "actorType") return (catalogs.actorTypes ?? []).map(type => [type, humanize(type)]);
  let choices = field?.choices ?? field?.options?.choices;
  if (typeof choices === "function") choices = choices();
  return choices ? Object.entries(choices).map(([value, label]) => [value, String(label).startsWith("VEILRUNNER.") ? catalogs.localize?.(label) ?? humanize(value) : humanize(label)]) : null;
}

export function projectContractField(field, value, { path, parent = {}, catalogs = {}, label = null } = {}) {
  if (!field) return null;
  const key = path.split(".").at(-1);
  const result = { path, name: `system.${path}`, label: label ?? LABELS[key] ?? humanize(key), value: value ?? "" };
  if (isArray(field)) return { ...result, array: true, marker: `contractArrays.${path.replaceAll(".", "__")}`,
    rows: (Array.isArray(value) ? value : []).map((entry, index) => ({ index, parentPath: path, field: projectContractField(field.element, entry, { path: `${path}.${index}`, parent: value, catalogs, label: `Entry ${index + 1}` }) })) };
  if (field.fields) return { ...result, object: true, fields: Object.entries(field.fields).map(([name, child]) => projectContractField(child, value?.[name], { path: `${path}.${name}`, parent: value, catalogs })) };
  if (key === "id" || (key === "key" && /composer\.\d+\.key$/.test(path))) return { ...result, hidden: true };
  const choices = optionsFor(field, path, parent, catalogs);
  if (choices) {
    const entries = [["", "None"], ...choices.filter(([entry]) => entry !== "")];
    if (value && !entries.some(([entry]) => String(entry) === String(value))) entries.push([value, `${value} (saved value)`]);
    return { ...result, select: true, rerender: ["kind", "key"].includes(key), options: entries.map(([entry, label]) => ({ value: entry, label, selected: String(entry) === String(value ?? "") })) };
  }
  const type = field.constructor?.name ?? "";
  return { ...result, boolean: type === "BooleanField", checked: Boolean(value), inputType: type === "NumberField" ? "number" : "text", min: field.min ?? field.options?.min,
    step: (field.integer ?? field.options?.integer) ? "1" : "any" };
}

export function projectContractEditors(schema, system, catalogs = {}) {
  return Object.fromEntries(CONTRACT_ROOTS.map(path => [path, projectContractField(contractField(schema, path), at(system, path), { path, catalogs })]).filter(([, field]) => field));
}

/** Rebuild submitted arrays by schema, keeping unrendered fields and stable row identities. */
export function normalizeContractForm(schema, submitted, current, arrayMarkers = {}, roots = CONTRACT_ROOTS) {
  const arrays = new Set(Object.keys(arrayMarkers).map(key => key.replaceAll("__", ".")));
  const walk = (field, input, before, path) => {
    if (isArray(field)) {
      if (input === undefined && !arrays.has(path)) return clone(before);
      const rows = Array.isArray(input) ? input : Object.entries(input ?? {}).filter(([key]) => /^\d+$/.test(key)).sort(([a], [b]) => Number(a) - Number(b)).map(([, value]) => value);
      return rows.map((entry, index) => walk(field.element, entry, before?.[index], `${path}.${index}`));
    }
    if (field?.fields) return Object.fromEntries(Object.entries(field.fields).filter(([key]) => input?.[key] !== undefined || before?.[key] !== undefined || arrays.has(`${path}.${key}`))
      .map(([key, child]) => [key, walk(child, input?.[key], before?.[key], `${path}.${key}`)]));
    if (input === undefined) return clone(before);
    if (field?.constructor?.name === "NumberField") return input === "" && (field.nullable ?? field.options?.nullable) ? null : Number(input);
    if (field?.constructor?.name === "BooleanField") return input === true || ["true", "on", "1"].includes(String(input));
    return input;
  };
  const result = structuredClone(submitted);
  for (const path of roots) {
    const field = contractField(schema, path);
    if (!field || (at(submitted, path) === undefined && ![...arrays].some(entry => entry === path || entry.startsWith(`${path}.`)))) continue;
    const parts = path.split(".");
    const key = parts.pop();
    const target = parts.reduce((value, part) => value[part] ??= {}, result);
    target[key] = walk(field, at(submitted, path), at(current, path), path);
  }
  return result;
}

export function contractArrayEdit(schema, system, path, { remove = null, createId = () => globalThis.crypto.randomUUID(), roots = CONTRACT_ROOTS } = {}) {
  const field = contractField(schema, path);
  if (!isArray(field) || !roots.some(root => path === root || path.startsWith(`${root}.`))) throw new TypeError("This field is not an authoring list.");
  const rows = clone(at(system, path) ?? []);
  if (remove !== null) {
    if (!Number.isInteger(remove) || remove < 0 || remove >= rows.length) throw new RangeError("This row no longer exists.");
    rows.splice(remove, 1);
  } else {
    const entry = field.element.getInitialValue?.({}) ?? (field.element.fields ? {} : "");
    if (entry && typeof entry === "object") {
      if (field.element.fields?.id) entry.id = createId();
      if (path === "composer") entry.key = createId();
    }
    rows.push(entry);
  }
  return rows;
}
