import { itemHasCapability } from "../data/definitions/item-capabilities.mjs";
import { contractField, projectContractField } from "./contract-editor.mjs";
import { resolveAtLevel } from "../rules/scaling.mjs";

export const ITEM_TABS = Object.freeze([
  { id: "summary", label: "Summary", icon: "fa-chart-simple" },
  { id: "actions", label: "Actions", icon: "fa-bolt" },
  { id: "configuration", label: "Configuration", icon: "fa-wrench" },
  { id: "details", label: "Details", icon: "fa-list" }
]);
export const humanize = value => String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ").replace(/^./, c => c.toUpperCase());
export const at = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const present = value => value !== undefined && value !== null && value !== "";
const array = value => Array.isArray(value) ? value : [];
const roman = value => {
  let n = Math.trunc(Number(value));
  if (n < 1 || n > 39) return String(value);
  return [[10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]].map(([v, glyph]) => { const count = Math.floor(n / v); n %= v; return glyph.repeat(count); }).join("");
};

const CORE_FIELDS = {
  weapon: [["damage.base", "Damage", "crosshairs"], ["actions", "Actions", "angles-right"], ["range", "Range", "expand", "m"], ["firearm.capacity", "Capacity", "grip-lines-vertical"], ["handedness", "Hands", "hand"]],
  armor: [["armorClass", "Armor", "shield-halved"], ["capacity.armor", "Armor capacity", "layer-group"], ["capacity.shield", "Shield capacity", "shield"], ["movementPenalty", "Movement", "person-walking", "m"]],
  shield: [["armorClass", "Armor", "shield-halved"], ["capacity", "Capacity", "shield"]],
  ammunition: [["caliber", "Caliber", "bullseye"], ["ammoType", "Ammo family", "crosshairs"], ["roundsPerPack", "Rounds per pack", "box"], ["damage.base", "Base damage", "burst"]],
  magazine: [["capacity", "Capacity", "grip-lines-vertical"], ["rounds", "Loaded", "bars"]],
  species: [["size", "Size", "person"]],
  quality: [["tier", "Tier", "layer-group"], ["pillar", "Pillar", "columns"]],
  container: [["capacity", "Capacity", "box-open"]]
};
const PHYSICAL_FIELDS = [["weight", "Weight", "weight-hanging", "kg"], ["price", "Price", "coins"]];
const ITEM_PRESENTATION = Object.freeze({
  weapon: ["crosshairs", "Combat stats", "combat"],
  armor: ["shield-halved", "Protection", "defense"],
  shield: ["shield", "Protection", "defense"],
  ammunition: ["bullseye", "Ammunition", "combat"],
  magazine: ["bars", "Magazine", "combat"],
  spell: ["wand-magic-sparkles", "Spellcasting", "magic"],
  species: ["dna", "Species traits", "character"],
  quality: ["gem", "Quality", "character"],
  background: ["book-open", "Background", "character"],
  talent: ["star", "Talent", "character"],
  skill: ["graduation-cap", "Skill", "character"],
  unique: ["fingerprint", "Unique ability", "character"],
  consumable: ["flask", "Uses", "equipment"],
  container: ["box-open", "Storage", "equipment"],
  equipment: ["toolbox", "Equipment", "equipment"],
  treasure: ["coins", "Treasure", "equipment"]
});

