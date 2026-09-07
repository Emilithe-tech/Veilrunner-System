import {
  REQUIREMENT_STATES,
  evaluateRequirements
} from "../rules/requirement-evaluator.mjs";

export const ACTION_TIMINGS = Object.freeze(["action", "reaction", "free", "passive"]);

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function whole(value, fallback = 0) {
  const number = Number(value);
  return Math.max(0, Math.trunc(Number.isFinite(number) ? number : fallback));
}

function actionSystem(action) {
  return action?.system ?? action ?? {};
}

export function normalizeActionTiming(action) {
  const system = actionSystem(action);
  const value = String(system?.timing?.type ?? system?.actionType ?? system?.actionMode ?? "action").toLowerCase();
  const type = value === "reaction" || value === "reactions"
    ? "reaction"
    : value === "free"
      ? "free"
      : value === "passive"
        ? "passive"
        : "action";
  return Object.freeze({ type, trigger: String(system?.timing?.trigger ?? system?.trigger ?? "") });
}

export function normalizeActionEconomy(action, timing = normalizeActionTiming(action)) {
  const system = actionSystem(action);
  const economy = system.economy ?? {};
  if (timing.type === "passive" || timing.type === "free") return Object.freeze({ actions: 0, reactions: 0 });
  if (timing.type === "reaction") {
    return Object.freeze({ actions: 0, reactions: Math.max(1, whole(economy.reactions ?? system.reactions, 1)) });
  }
  return Object.freeze({ actions: whole(economy.actions ?? system.actions ?? action?.actionCount, 1), reactions: 0 });
}

export function normalizeResourceCosts(action) {
  const system = actionSystem(action);
  const costs = system.costs?.resources ?? system.resourceCosts ?? action?.costs ?? {};
  return Object.freeze(Object.fromEntries(Object.entries(costs)
    .map(([key, value]) => [String(key), Math.max(0, Number(value) || 0)])
    .filter(([, value]) => value > 0)));
}

export class ResolvedAction {
  constructor(data) {
    Object.assign(this, clone(data));
    deepFreeze(this);
  }

  canAfford({ economy = null, resources = {} } = {}) {
    if (economy) {
      if (this.economy.actions > whole(economy.actions)) return false;
      if (this.economy.reactions > whole(economy.reactions)) return false;
    }
    return Object.entries(this.resourceCosts).every(([key, cost]) => Number(resources?.[key]?.value ?? resources?.[key] ?? 0) >= cost);
  }

  toObject() {
    return clone(this);
  }
}

/** Normalize one authored/owned action into the contract used by every consumer. */
export function resolveAction({
  actor,
  source,
  action = source,
  provider = source?.parent ?? null,
  target = null,
  selections = {},
  knowledge = "mechanical",
  canObserve = undefined,
  isEquipped = undefined,
  distance = undefined,
  economy = null,
  validationErrors = []
} = {}) {
  const system = actionSystem(action);
  const timing = normalizeActionTiming(action);
  const actionEconomy = normalizeActionEconomy(action, timing);
  const resourceCosts = normalizeResourceCosts(action);
  const requirements = evaluateRequirements(system.requirements ?? [], {
    actor,
    target,
    source,
    knowledge,
    canObserve,
    isEquipped,
    distance
  });
  const errors = [...validationErrors];
  if (requirements.state === REQUIREMENT_STATES.UNSATISFIED) errors.push(requirements.reason);
  if (requirements.state === REQUIREMENT_STATES.UNKNOWN) errors.push("Requirements cannot be verified.");
  const resources = actor?.system?.resources ?? {};
  const targeting = {
    type: String(system.targeting?.type ?? system.targetType ?? "self"),
    required: Boolean(system.targeting?.required ?? system.targeting?.requiresTarget ?? system.requiresTarget),
    count: Math.max(1, whole(system.targeting?.count, 1)),
    range: Math.max(0, Number(system.targeting?.range ?? system.range) || 0)
  };
  if (targeting.required && !target) errors.push("Requires a target.");

  const draft = {
    id: String(action?.id ?? action?._id ?? system.id ?? ""),
    definitionId: String(system.definitionId ?? action?.definitionId ?? ""),
    name: String(action?.name ?? system.label ?? "Action"),
    img: String(action?.img ?? ""),
    sourceUuid: String(source?.uuid ?? action?.sourceUuid ?? action?.uuid ?? ""),
    providerUuid: String(provider?.uuid ?? action?.providerUuid ?? ""),
    actorId: String(actor?.id ?? ""),
    timing,
    economy: actionEconomy,
    resourceCosts,
    targeting,
    requirements,
    level: Math.max(1, whole(system.owned?.currentLevel ?? system.currentLevel, 1)),
    maxLevel: Math.max(1, whole(system.progression?.maxLevel ?? system.maxLevel, 1)),
    traits: [...new Set(Array.from(system.traits ?? action?.traits ?? [], value => String(value)))],
    roll: clone(system.roll ?? { formula: String(system.rollFormula ?? action?.rollFormula ?? ""), selector: String(system.selector ?? "action") }),
    damage: clone(system.damage ?? { formula: String(action?.damageFormula ?? system.damageFormula ?? ""), type: String(system.damageType ?? "") }),
    effects: clone(system.effects ?? []),
    selections: clone(selections ?? {}),
    valid: errors.length === 0,
    errors
  };
  const resolved = new ResolvedAction(draft);
  if (resolved.valid && !resolved.canAfford({ economy, resources })) {
    return new ResolvedAction({ ...draft, valid: false, errors: [...errors, "Action costs cannot be afforded."] });
  }
  return resolved;
}
