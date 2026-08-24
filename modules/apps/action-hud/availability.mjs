import { isItemEquipped } from "../../rules/item-rules.mjs";
import { hasItemIntent } from "../../data/item/identity.mjs";
import { REQUIREMENT_STATE, number } from "./constants.mjs";
import { getCombatEconomy } from "./economy.mjs";
import { effectMatches } from "./visibility.mjs";

export const AVAILABILITY = Object.freeze({
  AVAILABLE: REQUIREMENT_STATE.SATISFIED,
  CONFIGURATION_REQUIRED: "configuration-required",
  UNAVAILABLE: REQUIREMENT_STATE.UNSATISFIED,
  UNKNOWN: REQUIREMENT_STATE.UNKNOWN
});

const result = (state, reason = "", details = []) => ({ state, reason, details, available: state === REQUIREMENT_STATE.SATISFIED });
const poolValue = (actor, key) => Math.max(0, number(actor?.system?.resources?.[key]?.value));

function activeCombatantIds(combat) {
  return new Set((globalThis.game?.veilrunner?.getActivePhaseCombatants?.() ?? [combat?.combatant].filter(Boolean)).map(entry => entry.id));
}

function compare(left, operator, right) {
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  if (operator === "neq") return left !== right;
  return left === right;
}

function requirementResult(requirement, { actor, target, targetPresentation }) {
  const scope = requirement.scope === "target" ? target : actor;
  const type = String(requirement.type ?? "effect");
  const key = String(requirement.key ?? requirement.value ?? "");
  const expected = requirement.value;
  const operator = String(requirement.operator ?? "eq");
  if (requirement.scope === "target" && !target) return { state: REQUIREMENT_STATE.UNSATISFIED, reason: "Requires a target." };
  if (type === "effect") {
    const effect = effectMatches(scope, key);
    if (requirement.scope === "target" && requirement.knowledge !== "mechanical" && !targetPresentation?.conditions?.some(entry => entry.id === effect?.id)) {
      return { state: REQUIREMENT_STATE.UNKNOWN, reason: "Target condition uncertain." };
    }
    const stacks = Number(effect?.flags?.[globalThis.game?.system?.id]?.stacks ?? 1) || 1;
    return { state: effect && compare(stacks, operator === "eq" ? "gte" : operator, number(expected, 1)) ? REQUIREMENT_STATE.SATISFIED : REQUIREMENT_STATE.UNSATISFIED, reason: `Requires ${key}.` };
  }
  if (type === "resource") {
    const value = poolValue(scope, key);
    return { state: compare(value, operator, number(expected)) ? REQUIREMENT_STATE.SATISFIED : REQUIREMENT_STATE.UNSATISFIED, reason: `Requires ${key} ${operator} ${expected}.` };
  }
  if (type === "health-percent") {
    if (requirement.scope === "target" && requirement.knowledge !== "mechanical" && !targetPresentation?.resources?.health?.exact) return { state: REQUIREMENT_STATE.UNKNOWN, reason: "Target condition uncertain." };
    const pool = scope?.system?.resources?.health;
    const percent = Number(pool?.max) > 0 ? Math.round(Number(pool.value) / Number(pool.max) * 100) : 0;
    return { state: compare(percent, operator, number(expected)) ? REQUIREMENT_STATE.SATISFIED : REQUIREMENT_STATE.UNSATISFIED, reason: "Health requirement not met." };
  }
  if (type === "actor-type") return { state: compare(String(scope?.type ?? ""), operator, String(expected ?? key)) ? REQUIREMENT_STATE.SATISFIED : REQUIREMENT_STATE.UNSATISFIED, reason: "Target type requirement not met." };
  if (type === "trait") return { state: (scope?.system?.traits ?? scope?.system?.tags ?? []).includes(key) ? REQUIREMENT_STATE.SATISFIED : REQUIREMENT_STATE.UNSATISFIED, reason: `Requires ${key}.` };
  return { state: REQUIREMENT_STATE.UNKNOWN, reason: `Requirement ${type} cannot currently be verified.` };
}

