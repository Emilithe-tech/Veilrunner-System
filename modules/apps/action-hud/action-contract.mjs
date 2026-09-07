import { resolveAction } from "../../actions/resolved-action.mjs";
import { isItemEquipped } from "../../rules/item-rules.mjs";
import { getCombatEconomy } from "./economy.mjs";
import { actionRequirements } from "../../data/item/legacy-action-requirements.mjs";

function canObserveTargetRequirement(presentation, requirement) {
  if (requirement.knowledge === "mechanical") return true;
  const kind = requirement.kind ?? requirement.type;
  if (kind === "actorType" || kind === "actor-type") return true;
  if (kind === "health" || kind === "health-percent") return Boolean(presentation?.resources?.health?.exact);
  if (kind !== "effect") return false;
  const reference = String(requirement.reference ?? requirement.key ?? requirement.value ?? "").toLowerCase();
  return (presentation?.conditions ?? []).some(entry => [entry?.id, entry?.name, entry?.definitionId]
    .some(value => String(value ?? "").toLowerCase() === reference));
}

/** Adapt configured HUD data to the shared immutable mechanical contract.
 * Document and executable provider handles remain on the outer HUD presentation.
 */
export function resolveHudActionContract(actor, action, {
  target = null, targetPresentation = null, combat = globalThis.game?.combat,
  selections = action?.resolvedSelections ?? action?.composerSelections ?? {}, validationErrors = []
} = {}) {
  const system = action?.system ?? action ?? {};
  const roll = typeof system.roll === "object" && system.roll !== null ? system.roll : { formula: String(system.rollFormula ?? ""), selector: String(system.selector ?? "action") };
  const draft = {
    id: action?.id, name: action?.name, img: action?.img,
    system: {
      ...system,
      resourceCosts: system.resourceCosts ?? action?.costs ?? {},
      requirements: actionRequirements(system),
      targeting: { ...system.targeting,
        required: Boolean(system.targeting?.required ?? system.targeting?.requiresTarget ?? system.requiresTarget ?? system.targetRequired),
        range: system.range ?? system.targeting?.range ?? 0 },
      owned: { currentLevel: selections?.spellLevel ?? selections?.rank ?? system.owned?.currentLevel ?? system.currentLevel },
      progression: { maxLevel: system.progression?.maxLevel ?? system.maxLevel },
      roll,
      damage: { formula: String(system.damageFormula ?? system.damage?.formula ?? ""), type: String(system.damageType ?? system.damage?.type ?? "") }
    }
  };
  return resolveAction({ actor, source: action?.source ?? action, action: draft,
    provider: action?.source?.parent ?? null, target, selections, knowledge: "player", validationErrors,
    canObserve: (_entity, requirement) => canObserveTargetRequirement(targetPresentation, requirement),
    isEquipped: isItemEquipped, distance: action?.distance, economy: getCombatEconomy(actor, combat) });
}
