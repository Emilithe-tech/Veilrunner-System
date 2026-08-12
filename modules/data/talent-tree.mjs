/**
 * Authoritative talent and magic-tree catalog.
 *
 * Rules content deliberately starts empty. Add branches/leaves here (or replace
 * this module with a compendium-backed loader) once the approved rules catalog
 * is available. IDs are persisted on Hero actors and must remain stable.
 * Page shape: { id, name, description, branches: [{ id, name, description,
 * talentCost, requires: [branchId], leaves: [{ id, name, description,
 * talentCost, requiredLevel, requires: [leafId], maxRank }] }] }.
 */
export const VEILRUNNER_TALENT_TREES = Object.freeze({ skills: [], magic: [] });

export function skillPointCostForLevel(level) {
  return Math.max(1, Math.ceil(Math.max(1, Number(level) || 1) / 10));
}

export function talentTreePage(key) {
  return VEILRUNNER_TALENT_TREES[key] ?? [];
}