/** Presentation only: all calculations are supplied by the shared mechanics services. */
export function projectItemOverview(item, { action = null, loaded = null, effectiveSystem = null, isGM = false, localize = key => key } = {}) {
  const system = effectiveSystem ?? item.system?.toObject?.() ?? item.system ?? {};
  const physical = itemHasCapability(item, "inventory");
  const [icon, statsLabel, family] = ITEM_PRESENTATION[item.type] ?? ["cube", "Key stats", "equipment"];
  const subtypeValue = system.weaponType || system.armorType || system.consumableType || system.equipmentType || system.containerType || system.treasureType || system.classification?.category || system.kind || system.category || "";
  const subtypeKey = system.weaponType ? `VEILRUNNER.WeaponFilter.${system.weaponType}` : system.armorType ? `VEILRUNNER.ArmorType.${system.armorType}` : "";
  const localizedSubtype = subtypeKey && localize(subtypeKey);
  const subtype = localizedSubtype && localizedSubtype !== subtypeKey ? localizedSubtype : humanize(subtypeValue);
  const core = [...(CORE_FIELDS[item.type] ?? []), ...(physical ? PHYSICAL_FIELDS : [])].flatMap(([path, label, icon, unit]) => {
    let value = at(system, path);
    if (path === "damage.base" && action?.damageOutcome?.available) value = action.damageOutcome.formula;
    if (path === "damage.base" && action?.weaponComposer?.capAmmoDamage && !action.damageOutcome?.available) value = "Load configured ammo";
    if (path === "actions" && action) value = action.economy.actions;
    if (path === "range" && action) value = action.range;
    if (path === "firearm.capacity") {
      if (system.weaponKind !== "firearm" || system.firearm?.magazineMode === "none") return [];
      if (loaded?.magazine) value = loaded.capacity;
    }
    if (!present(value) || typeof value === "object") return [];
    if (path === "handedness") value = value === "two" ? 2 : 1;
    if (path === "price") value = `${Number(value).toLocaleString()} ${humanize(system.currency || "credits")}`;
    return [{ label, value: `${value}${unit ? ` ${unit}` : ""}`, icon: `fa-${icon}`, inventory: PHYSICAL_FIELDS.some(([fieldPath]) => fieldPath === path) }];
  });
  if (action && !physical) {
    core.unshift({ label: action.timing.type === "reaction" ? "Reactions" : "Actions", value: action.timing.type === "reaction" ? action.economy.reactions : action.economy.actions, icon: "fa-bolt" });
    if (action.range) core.push({ label: "Range", value: `${action.range} m`, icon: "fa-expand" });
    for (const [key, value] of Object.entries(action.costs ?? {})) if (value) core.push({ label: humanize(key), value, icon: "fa-gem" });
  }
  if (item.type === "consumable" && system.uses) core.unshift({ label: "Uses remaining", value: `${system.uses.value} / ${system.uses.max}`, icon: "fa-flask" });
  const inventory = core.filter(row => row.inventory);
  const requirements = ["all", "any", "none"].flatMap(group => array(system.requirements?.[group]).filter(row => isGM || row.knowledge !== "mechanical").map(row => ({
    label: row.description || humanize(row.path?.split(".").at(-1) || row.reference || row.kind),
    value: `${group === "any" ? "One of · " : group === "none" ? "Exclude · " : ""}${({ gte: "≥", lte: "≤", gt: ">", lt: "<", ne: "≠", eq: "=" })[row.operator] ?? ""} ${row.threshold ?? row.value ?? ""}`.trim(),
    icon: "fa-diamond"
  })));
  if (system.requirements?.description) requirements.unshift({ label: system.requirements.description, value: "", icon: "fa-lock" });
  const features = array(system.rules).filter(rule => rule.enabled !== false && (rule.description || rule.label || (rule.key === "GrantItem" && rule.definitionId)))
    .map(rule => ({ label: rule.label || "Granted feature", description: rule.description || rule.notes || "", icon: "fa-layer-group",
      definitionId: rule.key === "GrantItem" ? rule.definitionId : "" }));
  for (const persona of array(system.persona)) {
    if (typeof persona !== "string" || !persona.trim() || /^(undefined|null)$/i.test(persona.trim())) continue;
    features.push({ label: persona, description: "", icon: "fa-user" });
  }
  const damageValue = action?.damageOutcome?.available ? action.damageOutcome.formula : physical && !action?.weaponComposer?.capAmmoDamage ? system.damage?.base : "";
  const damageType = action?.damageType || system.damage?.type || system.damageType;
  const damage = damageValue ? [{ label: humanize(damageType || "Damage"), value: damageValue, icon: action?.damageIcon || "fa-solid fa-crosshairs" }] : [];
  const condition = physical && Number(system.durability?.max) > 0 ? {
    value: system.durability.value, max: system.durability.max,
    percent: Math.max(0, Math.min(100, 100 * system.durability.value / system.durability.max))
  } : null;
  const level = system.owned?.currentLevel ?? 1;
  const progression = system.progression?.maxLevel > 1 || system.progression?.scaling?.length ? {
    current: item.actor ? level : null, max: system.progression.maxLevel,
    scaling: array(system.progression.scaling).map(row => ({ label: row.description || humanize(row.selector), value: `${row.kind === "milestone" ? `Level ${row.level}` : `Every ${row.interval} level(s), from ${row.level}`} · ${row.mode} ${row.value}` })),
    applied: resolveAtLevel(item, { actor: item.actor, level }).applied
  } : null;
  return {
    header: { name: item.name, subtype: subtype.toLowerCase() === item.type ? "" : subtype, type: humanize(item.type),
      grade: physical && system.grade ? roman(system.grade) : system.tier ? roman(system.tier) : "",
      gradeLabel: physical ? "Grade" : "Tier", rarity: physical && system.rarity ? humanize(system.rarity) : "" },
    core: core.filter(row => !row.inventory), inventory, presentation: { icon: `fa-${icon}`, statsLabel, family }, requirements, features, damage, condition, progression,
    traits: array(action?.traits ?? system.traits).map(humanize), summary: system.summary || "",
    usage: action?.summary || "", physical
  };
}

