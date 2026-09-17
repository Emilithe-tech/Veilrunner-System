import { attributePointsForLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { completedXpBeforeLevel, xpForLevel } from "../data/xp.mjs";
import { auditQualityBuild, perkCapacityForLevel, PERK_ICON } from "../apps/chargen/quality-rules.mjs";
import { plannedPurchases } from "./planned-purchases.mjs";

const POOLS = [
  { key: "attribute", label: "Attribute", icon: "fa-chart-simple", description: "Improve core attributes.", total: attributePointsForLevel },
  { key: "talent", label: "Talent", icon: "fa-brain", description: "Unlock new abilities", total: talentPointsForLevel },
  { key: "skill", label: "Skill", icon: "fa-gear", description: "Train and improve skills.", total: skillPointsForLevel },
  { key: "perk", label: "Perk", icon: PERK_ICON, description: "Acquire perks.", total: perkCapacityForLevel }
];

/** Display either the current level's XP budget or cumulative level thresholds. */
export function progressionExperience(level, value, mode = "level") {
  const current = Math.max(0, Number(value) || 0);
  const completed = completedXpBeforeLevel(level);
  const total = mode === "total";
  const displayed = current + (total ? completed : 0);
  const maximum = xpForLevel(level) + (total ? completed : 0);
  return {
    total, label: total ? "Total XP" : "Level XP", minimum: total ? completed : 0,
    value: displayed, maximum,
    valueLabel: displayed.toLocaleString(), maximumLabel: maximum.toLocaleString(),
    percent: Math.max(0, Math.min(100, displayed / maximum * 100))
  };
}

export function levelXpFromTotal(level, value, fallback = 0) {
  const total = Number(value);
  if (value === "" || value == null || !Number.isFinite(total)) return fallback;
  return Math.max(0, total - completedXpBeforeLevel(level));
}

export function progressionPresentation(system, savedPlan = [], levelPlans = {}, catalog = {}, previewCount = 3, previewOffset = 0, pointsMode = "available:") {
  const level = Math.max(1, Math.trunc(Number(system.level) || 1));
  const currentXp = Math.max(0, Number(system.experience?.value) || 0);
  const earnedXp = completedXpBeforeLevel(level) + currentXp;
  const progressBetween = (from, to) => Math.max(0, Math.min(100, (earnedXp - from) / (to - from) * 100));
  const plan = Array.isArray(savedPlan) ? savedPlan : [];
  const purchases = plannedPurchases(system, levelPlans, catalog);
  const perkAudit = auditQualityBuild({ level, qualitiesTaken: system.qualitiesTaken });
  const normalizedPointsMode = pointsMode === "spent" ? "spent" : "available";
  const view = {
    level: String(level).padStart(2, "0"),
    nextLevel: level + 1,

    pointsMode: normalizedPointsMode,
    pointsModeAvailable: normalizedPointsMode === "available",
    pointsModeSpent: normalizedPointsMode === "spent",

    milestones: Array.from({ length: level }, (_, index) => {
      const reached = index + 1;
      return { level: reached, digits: String(reached).padStart(2, "0"), current: reached === level,
        xp: completedXpBeforeLevel(reached).toLocaleString(), reached: true,
        starting: reached === 1,
        gains: POOLS.map(pool => ({ key: pool.key, label: pool.label, icon: pool.icon,
          gain: pool.total(reached) - (reached > 1 ? pool.total(reached - 1) : 0) })) };
    }),
    pools: POOLS.map(pool => {
      let total;
      let available;
      let spent;
      let derived = false;

      if (pool.key === "perk") {
        total = perkAudit.perkCapacity;
        available = perkAudit.perkPointsRemaining;
        spent = perkAudit.perkPointsUsed;
        derived = true;
      } else {
        const points = system[`${pool.key}Points`] ?? {};

        total = Number(points.total) || 0;
        available = Number(points.available) || 0;
        spent = Math.max(0, total - available);
      }

      const showingSpent = pointsMode === "spent:";
      const displayValue = showingSpent ? spent : available;

      return {
        ...pool,

        total,
        available,
        spent,
        derived,

        displayLabel: showingSpent ? "Spent" : "Available",
        displayValue,
        displayValueLabel: displayValue.toLocaleString(),

        gain: pool.total(level + 1) - pool.total(level)
      };
    }),
    levels: Array.from({ length: previewCount }, (_, index) => {
      const futureLevel = level + previewOffset + index + 1;
      return { level: futureLevel, digits: String(futureLevel).padStart(2, "0"),
        xp: completedXpBeforeLevel(futureLevel).toLocaleString(),
        columnPercent: progressBetween(completedXpBeforeLevel(futureLevel - 1), completedXpBeforeLevel(futureLevel)),
        canImplement: previewOffset + index === 0 && currentXp >= xpForLevel(level) && Boolean(levelPlans?.[futureLevel]?.state),
        gains: POOLS.map(pool => ({
          key: pool.key, label: pool.label, icon: pool.icon,
          gain: pool.total(futureLevel) - pool.total(futureLevel - 1)
        })),
        items: purchases.has(futureLevel) ? purchases.get(futureLevel).map(item => {
          const pool = POOLS.find(pool => pool.key === item.kind);
          return { ...item, icon: pool?.icon ?? "fa-wand-magic-sparkles", label: pool?.label ?? "Spell" };
        }) : plan.flatMap((item, planIndex) => {
          const pool = POOLS.find(pool => pool.key === item.kind);
          return Number(item.level) === futureLevel && pool
            ? [{ ...item, index: planIndex, icon: pool.icon, label: pool.label }] : [];
        }) };
    })
  };
  view.roadmap = [view.milestones.at(-1), ...view.levels.slice(0, 2)].map(entry => ({
    ...entry,
    columnPercent: progressBetween(completedXpBeforeLevel(entry.level), completedXpBeforeLevel(entry.level + 1))
  }));
  view.nextLevelPreview = view.levels[0];
  view.journey = [...view.milestones, ...view.levels.map(entry => ({ ...entry, future: true }))];
  return view;
}
