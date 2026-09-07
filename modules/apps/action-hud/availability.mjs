import { REQUIREMENT_STATE, number } from "./constants.mjs";
import { getCombatEconomy } from "./economy.mjs";
import { resolveHudActionContract } from "./action-contract.mjs";

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

/** Player-safe availability decision shared by HUD, sheets, Items, and generated actions. */
export function evaluateActionAvailability({ actor, action, target = null, targetPresentation = null, combat = globalThis.game?.combat, selections = null, resolvedAction = null } = {}) {
  if (!actor?.isOwner && !globalThis.game?.user?.isGM) return result(REQUIREMENT_STATE.UNSATISFIED, "You do not have permission to use this action.");
  if (!action) return result(REQUIREMENT_STATE.UNSATISFIED, "Action is no longer available.");
  if (action.configurationErrors?.length || (!action.resolvedAction && action.valid === false)) {
    return result(REQUIREMENT_STATE.UNSATISFIED, action.configurationErrors?.[0] ?? action.errors?.[0] ?? "Action configuration is invalid.");
  }
  const system = action.system ?? action;
  const contract = resolvedAction ?? resolveHudActionContract(actor, action, { target, targetPresentation, combat, selections: selections ?? action.composerSelections });
  if (contract.targeting.required && !target) return result(REQUIREMENT_STATE.UNSATISFIED, "Requires a target.");

  const timing = contract.timing;
  const actionType = timing.type;
  const combatant = Array.from(combat?.combatants ?? []).find(entry => entry.actor?.id === actor.id);
  if (combatant && !["reaction", "free", "passive"].includes(actionType) && !activeCombatantIds(combat).has(combatant.id)) {
    return result(REQUIREMENT_STATE.UNSATISFIED, "This combatant is not currently active.");
  }

  for (const [key, cost] of Object.entries(contract.resourceCosts)) {
    if (number(cost) > poolValue(actor, key)) return result(REQUIREMENT_STATE.UNSATISFIED, `Insufficient ${key}.`);
  }
  const economy = getCombatEconomy(actor, combat);
  const actionCost = contract.economy;
  if (economy && actionType === "reaction" && actionCost.reactions > economy.reactions) return result(REQUIREMENT_STATE.UNSATISFIED, "No reactions remaining.");
  if (economy && !["reaction", "free", "passive"].includes(actionType) && actionCost.actions > economy.actions) return result(REQUIREMENT_STATE.UNSATISFIED, "Not enough actions remaining.");

  const requirementEvaluation = contract.requirements;
  if (requirementEvaluation.state === REQUIREMENT_STATE.UNKNOWN) return result(REQUIREMENT_STATE.UNKNOWN, requirementEvaluation.reason, requirementEvaluation.details);
  if (requirementEvaluation.state === REQUIREMENT_STATE.UNSATISFIED) return result(REQUIREMENT_STATE.UNSATISFIED, requirementEvaluation.reason, requirementEvaluation.details);
  if (!contract.valid) return result(REQUIREMENT_STATE.UNSATISFIED, contract.errors[0] ?? "Action configuration is invalid.");

  const composer = system.composer ?? action.composer ?? [];
  const chosen = selections ?? action.composerSelections;
  if (composer.some(field => field.required) && !chosen) return result(AVAILABILITY.CONFIGURATION_REQUIRED, "Configuration required.");
  if (action.disabled) return result(REQUIREMENT_STATE.UNSATISFIED, action.disabledReason || "This action is unavailable.");
  return result(REQUIREMENT_STATE.SATISFIED, "", requirementEvaluation.details);
}