export function projectActionCard(action, { label = action.name, group = "Primary actions" } = {}) {
  const rows = [
    ...(action.range ? [{ label: "Range", value: `${action.range} m` }] : []),
    ...(action.damageOutcome?.available ? [{ label: "Damage", value: action.damageOutcome.formula }] : []),
    ...(action.damageType ? [{ label: "Damage type", value: humanize(action.damageType) }] : []),
    ...(action.traits?.length ? [{ label: "Traits", value: action.traits.map(humanize).join(", ") }] : []),
    ...(action.targeting?.type ? [{ label: "Target", value: humanize(action.targeting.type) }] : []),
    ...Object.entries(action.costs ?? {}).filter(([, value]) => value > 0).map(([key, value]) => ({ label: humanize(key), value }))
  ];
  return { id: action.id, label, group, rows, description: action.summary,
    icon: action.damageIcon || (action.timing.type === "reaction" ? "fa-solid fa-reply" : "fa-solid fa-crosshairs"),
    cost: action.timing.type === "reaction" ? `${action.economy.reactions} RP` : action.timing.type === "passive" ? "Passive" : `${action.economy.actions} AP` };
}

// These are view groupings, never new stored fields. Schema absence omits a control.
export const ITEM_DETAIL_GROUPS = Object.freeze([
  { label: "Ammunition & magazines", paths: ["roundsPerPack", "magazineType"] },
  { label: "Classification", paths: ["classification", "weaponType", "weaponKind", "armorType", "kind", "category", "grade", "rarity", "tier", "pillar", "size", "traits", "tags", "practice", "school"] },
  { label: "Specifications", paths: ["damage", "actions", "range", "handedness", "attack", "firearm.magazineMode", "firearm.capacity", "firearm.compatibility", "armorClass", "block", "itemRating", "capacity", "movementPenalty", "resistances", "weaknesses", "requiredSlots", "caliber", "ammoType", "compatibility", "weight", "weightReduction", "extradimensional", "bulk", "durability", "uses", "charges", "consumableType", "equipmentType", "containerType", "treasureType"] },
  { label: "Market", paths: ["price", "currency"] },
  { label: "Action definition", paths: ["activationKind", "timing", "economy", "targeting", "governingAttribute", "rollFormula", "selector", "damageFormula", "damageType", "baseSpellDamage", "spellDamagePerLevel", "resourceCosts", "consumes", "composer", "enhancements", "augments", "firearm.fireModes", "firearm.options", "hudActions"] },
  { label: "Progression", paths: ["progression.maxLevel", "progression.purchase", "progression.scaling"] },
  { label: "Features & requirements", paths: ["requirements", "persona", "primaryAttributes", "bonusAttributes", "abilities", "rules", "effects", "professionId", "archetypeId", "recommendationTags"] }
]);
export const ITEM_DETAIL_PATHS = ITEM_DETAIL_GROUPS.flatMap(group => group.paths);

