import assert from "node:assert/strict";
import {
  QUALITY_BLOCKING_REASONS, auditQualityBuild, evaluateQualityRemoval, evaluateQualityRequirements,
  evaluateQualitySelection, normalizeQualitySelections, perkCapacityForLevel, qualitySelectionSnapshot, tierCost
} from "../modules/apps/chargen/quality-rules.mjs";
import { normalizeQualityRecord, qualityCatalogFacets, queryQualityCatalog } from "../modules/apps/chargen/quality-catalog.mjs";

const expectedCapacities = new Map([[1,10],[5,13],[10,17],[15,20],[20,24],[25,27],[30,31],[35,34],[40,38],[45,41],[50,45]]);
for (let level = 1; level <= 50; level++) {
  const expected = 10 + (3 * Math.floor(level / 5)) + Math.floor(level / 10);
  assert.equal(perkCapacityForLevel(level), expected, `Level ${level} capacity follows progression`);
}
for (const [level, capacity] of expectedCapacities) assert.equal(perkCapacityForLevel(level), capacity);
assert.equal(perkCapacityForLevel(0), 10, "capacity clamps below Level 1");
assert.equal(perkCapacityForLevel(99), 45, "capacity clamps above Level 50");
assert.deepEqual(["Minor","Moderate","Significant","Major","Extreme"].map(tierCost), [1,2,3,4,5]);

const perk = (id, tier = "Minor", pillar = "Physical") => ({ definitionId: id, name: id, kind: "perk", tier, pillar, tags: [] });
const flaw = (id, tier = "Minor", pillar = "Social") => ({ definitionId: id, name: id, kind: "flaw", tier, pillar, tags: [] });
let build = {
  level: 10,
  qualitiesTaken: [perk("veilrunner.quality.a", "Extreme"), perk("veilrunner.quality.b", "Major")],
  flawsTaken: [flaw("veilrunner.quality.c", "Extreme"), flaw("veilrunner.quality.d", "Extreme"), flaw("veilrunner.quality.e", "Extreme"), flaw("veilrunner.quality.f", "Extreme")]
};
let audit = auditQualityBuild(build);
assert.equal(audit.perkCapacity, 17);
assert.equal(audit.perkPointsUsed, 9);
assert.equal(audit.flawPoints, 20);
assert.equal(audit.flawRequirementMet, true);
assert.equal(audit.minorFlawPoints, 0, "Minor perks do not count against the Minor Flaw cap");

const minorPerks = Array.from({ length: 8 }, (_, index) => perk(`veilrunner.quality.minor-perk-${index}`, "Minor", "Technical"));
audit = auditQualityBuild({ level: 50, qualitiesTaken: minorPerks, flawsTaken: [] });
assert.equal(audit.minorFlawPoints, 0);
assert.equal(audit.pillarTotals.Technical, 8, "pillars combine tier-derived points");
assert.equal(audit.flawPillarTotals.Technical, 0, "the visible flaw tracker excludes perks");
assert.equal(audit.perkPillarTotals.Technical, 8, "the perk tracker counts perk points by pillar");

const minorFlaws = Array.from({ length: 8 }, (_, index) => flaw(`veilrunner.quality.minor-flaw-${index}`, "Minor", index < 4 ? "Social" : "Magical"));
audit = auditQualityBuild({ level: 50, qualitiesTaken: [], flawsTaken: minorFlaws });
assert.equal(audit.minorFlawCapped, true);
assert.deepEqual(audit.flawPillarTotals, { Physical: 0, Social: 4, Magical: 4, Technical: 0 });
assert.equal(evaluateQualitySelection(flaw("veilrunner.quality.too-many", "Minor"), { level: 50, qualitiesTaken: [], flawsTaken: minorFlaws }).conciseReason, QUALITY_BLOCKING_REASONS.minorFlaw);