/** Player-safe availability decision shared by HUD, sheets, Items, and generated actions. */
export function evaluateActionAvailability({ actor, action, target = null, targetPresentation = null, combat = globalThis.game?.combat, selections = null } = {}) {
  if (!actor?.isOwner && !globalThis.game?.user?.isGM) return result(REQUIREMENT_STATE.UNSATISFIED, "You do not have permission to use this action.");
  if (!action) return result(REQUIREMENT_STATE.UNSATISFIED, "Action is no longer available.");
  if (action.valid === false) return result(REQUIREMENT_STATE.UNSATISFIED, action.errors?.[0] ?? "Action configuration is invalid.");
  const system = action.system ?? action;
  const requiredTarget = Boolean(system.requiresTarget || system.targetRequired || system.targeting?.requiresTarget);
  if (requiredTarget && !target) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires a target.");

  const actionType = system.actionType ?? action.actionType ?? "standard";
  const combatant = Array.from(combat?.combatants ?? []).find(entry => entry.actor?.id === actor.id);
  if (combatant && !["reaction", "free", "passive"].includes(actionType) && !activeCombatantIds(combat).has(combatant.id)) {
    return result(REQUIREMENT_STATE.UNSATISFIED, "This combatant is not currently active.");
  }

  const equipped = Array.from(actor.items ?? []).filter(item => isItemEquipped(actor, item));
  if (system.requiredItemTypes?.length && !equipped.some(item => system.requiredItemTypes.includes(item.type))) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires an equipped item of the required type.");
  if (system.requiredItemTraits?.length && !equipped.some(item => system.requiredItemTraits.every(trait => item.system?.traits?.includes(trait)))) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires the listed equipped item traits.");
  if (system.requiredDefinitionIds?.length && !system.requiredDefinitionIds.every(id => equipped.some(item => item.system?.definitionId === id))) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires the listed equipped item definition.");
  if (system.requiredItemIntents?.length && !system.requiredItemIntents.every(intent => equipped.some(item => hasItemIntent(item, intent)))) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires the listed equipped item capability.");

  for (const [key, cost] of Object.entries(system.resourceCosts ?? action.costs ?? {})) {
    if (number(cost) > poolValue(actor, key)) return result(REQUIREMENT_STATE.UNSATISFIED, `Insufficient ${key}.`);
  }
  const economy = getCombatEconomy(actor, combat);
  const actionCost = Math.max(0, number(system.actions ?? action.actionCount ?? 1));
  if (economy && actionType === "reaction" && economy.reactions < 1) return result(REQUIREMENT_STATE.UNSATISFIED, "No reactions remaining.");
  if (economy && !["reaction", "free", "passive"].includes(actionType) && actionCost > economy.actions) return result(REQUIREMENT_STATE.UNSATISFIED, "Not enough actions remaining.");

  const legacySelf = (system.requiredEffects ?? []).map(value => ({ scope: "actor", type: "effect", key: value, operator: "gte", value: 1 }));
  const legacyTarget = (system.requiredTargetEffects ?? []).map(value => ({ scope: "target", type: "effect", key: value, operator: "gte", value: 1 }));
  const checks = [...legacySelf, ...legacyTarget, ...(system.requirements ?? [])].map(requirement => requirementResult(requirement, { actor, target, targetPresentation }));
  const unknown = checks.find(check => check.state === REQUIREMENT_STATE.UNKNOWN);
  if (unknown) return result(REQUIREMENT_STATE.UNKNOWN, unknown.reason, checks);
  const failed = checks.find(check => check.state === REQUIREMENT_STATE.UNSATISFIED);
  if (failed) return result(REQUIREMENT_STATE.UNSATISFIED, failed.reason, checks);

  const composer = system.composer ?? action.composer ?? [];
  const chosen = selections ?? action.composerSelections;
  if (composer.some(field => field.required) && !chosen) return result(AVAILABILITY.CONFIGURATION_REQUIRED, "Configuration required.");
  if (action.disabled) return result(REQUIREMENT_STATE.UNSATISFIED, action.disabledReason || "This action is unavailable.");
  return result(REQUIREMENT_STATE.SATISFIED, "", checks);
}
