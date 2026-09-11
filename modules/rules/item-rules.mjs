import { EQUIPMENT_SLOTS, PHYSICAL_ITEM_TYPES, RULE_ELEMENT_KEYS } from "../data/item/physical.mjs";
import { isSafeEffectPath, normalizeEffectChange, normalizeEffectMode } from "./effect-boundary.mjs";
import { actorWeaponSlots, canDualWieldTwoHandedWeapons } from "../data/equipment-slots.mjs";

const RULE_KEYS = new Set(RULE_ELEMENT_KEYS);

const list = value => Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
const textList = value => list(value).map(entry => String(entry ?? "").trim()).filter(Boolean);
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function isSafeRulePath(path) {
  return isSafeEffectPath(path);
}

export function itemRequiredSlots(item, actor = item?.parent, slot) {
  const required = textList(item?.system?.requiredSlots).filter(slot => EQUIPMENT_SLOTS.includes(slot));
  if (required.length) return actorWeaponSlots(actor, item, [...new Set(required)], slot);
  const legacy = String(item?.system?.equipmentSlot ?? "");
  return EQUIPMENT_SLOTS.includes(legacy) ? [legacy] : [];
}

/** Resolve the actor's stable slot map, including assignment-only migrated data. */
export function equipmentBySlot(actor) {
  const system = actor?.system ?? actor ?? {};
  const resolved = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = String(system.equipment?.[slot] ?? "").trim();
    if (itemId) resolved[slot] = itemId;
  }
  for (const assignment of list(system.equipmentAssignments)) {
    const itemId = String(assignment?.itemId ?? "").trim();
    if (!itemId) continue;
    for (const slot of textList(assignment?.slots)) {
      if (EQUIPMENT_SLOTS.includes(slot) && !resolved[slot]) resolved[slot] = itemId;
    }
  }
  // Release the old offhand reservation when the future trait becomes active.
  const primary = actor?.items?.get?.(resolved.mainHand);
  if (resolved.mainHand && resolved.mainHand === resolved.offhand
    && primary?.type === "weapon" && primary.system?.handedness === "two"
    && canDualWieldTwoHandedWeapons(actor)) delete resolved.offhand;
  return resolved;
}

export function equippedSlotsForItem(actor, itemId) {
  const equipment = equipmentBySlot(actor);
  return EQUIPMENT_SLOTS.filter(slot => equipment[slot] === itemId);
}

export function isItemEquipped(actor, item) {
  const required = itemRequiredSlots(item, actor);
  if (!required.length) return false;
  const equipped = new Set(equippedSlotsForItem(actor, item.id));
  return required.every(slot => equipped.has(slot));
}

export function normalizeRuleElement(rule = {}, index = 0) {
  const sourceKey = String(rule?.key ?? "").trim();
  const key = sourceKey || "FlatModifier";
  return {
    id: String(rule.id ?? ""),
    definitionId: String(rule.definitionId ?? ""),
    key,
    label: String(rule.label ?? "").trim(),
    enabled: rule.enabled !== false,
    requiresEquipped: rule.requiresEquipped !== false,
    priority: Math.trunc(finite(rule.priority, 20)),
    predicate: textList(rule.predicate),
    selector: String(rule.selector ?? "all").trim() || "all",
    path: String(rule.path ?? "").trim(),
    mode: String(rule.mode ?? "add").trim() || "add",
    value: String(rule.value ?? "0").trim(),
    type: String(rule.type ?? "untyped").trim() || "untyped",
    slug: String(rule.slug ?? "").trim() || `${key.toLowerCase()}-${index}`,
    option: String(rule.option ?? "").trim(),
    diceNumber: Math.max(0, Math.trunc(finite(rule.diceNumber, 1))),
    dieSize: Math.max(2, Math.trunc(finite(rule.dieSize, 6))),
    damageType: String(rule.damageType ?? "").trim(),
    amount: Math.max(0, Math.trunc(finite(rule.amount))),
    uuid: String(rule.uuid ?? "").trim(),
    choices: textList(rule.choices),
    selection: String(rule.selection ?? "").trim(),
    target: String(rule.target ?? "self").trim() || "self",
    adjustment: Math.trunc(finite(rule.adjustment)),
    duration: String(rule.duration ?? "while-equipped").trim(),
    notes: String(rule.notes ?? "").trim()
  };
}

export function validateRuleElement(rule = {}) {
  const sourceKey = String(rule?.key ?? "").trim();
  const normalized = normalizeRuleElement(rule);
  const errors = [];
  if (!RULE_KEYS.has(sourceKey)) errors.push("Unknown rule element.");
  if (["ActiveEffectLike", "ItemAlteration"].includes(normalized.key) && !isSafeRulePath(normalized.path)) errors.push("A safe property path is required.");
  if (["ActiveEffectLike", "ItemAlteration"].includes(normalized.key) && !normalizeEffectMode(normalized.mode).valid) errors.push("Unsupported effect change mode.");
  if (normalized.key === "RollOption" && !normalized.option) errors.push("A roll option is required.");
  if (["GrantItem"].includes(normalized.key) && !normalized.definitionId && !normalized.uuid) errors.push("Choose a canonical Item definition.");
  if (normalized.key === "ChoiceSet" && !normalized.choices.length) errors.push("At least one choice is required.");
  if (["Resistance", "Weakness", "DamageDice"].includes(normalized.key) && !normalized.damageType) errors.push("A damage type is required.");
  return { valid: errors.length === 0, errors, rule: normalized };
}