export function projectItemDetails(item, catalogs = {}, editable = false) {
  const system = item.system?.toObject?.() ?? item.system ?? {};
  const schema = item.system?.schema ?? item.system?.constructor?.schema;
  const hasContent = value => Array.isArray(value) ? value.length > 0 : value && typeof value === "object" ? Object.values(value).some(hasContent) : present(value) && value !== false;
  return ITEM_DETAIL_GROUPS.map(group => ({ label: group.label, fields: group.paths.flatMap(path => {
    if (group.label === "Specifications" && !itemHasCapability(item, "inventory")) return [];
    const field = contractField(schema, path);
    const value = at(system, path);
    if (!field || (!editable && !hasContent(value))) return [];
    const projected = projectContractField(field, value, { path, catalogs });
    if (path.endsWith("compatibility")) projected.fields = projected.fields.filter(child => ![`${path}.allow`, `${path}.block`].includes(child.path));
    if (path === "rules") for (const row of projected.rows) {
      row.field.fields = row.field.fields.filter(child => child.path !== `${row.field.path}.uuid`);
    }
    return [projected];
  }) })).filter(group => group.fields.length);
}

export function projectConfigurationChoices(action) {
  const choices = [];
  if (action.weaponComposer) {
    choices.push({ key: "fireMode", label: "Fire mode", icon: "fa-crosshairs", select: true,
      options: action.weaponComposer.modes.map(mode => ({ value: mode.id, label: mode.label, selected: mode.selected })) });
    for (const option of action.weaponComposer.options) choices.push({ key: `weaponOption:${option.id}`, label: option.label, description: option.description, icon: "fa-sliders", toggle: true, checked: option.selected });
  }
  if (action.hasLevelSelection || action.isSpell) choices.push({ key: action.isSpell ? "spellLevel" : "rank", label: "Level", icon: "fa-layer-group", number: true, value: action.currentLevel, min: 1, max: Math.min(action.maxLevel, action.configurationSource?.currentLevel ?? action.currentLevel) });
  for (const modifier of action.spellComposer?.modifiers ?? []) choices.push({ key: `spellModifier:${modifier.id}`, enableKey: `spellModifierEnabled:${modifier.id}`, label: modifier.label, description: modifier.costLabel, icon: "fa-wand-magic-sparkles", number: true, value: modifier.count, min: 0, max: modifier.maxStacks });
  for (const enhancement of action.enhancements ?? []) choices.push({ key: `enhancement:${enhancement.id}`, label: enhancement.label || enhancement.id, icon: "fa-gem", number: true, value: action.resolvedSelections[`enhancement:${enhancement.id}`] ?? 0, min: 0, max: enhancement.maxStacks });
  if (action.augments?.length) {
    const selected = action.augments.find(augment => augment.definitionId === action.resolvedSelections.augment);
    choices.push({ key: "augment", label: "Augment", icon: "fa-gem", select: true,
      options: [{ value: "", label: "None", selected: !selected }, ...action.augments.map(augment => ({ value: augment.definitionId, label: augment.label || augment.definitionId, minRank: augment.minRank, selected: augment === selected }))] });
    if (selected) choices.push({ key: "augmentRank", label: "Augment rank", icon: "fa-layer-group", number: true,
      value: action.resolvedSelections.augmentRank ?? selected.minRank, min: selected.minRank, max: selected.maxRank });
  }
  for (const field of action.composer ?? []) {
    if (choices.some(choice => choice.key === field.key)) continue;
    choices.push({ key: field.key, label: field.label, icon: "fa-list-check", select: true,
      options: [{ value: "", label: "Select", selected: !action.resolvedSelections[field.key] }, ...array(field.choices).map(value => ({ value, label: humanize(value), selected: action.resolvedSelections[field.key] === value }))] });
  }
  return choices;
}
