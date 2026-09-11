import { resolveActionDamageFormula } from "../data/item/action-formula.mjs";

export function firearmDamageFormula(base, maximum, { capped = false } = {}) {
  const formula = String(base ?? "").trim().replace(/\+\s*-/g, "-");
  if (!capped || !formula) return formula;
  const additive = /^[+-]?(?:\d+d\d+|\d+(?:\.\d+)?)(?:[+-](?:\d+d\d+|\d+(?:\.\d+)?))*$/i;
  if (!additive.test(formula.replace(/\s/g, "")) || !additive.test(String(maximum ?? "").replace(/\s/g, ""))) return "";
  const ceiling = resolveActionDamageFormula(String(maximum ?? ""));
  if (!ceiling.available || !Number.isFinite(ceiling.maximum) || ceiling.maximum < 0) return "";
  return `min((${formula}), ${ceiling.maximum})`;
}
