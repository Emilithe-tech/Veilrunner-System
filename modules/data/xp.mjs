const BASE_LEVEL_XP = 500;
const LEVEL_XP_STEP = 50;

/** XP required to advance from the given level. */
export function xpForLevel(level) {
  const safeLevel = Math.max(1, Math.trunc(Number(level) || 1));
  return BASE_LEVEL_XP + ((safeLevel - 1) * LEVEL_XP_STEP);
}

/** Total XP required to have completed all levels before this one. */
export function completedXpBeforeLevel(level) {
  const completedLevels = Math.max(0, Math.trunc(Number(level) || 1) - 1);
  return (completedLevels * BASE_LEVEL_XP)
    + ((completedLevels * (completedLevels - 1)) / 2 * LEVEL_XP_STEP);
}
