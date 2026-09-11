export const PLANNING_STEPS = Object.freeze(["attributes", "talents", "review"]);

export function planningValidation(level) {
  return {
    valid: true, messages: [], section: new Map(), blockingIssues: [], incompleteSections: [], unspentResources: [],
    completedChecks: [{ key: "review", label: `Level ${level} draft` }], allowedTargets: PLANNING_STEPS,
    readiness: { state: "ready", severity: "info", label: "Plan draft", summary: "Plans can be saved with unspent points and revised later." }
  };
}

export function normalizePlanningLevel(currentLevel, requestedLevel) {
  const minimum = Math.max(1, Math.trunc(Number(currentLevel) || 1)) + 1;
  return Math.max(minimum, Math.trunc(Number(requestedLevel) || minimum));
}

export function planningState(base, plans, level) {
  const draft = plans?.[String(level)]?.state;
  return { ...structuredClone(draft ?? base), startingLevel: level, startingLevelLocked: true };
}

export async function saveLevelPlan(actor, level, state) {
  if (!actor.isOwner) throw new Error("Only an owner can save a level plan.");
  if (!Number.isInteger(level) || level <= Number(actor.system.level)) throw new Error("Choose a future level to plan.");
  await actor.setFlag("Veilrunner", `levelPlans.${level}`, { state: structuredClone(state) });
}
