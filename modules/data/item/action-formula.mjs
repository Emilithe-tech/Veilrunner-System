/** Shared normalization for the compact Action/Ability authoring format. */
export const ACTION_MODES = Object.freeze(["action", "reaction", "ability", "spell", "digital"]);

export function normalizeActionMode(system = {}, itemType = "action") {
  if (itemType === "ability") return "ability";
  if (itemType === "spell") return "spell";
  const explicit = String(system.actionMode ?? "").trim().toLowerCase();
  if (ACTION_MODES.includes(explicit)) return explicit;
  if (itemType === "ability" || system.activationKind === "ability" || system.actionType === "free") return "ability";
  if (system.actionType === "reaction" || system.category === "reactions") return "reaction";
  if (["tech", "digital", "hacking"].includes(system.category)) return "digital";
  return "action";
}

export function legacyActionDamageFormula(system = {}) {
  const authored = String(system.damageFormula ?? "").trim();
  if (authored) return authored;
  const dice = Math.max(0, Math.trunc(Number(system.damageDice) || 0));
  if (!dice) return "";
  const faces = Math.max(2, Math.trunc(Number(system.damageDie) || 6));
  const interval = Math.max(1, Math.trunc(Number(system.damageLevelInterval) || 1));
  if (interval === 1) return `${dice}d${faces} (per level)`;
  return `${dice}d${faces} (every ${interval} levels)`;
}

export function parseActionDamageFormula(value = "") {
  const authored = String(value ?? "").trim();
  const diceMatch = authored.match(/\b(\d+)d(\d+)\b/i);
  const everyMatch = authored.match(/\(\s*every\s+(\d+)\s+(?:spell\s+)?levels?\s*\)/i);
  const perLevel = /\(\s*per\s+(?:spell\s+)?level\s*\)/i.test(authored);
  return {
    authored,
    dice: diceMatch ? Math.max(0, Number(diceMatch[1]) || 0) : 0,
    faces: diceMatch ? Math.max(2, Number(diceMatch[2]) || 2) : 0,
    scaling: perLevel ? "perLevel" : everyMatch ? "interval" : "flat",
    interval: everyMatch ? Math.max(1, Number(everyMatch[1]) || 1) : 1,
    addsAttribute: /\battribute\b/i.test(authored)
  };
}

function cleanDamageExpression(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").replace(/^\s*\+\s*/, "").replace(/\s*\+\s*$/, "").trim();
}

/** Resolve explicit Spell fields, deriving safe values from the former combined formula when needed. */
export function spellDamageFields(system = {}) {
  const base = cleanDamageExpression(system.baseSpellDamage);
  const perLevel = cleanDamageExpression(system.spellDamagePerLevel);
  if (base || perLevel) return { baseSpellDamage: base, spellDamagePerLevel: perLevel };
  const legacy = legacyActionDamageFormula(system);
  if (!legacy) return { baseSpellDamage: "", spellDamagePerLevel: "" };
  const scales = /\(\s*(?:per\s+(?:spell\s+)?level|every\s+\d+\s+(?:spell\s+)?levels?)\s*\)/i.test(legacy);
  if (!scales) return { baseSpellDamage: cleanDamageExpression(legacy), spellDamagePerLevel: "" };
  const dice = legacy.match(/\b\d+d\d+\b/i)?.[0] ?? "";
  const fixed = cleanDamageExpression(legacy
    .replace(/\b\d+d\d+\b/i, "")
    .replace(/\(\s*per\s+(?:spell\s+)?level\s*\)/ig, "")
    .replace(/\(\s*every\s+\d+\s+(?:spell\s+)?levels?\s*\)/ig, ""));
  return { baseSpellDamage: fixed, spellDamagePerLevel: dice || cleanDamageExpression(legacy.replace(/\([^)]*levels?[^)]*\)/ig, "")) };
}

export function resolveActionDamageFormula(value, { level = 1, attributeValue = 0, attributeLabel = "Attribute", potencyMultiplier = 1 } = {}) {
  const parsed = parseActionDamageFormula(value);
  const resolvedLevel = Math.max(1, Math.trunc(Number(level) || 1));
  const scale = parsed.scaling === "perLevel" ? resolvedLevel
    : parsed.scaling === "interval" ? 1 + Math.floor((resolvedLevel - 1) / parsed.interval)
    : 1;
  const dice = parsed.dice * scale * Math.max(1, Math.trunc(Number(potencyMultiplier) || 1));
  const attribute = Number(attributeValue) || 0;
  let formula = parsed.authored
    .replace(/\b\d+d\d+\b/i, dice ? `${dice}d${parsed.faces}` : "")
    .replace(/\(\s*per\s+(?:spell\s+)?level\s*\)/ig, "")
    .replace(/\(\s*every\s+\d+\s+(?:spell\s+)?levels?\s*\)/ig, "")
    .replace(/\battribute\b/ig, String(attribute))
    .replace(/\s+/g, " ")
    .trim();
  formula = formula.replace(/^\+\s*/, "").replace(/\s*\+\s*0$/, "").trim();
  const fixedDamage = parsed.addsAttribute ? attribute : 0;
  const minimum = dice ? dice + fixedDamage : fixedDamage;
  const maximum = dice ? (dice * parsed.faces) + fixedDamage : fixedDamage;
  const average = dice ? (dice * ((parsed.faces + 1) / 2)) + fixedDamage : fixedDamage;
  const terms = [];
  if (dice) terms.push({ kind: "dice", label: `${dice}d${parsed.faces}` });
  if (parsed.addsAttribute) terms.push({ kind: "attribute", label: `+ ${attributeLabel} (${attribute})` });
  return {
    ...parsed,
    available: Boolean(formula),
    formula: formula || "—",
    dice,
    minimum,
    maximum,
    average: Number.isInteger(average) ? average : Number(average.toFixed(1)),
    terms
  };
}