function legacyArmorRules(item) {
  if (!["armor", "accessory"].includes(item?.type)) return [];
  const rules = [];
  if (item.type === "armor") {
    for (const [key, entries] of [["Resistance", item.system?.resistances], ["Weakness", item.system?.weaknesses]]) {
      for (const [index, entry] of list(entries).entries()) {
        if (!entry?.trait) continue;
        rules.push(normalizeRuleElement({ key, damageType: entry.trait, amount: entry.level, label: `${key}: ${entry.trait}` }, index));
      }
    }
    for (const [index, effect] of list(item.system?.effects).entries()) {
      if (!effect?.target) continue;
      rules.push(normalizeRuleElement({
        key: "ActiveEffectLike", path: effect.target, value: effect.value,
        label: effect.notes, requiresEquipped: true
      }, index));
    }
  }
  for (const [index, bonus] of list(item.system?.bonuses).entries()) {
    if (!bonus?.target) continue;
    rules.push(normalizeRuleElement({
      key: "FlatModifier", selector: bonus.target, value: bonus.value,
      type: "item", label: bonus.notes, requiresEquipped: true
    }, index));
  }
  return rules;
}

export function rulesForItem(item) {
  return [...list(item?.system?.rules).map(normalizeRuleElement), ...legacyArmorRules(item)];
}

function predicatePasses(predicate, options) {
  return predicate.every(term => term.startsWith("!") ? !options.has(term.slice(1)) : options.has(term));
}

function numericRuleValue(value, data = {}) {
  const raw = String(value ?? "0").trim();
  if (/^@[A-Za-z0-9_.]+$/.test(raw)) return finite(foundry.utils.getProperty(data, raw.slice(1)));
  return finite(raw);
}

function sourceItems(actor) {
  return actor?.items?.contents ?? [...(actor?.items ?? [])];
}

/** Resolve item rules into deterministic synthetics for an actor and roll/action context. */
export function resolveActorItemRules(actor, context = {}) {
  const options = new Set(textList(context.options));
  const activeItemIds = new Set(textList(context.activeItemIds));
  options.add(`actor:type:${actor?.type ?? ""}`);
  const sources = [];
  for (const item of sourceItems(actor)) {
    if (!PHYSICAL_ITEM_TYPES.includes(item.type)) continue;
    const equipped = isItemEquipped(actor, item) || activeItemIds.has(item.id) || activeItemIds.has(item.uuid);
    for (const [ruleIndex, rule] of rulesForItem(item).entries()) sources.push({ item, equipped, rule, ruleIndex });
  }

  // Roll options are resolved first so later predicates can depend on them.
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const { item, equipped, rule } of sources) {
      if (!rule.enabled || (rule.requiresEquipped && !equipped) || rule.key !== "RollOption") continue;
      if (!predicatePasses(rule.predicate, options)) continue;
      const option = rule.option || rule.slug;
      if (option && !options.has(option)) {
        options.add(option);
        options.add(`item:${item.id}:${option}`);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const { equipped, rule } of sources) {
    if (!rule.enabled || (rule.requiresEquipped && !equipped) || rule.key !== "ChoiceSet" || !rule.selection) continue;
    options.add(`choice:${rule.slug}:${rule.selection}`);
  }

  const resolved = {
    options,
    changes: [], modifiers: [], damageDice: [], resistances: [], weaknesses: [],
    choices: [], grants: [], alterations: [], degreeAdjustments: [], errors: []
  };
  for (const { item, equipped, rule, ruleIndex } of sources) {
    if (!rule.enabled || (rule.requiresEquipped && !equipped) || !predicatePasses(rule.predicate, options)) continue;
    const validation = validateRuleElement(rule);
    if (!validation.valid) {
      resolved.errors.push({ itemId: item.id, rule: rule.slug, errors: validation.errors });
      continue;
    }
    const provenance = {
      kind: "item-rule",
      scope: rule.target === "action" ? "action" : "actor",
      sourceId: `${item.id}:${rule.slug}`,
      sourceUuid: item.uuid,
      sourceName: item.name,
      definitionId: item.system?.definitionId,
      origin: item.uuid
    };
    const orderKey = [item.uuid ?? item.id ?? "", rule.slug, String(ruleIndex).padStart(6, "0")].join(":");
    const source = { ...rule, itemId: item.id, itemUuid: item.uuid, itemName: item.name, provenance, orderKey, valueNumber: numericRuleValue(rule.value, context.data) };
    if (rule.key === "ActiveEffectLike") {
      const change = normalizeEffectChange({ key: rule.path, mode: rule.mode, value: rule.value, priority: rule.priority }, { source: provenance, index: ruleIndex });
      resolved.changes.push({ ...source, path: change.path, mode: change.mode, priority: change.priority, provenance: change.provenance, orderKey: change.orderKey });
    }
    else if (rule.key === "FlatModifier") resolved.modifiers.push(source);
    else if (rule.key === "DamageDice") resolved.damageDice.push(source);
    else if (rule.key === "Resistance") resolved.resistances.push(source);
    else if (rule.key === "Weakness") resolved.weaknesses.push(source);
    else if (rule.key === "ChoiceSet") {
      resolved.choices.push(source);
      if (rule.selection) options.add(`choice:${rule.slug}:${rule.selection}`);
    } else if (rule.key === "GrantItem") resolved.grants.push(source);
    else if (rule.key === "ItemAlteration") resolved.alterations.push(source);
    else if (rule.key === "DegreeOfSuccess") resolved.degreeAdjustments.push(source);
  }
  for (const entries of [resolved.changes, resolved.modifiers, resolved.damageDice, resolved.resistances, resolved.weaknesses, resolved.choices, resolved.grants, resolved.alterations, resolved.degreeAdjustments]) {
    entries.sort((a, b) => a.priority - b.priority || a.orderKey.localeCompare(b.orderKey));
  }
  return resolved;
}