build = { level: 1, qualitiesTaken: [perk("veilrunner.quality.major-a", "Extreme"), perk("veilrunner.quality.major-b", "Extreme")], flawsTaken: [] };
assert.equal(evaluateQualitySelection(perk("veilrunner.quality.over", "Minor", "Social"), build).conciseReason, QUALITY_BLOCKING_REASONS.perkCapacity);
build = { level: 50, qualitiesTaken: [perk("veilrunner.quality.physical-a", "Extreme"), perk("veilrunner.quality.physical-b", "Extreme")], flawsTaken: [] };
const unlimitedPerk = evaluateQualitySelection(perk("veilrunner.quality.physical-c", "Minor"), build);
assert.equal(unlimitedPerk.canSelect, true, "perk pillars have no point cap");
assert.equal(unlimitedPerk.impact.pillar.maximum, null);
const flawPillarBuild = { level: 50, qualitiesTaken: [], flawsTaken: [flaw("veilrunner.quality.flaw-a", "Extreme", "Physical"), flaw("veilrunner.quality.flaw-b", "Extreme", "Physical")] };
assert.equal(evaluateQualitySelection(flaw("veilrunner.quality.flaw-c", "Moderate", "Physical"), flawPillarBuild).conciseReason, QUALITY_BLOCKING_REASONS.pillar);
assert.equal(evaluateQualitySelection({ ...perk("veilrunner.quality.required"), requirements: { minimumLevel: 10 } }, { level: 5 }).conciseReason, QUALITY_BLOCKING_REASONS.requirement);
assert.equal(evaluateQualitySelection(perk("veilrunner.quality.physical-a", "Extreme"), build).conciseReason, QUALITY_BLOCKING_REASONS.duplicate);
assert.deepEqual(evaluateQualityRequirements({ requirements: { minimumLevel: 10 } }, { level: 5 }), ["Requires Level 10."]);
assert.equal(evaluateQualityRemoval(perk("veilrunner.quality.physical-a", "Extreme"), build).canRemove, true, "selected entries can be removed");

const snapshot = qualitySelectionSnapshot(perk("veilrunner.quality.snapshot", "Major"));
assert.equal(snapshot.points, 4, "selected snapshots derive cost from tier");
assert.equal(normalizeQualitySelections([{ name: "Legacy", tier: "Extreme", pillar: "Social", points: 99 }])[0].points, 5, "legacy stored points are normalized from tier");

