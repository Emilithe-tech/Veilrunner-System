const clone = value => structuredClone(value ?? {});
const whole = (value, fallback = 1, minimum = 0) => Number.isFinite(Number(value)) && value !== null && value !== ""
  ? Math.max(minimum, Math.trunc(Number(value))) : fallback;

/** Translate the Item form into the same mechanics read by HUD and sheet consumers. */
export function actionAuthoringContracts(current, submitted, { actorOwned = false } = {}) {
  const result = clone(submitted);
  const previousTiming = current.timing?.type ?? "action";
  const mode = result.actionMode;
  const timing = result.timing?.type ?? (mode === undefined || mode === current.actionMode ? previousTiming
    : mode === "reaction" ? "reaction" : mode === "ability" ? "free" : "action");
  if (Object.hasOwn(result, "actionMode") || result.economy || result.timing) {
    const economy = result.economy ?? {};
    const cost = whole(economy[timing === "reaction" ? "reactions" : "actions"],
      whole(current.economy?.[previousTiming === "reaction" ? "reactions" : "actions"], 1));
    result.timing = { ...clone(current.timing), ...result.timing, type: timing };
    result.economy = timing === "reaction" ? { actions: 0, reactions: Math.max(1, cost) }
      : ["free", "passive"].includes(timing) ? { actions: 0, reactions: 0 } : { actions: cost, reactions: 0 };
  }
  const maxLevel = whole(result.progression?.maxLevel, whole(current.progression?.maxLevel, 1, 1), 1);
  if (result.progression) result.progression = { ...clone(current.progression), ...result.progression, maxLevel };
  if (actorOwned && result.owned) {
    result.owned = { ...clone(current.owned), ...result.owned,
      currentLevel: Math.min(maxLevel, whole(result.owned.currentLevel, whole(current.owned?.currentLevel, 1, 1), 1)) };
  }
  if (!actorOwned) delete result.owned;
  return result;
}