function selectorsMatch(ruleSelector, selectors) {
  return ruleSelector === "all" || selectors.has(ruleSelector);
}

/** PF2E-style typed stacking: all untyped, highest bonus and lowest penalty per typed group. */
export function stackedModifiers(resolved, selectors = ["all"]) {
  const wanted = new Set(textList(selectors));
  wanted.add("all");
  const candidates = list(resolved?.modifiers)
    .filter(modifier => selectorsMatch(modifier.selector, wanted))
    .sort((a, b) => a.priority - b.priority || String(a.orderKey ?? "").localeCompare(String(b.orderKey ?? "")));
  const untyped = candidates.filter(modifier => modifier.type === "untyped");
  const typed = new Map();
  for (const modifier of candidates.filter(entry => entry.type !== "untyped")) {
    const bucket = typed.get(modifier.type) ?? { bonus: null, penalty: null };
    if (modifier.valueNumber >= 0 && (!bucket.bonus || modifier.valueNumber > bucket.bonus.valueNumber)) bucket.bonus = modifier;
    if (modifier.valueNumber < 0 && (!bucket.penalty || modifier.valueNumber < bucket.penalty.valueNumber)) bucket.penalty = modifier;
    typed.set(modifier.type, bucket);
  }
  const kept = [...untyped];
  for (const bucket of typed.values()) kept.push(...[bucket.bonus, bucket.penalty].filter(Boolean));
  const keptSet = new Set(kept);
  return {
    entries: kept,
    suppressed: candidates.filter(modifier => !keptSet.has(modifier)),
    total: kept.reduce((sum, modifier) => sum + modifier.valueNumber, 0)
  };
}

function applyMode(current, value, mode) {
  if (mode === "override") return value;
  if (mode === "multiply") return finite(current, 0) * value;
  if (mode === "upgrade") return Math.max(finite(current, 0), value);
  if (mode === "downgrade") return Math.min(finite(current, 0), value);
  return finite(current, 0) + value;
}

export function applyResolvedChanges(data, resolved) {
  for (const change of resolved?.changes ?? []) {
    if (!isSafeRulePath(change.path)) continue;
    const current = foundry.utils.getProperty(data, change.path);
    foundry.utils.setProperty(data, change.path, applyMode(current, change.valueNumber, change.mode));
  }
  data.veilrunner ??= {};
  data.veilrunner.rollOptions = [...(resolved?.options ?? [])];
  data.veilrunner.resistances = list(resolved?.resistances).map(entry => ({ type: entry.damageType, amount: entry.amount, source: entry.itemName }));
  data.veilrunner.weaknesses = list(resolved?.weaknesses).map(entry => ({ type: entry.damageType, amount: entry.amount, source: entry.itemName }));
  return data;
}

export function alteredItemSystem(item, resolved) {
  const system = foundry.utils.deepClone(item?.system?.toObject?.() ?? item?.system ?? {});
  for (const alteration of resolved?.alterations ?? []) {
    if (!isSafeRulePath(alteration.path)) continue;
    if (!["self", item.id, item.uuid, item.type].includes(alteration.target)) continue;
    const path = alteration.path.startsWith("system.") ? alteration.path.slice(7) : alteration.path;
    const current = foundry.utils.getProperty(system, path);
    foundry.utils.setProperty(system, path, applyMode(current, alteration.valueNumber, alteration.mode));
  }
  return system;
}

export function adjustedDegreeOfSuccess(base, resolved, selectors = ["all"]) {
  const wanted = new Set(textList(selectors));
  wanted.add("all");
  const adjustment = list(resolved?.degreeAdjustments)
    .filter(rule => selectorsMatch(rule.selector, wanted))
    .reduce((total, rule) => total + rule.adjustment, 0);
  return Math.max(0, Math.min(3, Math.trunc(finite(base)) + adjustment));
}