const heroSource = await import("node:fs").then(fs => fs.readFileSync(new URL("../modules/data/actor/hero.mjs", import.meta.url), "utf8"));
assert.match(heroSource, /const hasQualitiesTaken = Object\.hasOwn\(source, "qualitiesTaken"\);/);
assert.match(heroSource, /if \(hasQualitiesTaken\) source\.qualitiesTaken = normalizeQualitySelections/);
assert.match(heroSource, /if \(hasFlawsTaken\) source\.flawsTaken = normalizeQualitySelections/);
const chargenSource = await import("node:fs").then(fs => fs.readFileSync(new URL("../modules/apps/character-creation.mjs", import.meta.url), "utf8"));
assert.match(chargenSource, /<select name="qualityFlawDialog\.tier">/);
assert.match(chargenSource, /points: tierCost\(tier\)/, "custom selections save the derived tier cost");
assert.match(chargenSource, /qualityFlawMode: "all"/, "Browse All is the default view");
assert.doesNotMatch(chargenSource, /modeButton\("recommended"/, "Recommended is not rendered as a mode");
assert.match(chargenSource, /class="vr-cc-qf-search".*modeButton\("all", "Browse all"\).*modeButton\("perks", "Browse Perks"\).*modeButton\("flaws", "Browse Flaws"\).*Available Only.*modeButton\("selected", "Selected"\).*<span>Pillar<\/span>.*<span>Tier<\/span>.*<span>Tags<\/span>.*<span>Create Custom<\/span>/s, "the browser header follows the requested order with Available Only before Selected");
assert.match(chargenSource, /data-selected-kind=.*data-selected-index=/, "removal buttons carry an unambiguous selection location");
assert.doesNotMatch(chargenSource, /addEventListener\("pointerover", event => \{[^}]*qualityFlawFocus/s, "hover does not populate the Inspector");
assert.match(chargenSource, /Flaws per Pillar/);
assert.match(chargenSource, /Perks by Pillar/);
assert.match(chargenSource, /const perkScale = Math\.max\(1, \.\.\.Object\.values\(audit\.perkPillarTotals\)\)/, "perk bars scale to the character's highest perk pillar");
assert.match(chargenSource, /<h2>Build Rules<\/h2>/, "the empty Inspector opens with build rules");
assert.match(chargenSource, /At least \$\{QUALITY_LIMITS\.flawMinimum\} flaw points are required/);
assert.match(chargenSource, /Minor flaws cannot exceed \$\{QUALITY_LIMITS\.minorFlawMaximum\} points/);
assert.match(chargenSource, /No flaw pillar may exceed \$\{QUALITY_LIMITS\.pillarMaximum\} points\. Perk pillars have no limit/);
assert.match(chargenSource, /audit\.flawPillarTotals\[pillar\]/, "the pillar tracker renders flaw-only totals");
assert.equal(chargenSource.match(/data-action="open-qf-dialog"/g)?.length, 1, "one Create Custom action replaces separate Perk and Flaw actions");
assert.match(chargenSource, /<span>Create Custom<\/span>/);
assert.match(chargenSource, /<select name="qualityFlawDialog\.kind">/, "the custom dialog chooses Perk or Flaw");

const qualityCss = await import("node:fs").then(fs => fs.readFileSync(new URL("../css/veilrunner.css", import.meta.url), "utf8"));
assert.match(qualityCss, /\.vr-cc-qf-choice-card\.pillar-physical \{ --qf-pillar-color: #22d3ee; \}/);
assert.match(qualityCss, /\.vr-cc-qf-choice-card\.pillar-social \{ --qf-pillar-color: #39ff74; \}/);
assert.match(qualityCss, /\.vr-cc-qf-choice-card\.pillar-magical \{ --qf-pillar-color: #c084fc; \}/);
assert.match(qualityCss, /\.vr-cc-qf-choice-card\.pillar-technical \{ --qf-pillar-color: #fbbf24; \}/);
assert.match(qualityCss, /\.vr-cc-qf-choice-card\.flaw \{ --qf-pillar-color: #ff4b35;/, "all flaw cards use red instead of pillar colors");

const document = (index, overrides = {}) => ({
  _id: String(index), uuid: `Compendium.Veilrunner.qualities-perks.${index}`, name: `Quality ${index}`, img: "icons/svg/book.svg", effects: [],
  system: {
    definitionId: `veilrunner.quality.quality-${index}`, kind: index % 2 ? "flaw" : "perk", tier: "Minor",
    pillar: index % 2 ? "Social" : "Physical", summary: "Reaction option", description: "Useful defense",
    mechanics: "Gain a reaction benefit", tags: [index % 2 ? "social" : "defense"], recommendationTags: ["soldier"],
    requirements: { text: "Requires training", minimumLevel: 0, requiredDefinitionIds: [], requiredTags: [] }, ...overrides
  }
});
const records = Array.from({ length: 365 }, (_, index) => normalizeQualityRecord(document(index)));
assert.equal(records.filter(Boolean).length, 365, "large catalogs normalize without dropping valid records");
assert.equal(queryQualityCatalog(records, { mode: "all", search: "reaction" }, { level: 50 }).length, 365, "search includes summary and mechanics");
assert.equal(queryQualityCatalog(records, { mode: "all", type: "flaw", tag: "social" }, { level: 50 }).length, 182);
assert.equal(queryQualityCatalog(records, { mode: "recommended" }, { level: 50, profession: "Soldier" }).length, 24, "recommendations are scored and capped");
assert.deepEqual(qualityCatalogFacets(records).tags, ["defense", "social"]);
assert.equal(normalizeQualityRecord(document(1, { tier: "Unknown" })), null, "malformed definitions are rejected");
assert.equal(normalizeQualityRecord({ ...document(2), type: "perk", system: { ...document(2).system, kind: "flaw" } }).kind, "perk", "native Perk Items derive their catalog kind from the Item type");
assert.equal(normalizeQualityRecord({ ...document(3), type: "flaw", system: { ...document(3).system, kind: "perk" } }).kind, "flaw", "native Flaw Items derive their catalog kind from the Item type");

console.log("Quality catalog and rules tests passed");
