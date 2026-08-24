export const QUALITY_TIERS = Object.freeze(["Minor", "Moderate", "Significant", "Major", "Extreme"]);
export const QUALITY_PILLARS = Object.freeze(["Physical", "Social", "Magical", "Technical"]);
export const QUALITY_TIER_COSTS = Object.freeze({ Minor: 1, Moderate: 2, Significant: 3, Major: 4, Extreme: 5 });
export const QUALITY_LIMITS = Object.freeze({ flawMinimum: 20, minorFlawMaximum: 8, pillarMaximum: 10 });
export const QUALITY_BLOCKING_REASONS = Object.freeze({
  duplicate: "ALREADY SELECTED",
  perkCapacity: "INSUFFICIENT PP",
  minorFlaw: "MINOR CAP",
  pillar: "PILLAR CAP",
  requirement: "REQUIREMENT"
});

const list = value => Array.isArray(value) ? value : [];
const key = value => String(value ?? "").trim().toLowerCase();
const points = entry => tierCost(entry?.tier);

export function tierCost(tier) {
  return QUALITY_TIER_COSTS[QUALITY_TIERS.includes(tier) ? tier : "Minor"];
}

export function perkCapacityForLevel(level) {
  const normalized = Math.min(50, Math.max(1, Math.trunc(Number(level) || 1)));
  return 10 + (3 * Math.floor(normalized / 5)) + Math.floor(normalized / 10);
}

export function qualitySelectionId(entry = {}) {
  return String(entry.definitionId || entry.sourceUuid || entry.id || "").trim();
}

export function auditQualityBuild({ level = 1, qualitiesTaken = [], flawsTaken = [] } = {}) {
  const perks = list(qualitiesTaken);
  const flaws = list(flawsTaken);
  const perkCapacity = perkCapacityForLevel(level);
  const perkPointsUsed = perks.reduce((sum, entry) => sum + points(entry), 0);
  const flawPoints = flaws.reduce((sum, entry) => sum + points(entry), 0);
  const minorFlawPoints = flaws.filter(entry => entry?.tier === "Minor").reduce((sum, entry) => sum + points(entry), 0);
  const all = [...perks, ...flaws];
  const pillarTotals = Object.fromEntries(QUALITY_PILLARS.map(pillar => [pillar,
    all.filter(entry => key(entry?.pillar) === key(pillar)).reduce((sum, entry) => sum + points(entry), 0)
  ]));
  const flawPillarTotals = Object.fromEntries(QUALITY_PILLARS.map(pillar => [pillar,
    flaws.filter(entry => key(entry?.pillar) === key(pillar)).reduce((sum, entry) => sum + points(entry), 0)
  ]));
  const perkPillarTotals = Object.fromEntries(QUALITY_PILLARS.map(pillar => [pillar,
    perks.filter(entry => key(entry?.pillar) === key(pillar)).reduce((sum, entry) => sum + points(entry), 0)
  ]));
  const selectedIds = new Set(all.map(qualitySelectionId).filter(Boolean));
  return {
    perkCapacity,
    perkPointsUsed,
    perkPointsRemaining: Math.max(0, perkCapacity - perkPointsUsed),
    flawPoints,
    flawRequirementRemaining: Math.max(0, QUALITY_LIMITS.flawMinimum - flawPoints),
    flawRequirementMet: flawPoints >= QUALITY_LIMITS.flawMinimum,
    minorFlawPoints,
    minorFlawRemaining: Math.max(0, QUALITY_LIMITS.minorFlawMaximum - minorFlawPoints),
    minorFlawCapped: minorFlawPoints >= QUALITY_LIMITS.minorFlawMaximum,
    pillarTotals,
    flawPillarTotals,
    perkPillarTotals,
    pillarRemaining: Object.fromEntries(QUALITY_PILLARS.map(pillar => [pillar, Math.max(0, QUALITY_LIMITS.pillarMaximum - flawPillarTotals[pillar])])),
    selectedIds,
    valid: perkPointsUsed <= perkCapacity
      && flawPoints >= QUALITY_LIMITS.flawMinimum
      && minorFlawPoints <= QUALITY_LIMITS.minorFlawMaximum
      && QUALITY_PILLARS.every(pillar => flawPillarTotals[pillar] <= QUALITY_LIMITS.pillarMaximum)
  };
}