/** Base damage applies once; per-level damage starts at level 1 and applies once per ability level. */
export function resolveSpellDamageFormula(system = {}, { level = 1, attributeValue = 0, attributeLabel = "Attribute", potencyMultiplier = 1 } = {}) {
  const fields = spellDamageFields(system);
  const resolvedLevel = Math.max(1, Math.trunc(Number(level) || 1));
  const base = resolveActionDamageFormula(fields.baseSpellDamage, { level: 1, attributeValue, attributeLabel, potencyMultiplier });
  const perLevel = resolveActionDamageFormula(fields.spellDamagePerLevel ? `${fields.spellDamagePerLevel} (per spell level)` : "", { level: resolvedLevel, attributeValue, attributeLabel, potencyMultiplier });
  const sameDie = base.dice > 0 && perLevel.dice > 0 && base.faces === perLevel.faces;
  let formulas = [base, perLevel].filter(entry => entry.available).map(entry => entry.formula);
  let terms = [...(base.available ? base.terms : []), ...(perLevel.available ? perLevel.terms : [])];
  if (sameDie) {
    const combinedDice = base.dice + perLevel.dice;
    const baseRemainder = cleanDamageExpression(base.formula.replace(/\b\d+d\d+\b/i, ""));
    const perLevelRemainder = cleanDamageExpression(perLevel.formula.replace(/\b\d+d\d+\b/i, ""));
    formulas = [`${combinedDice}d${base.faces}`, baseRemainder, perLevelRemainder].filter(Boolean);
    terms = [{ kind: "dice", label: `${combinedDice}d${base.faces}` }, ...terms.filter(term => term.kind !== "dice")];
  }
  const average = (base.available ? base.average : 0) + (perLevel.available ? perLevel.average : 0);
  const minimum = (base.available ? base.minimum : 0) + (perLevel.available ? perLevel.minimum : 0);
  const maximum = (base.available ? base.maximum : 0) + (perLevel.available ? perLevel.maximum : 0);
  return {
    available: formulas.length > 0,
    formula: formulas.join(" + ") || "—",
    average: Number.isInteger(average) ? average : Number(average.toFixed(1)),
    minimum,
    maximum,
    terms,
    baseSpellDamage: fields.baseSpellDamage,
    spellDamagePerLevel: fields.spellDamagePerLevel,
    level: resolvedLevel
  };
}

export function migrateActionSystemData(source = {}, { itemType = "action", complete = true } = {}) {
  if (!source || typeof source !== "object") return source;
  const owns = key => Object.prototype.hasOwnProperty.call(source, key);
  const hasModeData = complete || ["actionMode", "activationKind", "actionType", "category"].some(owns);
  const mode = hasModeData ? normalizeActionMode(source, itemType) : null;
  if (mode) {
    source.actionMode = mode;
    source.activationKind = mode === "ability" ? "ability" : "action";
    source.actionType = mode === "reaction" ? "reaction" : mode === "ability" ? "free" : "standard";
    if (mode === "spell") source.category = "magic";
    if (mode === "digital") source.category = "digital";
  }
  if (complete || owns("actions") || owns("actionMode")) {
    const resolvedMode = mode ?? normalizeActionMode(source, itemType);
    source.actions = resolvedMode === "ability" ? 0 : Math.min(7, Math.max(1, Math.trunc(Number(source.actions) || 1)));
  }
  if (complete && itemType === "ability" && source.featured && !source.favorite) source.favorite = true;
  const hasCompleteLegacyDamage = ["damageDice", "damageDie", "damageLevelInterval"].every(owns);
  if (complete || owns("damageFormula") || hasCompleteLegacyDamage) {
    if (!String(source.damageFormula ?? "").trim()) source.damageFormula = legacyActionDamageFormula(source);
    else source.damageFormula = String(source.damageFormula).trim();
  }
  if (itemType === "spell" && (complete || owns("damageFormula") || owns("baseSpellDamage") || owns("spellDamagePerLevel") || hasCompleteLegacyDamage)) {
    const fields = spellDamageFields(source);
    source.baseSpellDamage = fields.baseSpellDamage;
    source.spellDamagePerLevel = fields.spellDamagePerLevel;
  }
  return source;
}
