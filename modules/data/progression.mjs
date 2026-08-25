function normalizedLevel(level) {
  return Math.max(1, Math.floor(Number(level) || 1));
}

/** Attribute Points earned when reaching one specific character level. */
export function attributePointsGainedAtLevel(level) {
  const normalized = normalizedLevel(level);
  return 10 + Math.ceil(0.4 * normalized);
}

/** Cumulative Attribute Points earned from Level 1 through the given level. */
export function attributePointsForLevel(level) {
  const normalized = normalizedLevel(level);
  let total = 0;
  for (let currentLevel = 1; currentLevel <= normalized; currentLevel += 1) {
    total += attributePointsGainedAtLevel(currentLevel);
  }
  return total;
}

/** Temporary Talent Point total: 10 starting points plus one per level. */
export function talentPointsForLevel(level) {
  return 10 + normalizedLevel(level);
}

/** Temporary Skill Point total: ten points per level. */
export function skillPointsForLevel(level) {
  return 10 * normalizedLevel(level);
}

/** Starting credits: 1,000c at Level 1, plus 100c for each additional level. */
export function creditsForLevel(level) {
  return 1000 + ((normalizedLevel(level) - 1) * 100);
}

/** @deprecated Use the pool-specific helpers. */
export function pointsForLevel(level) {
  return attributePointsForLevel(level);
}
