import { attributePointsForLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { completedXpBeforeLevel } from "../data/xp.mjs";

const POOLS = [
  { key: "attribute", label: "Attribute", icon: "fa-chart-simple", description: "Improve your core attributes.", total: attributePointsForLevel },
  { key: "talent", label: "Talent", icon: "fa-brain", description: "Unlock and enhance talents.", total: talentPointsForLevel },
  { key: "skill", label: "Skill", icon: "fa-gear", description: "Train and improve skills.", total: skillPointsForLevel }
];

export function progressionPresentation(system, savedPlan = []) {
  const level = Math.max(1, Math.trunc(Number(system.level) || 1));
  const plan = Array.isArray(savedPlan) ? savedPlan : [];
  return {
    level: String(level).padStart(2, "0"), nextLevel: level + 1,
    pools: POOLS.map(pool => {
      const points = system[`${pool.key}Points`] ?? {};
      return { ...pool, total: Number(points.total) || 0, available: Number(points.available) || 0,
        spent: Math.max(0, (Number(points.total) || 0) - (Number(points.available) || 0)),
        gain: pool.total(level + 1) - pool.total(level) };
    }),
    levels: Array.from({ length: 3 }, (_, index) => {
      const futureLevel = level + index + 1;
      return { level: futureLevel, xp: completedXpBeforeLevel(futureLevel).toLocaleString(),
        items: plan.flatMap((item, planIndex) => {
          const pool = POOLS.find(pool => pool.key === item.kind);
          return Number(item.level) === futureLevel && pool
            ? [{ ...item, index: planIndex, icon: pool.icon, label: pool.label }] : [];
        }) };
    })
  };
}