export function evaluateQualityRequirements(entry, build = {}, audit = auditQualityBuild(build)) {
  const failures = [];
  const requirements = entry?.requirements ?? {};
  const level = Math.max(1, Math.trunc(Number(build?.level) || 1));
  if (Number(requirements.minimumLevel) > level) failures.push(`Requires Level ${Math.trunc(Number(requirements.minimumLevel))}.`);
  const selected = audit.selectedIds;
  const requiredIds = list(requirements.requiredDefinitionIds).filter(Boolean);
  const missingIds = requiredIds.filter(id => !selected.has(id));
  if (missingIds.length) failures.push(`Requires: ${missingIds.join(", ")}.`);
  const actorTags = new Set(list(build?.tags).map(key));
  const missingTags = list(requirements.requiredTags).filter(tag => !actorTags.has(key(tag)));
  if (missingTags.length) failures.push(`Requires tags: ${missingTags.join(", ")}.`);
  return failures;
}

export function evaluateQualitySelection(entry, build = {}, audit = auditQualityBuild(build)) {
  const cost = tierCost(entry?.tier);
  const kind = entry?.kind === "flaw" ? "flaw" : "perk";
  const pillar = QUALITY_PILLARS.includes(entry?.pillar) ? entry.pillar : "Physical";
  const reasons = [];
  const detailedReasons = [];
  const id = qualitySelectionId(entry);
  if (id && audit.selectedIds.has(id)) {
    reasons.push("duplicate");
    detailedReasons.push("This entry is already selected.");
  }
  if (kind === "perk" && audit.perkPointsUsed + cost > audit.perkCapacity) {
    reasons.push("perkCapacity");
    detailedReasons.push(`Perk Points would exceed ${audit.perkCapacity}.`);
  }
  if (kind === "flaw" && entry?.tier === "Minor" && audit.minorFlawPoints + cost > QUALITY_LIMITS.minorFlawMaximum) {
    reasons.push("minorFlaw");
    detailedReasons.push(`Minor Flaws would exceed ${QUALITY_LIMITS.minorFlawMaximum} points.`);
  }
  if (kind === "flaw" && (audit.flawPillarTotals[pillar] ?? 0) + cost > QUALITY_LIMITS.pillarMaximum) {
    reasons.push("pillar");
    detailedReasons.push(`${pillar} would exceed its ${QUALITY_LIMITS.pillarMaximum}-point limit.`);
  }
  const failedRequirements = evaluateQualityRequirements(entry, build, audit);
  if (failedRequirements.length) {
    reasons.push("requirement");
    detailedReasons.push(...failedRequirements);
  }
  return {
    canSelect: reasons.length === 0,
    selectionBlockingReasons: reasons,
    selectionBlockingDetails: detailedReasons,
    conciseReason: reasons.length ? QUALITY_BLOCKING_REASONS[reasons[0]] : "AVAILABLE",
    impact: {
      perkPoints: kind === "perk" ? { from: audit.perkPointsUsed, to: audit.perkPointsUsed + cost, maximum: audit.perkCapacity } : null,
      flawPoints: kind === "flaw" ? { from: audit.flawPoints, to: audit.flawPoints + cost, minimum: QUALITY_LIMITS.flawMinimum } : null,
      pillar: kind === "flaw"
        ? { name: pillar, from: audit.flawPillarTotals[pillar] ?? 0, to: (audit.flawPillarTotals[pillar] ?? 0) + cost, maximum: QUALITY_LIMITS.pillarMaximum }
        : { name: pillar, from: audit.perkPillarTotals[pillar] ?? 0, to: (audit.perkPillarTotals[pillar] ?? 0) + cost, maximum: null }
    }
  };
}

export function evaluateQualityRemoval(entry, build = {}, audit = auditQualityBuild(build)) {
  const id = qualitySelectionId(entry);
  const selected = Boolean(id && audit.selectedIds.has(id));
  return {
    canRemove: selected,
    blockingReasons: selected ? [] : ["notSelected"],
    blockingDetails: selected ? [] : ["This entry is not selected."]
  };
}

export function qualitySelectionSnapshot(entry = {}) {
  const tier = QUALITY_TIERS.includes(entry.tier) ? entry.tier : "Minor";
  return {
    definitionId: String(entry.definitionId ?? ""),
    sourceUuid: String(entry.sourceUuid ?? entry.uuid ?? ""),
    name: String(entry.name ?? "").trim(),
    pillar: QUALITY_PILLARS.includes(entry.pillar) ? entry.pillar : "Physical",
    tier,
    points: tierCost(tier),
    description: String(entry.description ?? ""),
    mechanics: String(entry.mechanics ?? ""),
    requirements: String(entry.requirementsText ?? (typeof entry.requirements === "string" ? entry.requirements : entry.requirements?.text) ?? ""),
    tags: list(entry.tags).map(value => String(value).trim()).filter(Boolean)
  };
}

export function normalizeQualitySelections(entries = []) {
  return list(entries).filter(entry => entry && typeof entry === "object").map(qualitySelectionSnapshot);
}
