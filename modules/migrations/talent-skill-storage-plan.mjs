export const TALENT_SKILL_STORAGE_PLAN_VERSION = 1;
export const TALENT_SKILL_STORAGE_MIGRATION_VERSION = 1;
export const TALENT_SKILL_STORAGE_COLLECTION = "Veilrunner.talents-skills";
export const TALENT_SKILL_STORAGE_PACK = Object.freeze({
  name: "talents-skills",
  label: "Talents & Skills Library",
  system: "Veilrunner",
  path: "packs/talents-skills",
  type: "Item",
  private: false,
  flags: Object.freeze({})
});

const SOURCE_PACKS = [
  ["archetypes", "packs/archetypes"],
  ["professions", "packs/path-professions"],
  ["disciplines", "packs/disciplines"],
  ["actions-test-library", "packs/actions-test-library"],
  ["unique-abilities", "packs/unique-abilities"],
  ["progression", "packs/progression"],
  ["unique-actions", "packs/unique-actions"],
  ["unique-reactions", "packs/unique-reactions"],
  ["unique-traits", "packs/unique-traits"],
  ["species", "packs/species"],
  ["origins", "packs/origins"],
  ["backgrounds", "packs/backgrounds"],
  ["languages", "packs/languages"],
  ["qualities-perks", "packs/qualities-perks"]
].map(([name, path]) => Object.freeze({ name, path, system: "Veilrunner", type: "Item" }));

export const TALENT_SKILL_STORAGE_EXPECTATIONS = Object.freeze({
  manifestPacks: 14,
  targetDocuments: 0,
  skillsGroups: Object.freeze(["armament", "physique", "social", "technical"]),
  sourcePacks: Object.freeze(SOURCE_PACKS)
});

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const TARGET_TYPES = new Set(["talent", "skill"]);
const TARGET_ID_PATTERN = /^veilrunner\.(?:ability\.)?(?:talent|skill)\./;
const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];
const compare = (left, right) => left.localeCompare(right);
const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function refuse(code, message, details = {}) {
  throw new TalentSkillStoragePlanError(code, message, details);
}

function digestOf(digest, value, label) {
  if (typeof digest !== "function") throw new TypeError("Talent/Skill storage planning requires a SHA-256 digest function.");
  const result = text(digest(value)).toLowerCase();
  if (!SHA256_PATTERN.test(result)) refuse("digest-invalid", `Talent/Skill storage planning received an invalid ${label} SHA-256 digest.`, { digest: result });
  return result;
}

function unique(values, label) {
  const normalized = values.map(text);
  if (normalized.some(value => !value)) refuse("identity-blank", `${label} contains a blank identity.`);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) refuse("identity-duplicate", `${label} contains duplicate identities.`, { duplicates: [...new Set(duplicates)].sort(compare) });
  return normalized;
}

function definitionIdOf(source) {
  return text(source?.system?.definitionId ?? source?._source?.system?.definitionId);
}

function typeOf(source) {
  return text(source?.type ?? source?._source?.type).toLowerCase();
}

function assertManifestBaseline(manifest) {
  if (manifest?.id !== "Veilrunner") refuse("system-identity-mismatch", "Talent/Skill storage is locked to the case-sensitive Veilrunner package.", { id: manifest?.id });
  if (!Array.isArray(manifest?.packs)) refuse("manifest-packs-invalid", "Talent/Skill storage requires a system manifest pack array.");
  if (manifest.packs.length !== TALENT_SKILL_STORAGE_EXPECTATIONS.manifestPacks) {
    refuse("manifest-count-drift", `System manifest pack count drifted: expected ${TALENT_SKILL_STORAGE_EXPECTATIONS.manifestPacks}, found ${manifest.packs.length}.`);
  }
  const names = unique(manifest.packs.map(pack => pack?.name), "System manifest pack names");
  const paths = unique(manifest.packs.map(pack => pack?.path), "System manifest pack paths");
  const packDrift = TALENT_SKILL_STORAGE_EXPECTATIONS.sourcePacks.flatMap((expected, index) => {
    const actual = manifest.packs[index];
    return actual?.name === expected.name
      && actual?.path === expected.path
      && actual?.system === expected.system
      && actual?.type === expected.type
      ? []
      : [{ index, expected, actual: {
          name: actual?.name,
          path: actual?.path,
          system: actual?.system,
          type: actual?.type
        } }];
  });
  if (packDrift.length) {
    refuse("manifest-pack-drift", "Talent/Skill storage requires the exact ordered 14-pack Veilrunner Item baseline.", { packs: packDrift });
  }
  if (names.includes(TALENT_SKILL_STORAGE_PACK.name) || paths.includes(TALENT_SKILL_STORAGE_PACK.path)) {
    refuse("target-already-declared", "Talent/Skill storage planning requires the canonical target pack to be absent from the baseline manifest.");
  }
  const abilitiesIndex = names.indexOf("unique-abilities");
  const progressionIndex = names.indexOf("progression");
  if (abilitiesIndex < 0 || progressionIndex !== abilitiesIndex + 1) {
    refuse("manifest-anchor-drift", "Talent/Skill storage requires the exact unique-abilities then progression manifest boundary.", { abilitiesIndex, progressionIndex });
  }
  return progressionIndex;
}

/** Return the proposed manifest value without writing system.json. */
export function prepareTalentSkillManifest(systemManifest) {
  const progressionIndex = assertManifestBaseline(systemManifest);
  const prepared = clone(systemManifest);
  prepared.packs.splice(progressionIndex, 0, clone(TALENT_SKILL_STORAGE_PACK));
  return prepared;
}

function assertDefinitionInventory(definitions) {
  if (!Array.isArray(definitions)) refuse("definition-inventory-invalid", "Talent/Skill storage requires a complete decoded system Item inventory.");
  const identities = [];
  const targetRows = [];
  for (const [index, source] of definitions.entries()) {
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      refuse("definition-inventory-unreadable", "System Item inventory contains an unreadable source.", { index });
    }
    const type = typeOf(source);
    const definitionId = definitionIdOf(source);
    if (!type) refuse("definition-inventory-incomplete", "System Item inventory contains a source without an Item type.", { index, type, definitionId });
    if (definitionId) identities.push(definitionId);
    if (TARGET_TYPES.has(type) || TARGET_ID_PATTERN.test(definitionId)) {
      targetRows.push({ index, type, definitionId, name: text(source.name ?? source?._source?.name) });
    }
  }
  unique(identities, "Canonical system Item identities");
  if (targetRows.length) {
    refuse("existing-talent-skill-content", "Existing Talent or Skill definitions require a populated migration plan; an empty target pack would be destructive.", { rows: targetRows });
  }
}

function assertProgressionInventory(progressions) {
  if (!Array.isArray(progressions)) refuse("progression-inventory-invalid", "Talent/Skill storage requires complete decoded Progression sources.");
  const byId = new Map();
  const targetReferences = [];
  for (const [index, source] of progressions.entries()) {
    if (!source || typeof source !== "object" || Array.isArray(source) || typeOf(source) !== "progression") {
      refuse("progression-inventory-unreadable", "Progression inventory contains an unreadable or mistyped source.", { index, type: typeOf(source) });
    }
    const definitionId = definitionIdOf(source);
    if (!definitionId || byId.has(definitionId)) refuse("progression-identity-invalid", "Progression inventory contains a blank or duplicate canonical identity.", { index, definitionId });
    const nodes = source.system?.nodes ?? source?._source?.system?.nodes;
    if (!Array.isArray(nodes)) refuse("progression-nodes-invalid", `Progression ${definitionId} does not contain a node array.`, { definitionId });
    byId.set(definitionId, source);
    for (const [nodeIndex, node] of nodes.entries()) {
      const referencedId = text(node?.definitionId);
      if (TARGET_ID_PATTERN.test(referencedId)) targetReferences.push({ definitionId, nodeIndex, nodeId: text(node?.id), referencedId });
    }
  }
  if (byId.size !== 2 || !byId.has("veilrunner.progression.magic") || !byId.has("veilrunner.progression.skills")) {
    refuse("progression-inventory-drift", "Talent/Skill storage requires the exact Magic and Skills Progression pair.", { identities: [...byId.keys()].sort(compare) });
  }
  if (targetReferences.length) {
    refuse("existing-talent-skill-reference", "Progression graphs already reference Talent or Skill content; an empty target pack would leave unresolved definitions.", { references: targetReferences });
  }
  const skills = byId.get("veilrunner.progression.skills");
  const skillNodes = skills.system?.nodes ?? skills?._source?.system?.nodes;
  const rootNodes = skillNodes.filter(node => node?.kind === "root");
  const unexpectedNodes = skillNodes.filter(node => !["root", "group"].includes(text(node?.kind)));
  if (skillNodes.length !== 5 || rootNodes.length !== 1 || unexpectedNodes.length) {
    refuse("skills-structure-drift", "Skills Progression must contain only one root and its four empty canonical groups.", {
      nodes: skillNodes.length,
      roots: rootNodes.map(node => text(node?.id)),
      unexpected: unexpectedNodes.map(node => ({ id: text(node?.id), kind: text(node?.kind) }))
    });
  }
  const groups = skillNodes.filter(node => node?.kind === "group").map(node => text(node?.id).replace(/^school:/, "")).sort(compare);
  const expectedGroups = [...TALENT_SKILL_STORAGE_EXPECTATIONS.skillsGroups].sort(compare);
  if (groups.length !== expectedGroups.length || groups.some((group, index) => group !== expectedGroups[index])) {
    refuse("skills-group-drift", "Skills Progression must retain the exact empty Armament, Physique, Social, and Technical groups.", { groups, expectedGroups });
  }
  const contentNodes = skillNodes.filter(node => ["practice", "content"].includes(text(node?.kind)));
  if (contentNodes.length) refuse("skills-content-unexpected", "Skills Progression already contains authored Practice or content nodes.", { nodeIds: contentNodes.map(node => text(node?.id)) });
}

export class TalentSkillStoragePlanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "TalentSkillStoragePlanError";
    this.code = code;
    this.details = deepFreeze(clone(details));
  }
}

/**
 * Lock a source-only plan for the currently empty canonical Talent/Skill route.
 * Every decoded input is caller-supplied; this function opens no pack and writes nothing.
 */
export function createTalentSkillStoragePlan({
  systemManifest,
  canonicalDefinitions,
  progressions,
  sourceSnapshot,
  sourceSnapshotTreeSha256,
  digest
} = {}) {
  if (!text(sourceSnapshot)) refuse("snapshot-required", "Talent/Skill storage requires an external source snapshot identity.");
  const snapshotTreeSha256 = text(sourceSnapshotTreeSha256).toLowerCase();
  if (!SHA256_PATTERN.test(snapshotTreeSha256)) refuse("snapshot-digest-invalid", "Talent/Skill storage requires the external source snapshot tree SHA-256.");
  assertDefinitionInventory(canonicalDefinitions);
  assertProgressionInventory(progressions);
  const preparedManifest = prepareTalentSkillManifest(systemManifest);
  const plan = {
    ok: true,
    version: TALENT_SKILL_STORAGE_PLAN_VERSION,
    migrationVersion: TALENT_SKILL_STORAGE_MIGRATION_VERSION,
    executionApproved: false,
    source: {
      snapshot: text(sourceSnapshot),
      snapshotTreeSha256,
      manifestSha256: digestOf(digest, systemManifest, "source manifest"),
      canonicalDefinitionsSha256: digestOf(digest, canonicalDefinitions, "decoded system Item inventory"),
      progressionsSha256: digestOf(digest, progressions, "Progression inventory")
    },
    target: {
      collection: TALENT_SKILL_STORAGE_COLLECTION,
      packageOwner: "Veilrunner",
      pack: clone(TALENT_SKILL_STORAGE_PACK),
      documents: [],
      documentsSha256: digestOf(digest, [], "empty Talent/Skill document map")
    },
    manifest: {
      operation: "insert-exact-entry-before-progression",
      beforeSha256: digestOf(digest, systemManifest, "source manifest"),
      afterSha256: digestOf(digest, preparedManifest, "proposed manifest"),
      packsBefore: systemManifest.packs.length,
      packsAfter: preparedManifest.packs.length,
      allOtherManifestFields: "deep-equal JSON values"
    },
    summary: {
      migratedTalents: 0,
      migratedSkills: 0,
      progressionTalentSkillReferences: 0,
      targetDocuments: 0,
      skillsGroups: [...TALENT_SKILL_STORAGE_EXPECTATIONS.skillsGroups]
    },
    decision: {
      route: "The approved final canonical route for talent and skill Items is Veilrunner.talents-skills.",
      emptyTarget: "The complete retained inventories contain no Talent or Skill Items and the sealed Skills Progression contains no content nodes; the empty pack is an intentional authoring destination, not a guessed migration.",
      futureWrites: "Only GM-authorized canonical authoring may create Talent or Skill Items in this pack."
    },
    cloneTrial: {
      prerequisite: "FoundryVTT and Electron are fully closed and a fresh external archive is byte-verified.",
      delta: "Add one exact manifest entry and one empty directory-backed LevelDB store; preserve all existing pack and world bytes.",
      verification: "Foundry must load one locked, visible, empty Veilrunner.talents-skills Item pack without errors before runtime authoring activation."
    },
    retryContract: {
      optimisticLocks: ["source snapshot tree SHA-256", "system manifest SHA-256", "decoded system Item inventory SHA-256", "Progression inventory SHA-256"],
      target: "The target must be absent, or match an exact successful journal proving the configured pack is empty.",
      partial: "Stop and retain the journal; never delete or reuse an unverified target directory."
    },
    rollbackContract: {
      manifest: "Restore the exact preflight system.json value from the external archive.",
      pack: "Remove only the exact journaled packs/talents-skills directory after verifying its closed-world digest and empty Item inventory.",
      existingData: "No existing pack, world store, Actor, Item, setting, or progression graph is rewritten."
    },
    refusalConditions: [
      "FoundryVTT or Electron is running before any LevelDB-opening clone or live operation",
      "the external archive is missing or its tree digest drifts",
      "the case-sensitive Veilrunner package or exact 14-pack baseline drifts",
      "the unique-abilities then progression manifest boundary drifts",
      "the target collection or path already exists without an exact successful journal",
      "any decoded system definition is a Talent or Skill or claims a Talent/Skill canonical identity",
      "either Progression is missing, duplicated, unreadable, or references Talent/Skill content",
      "the Skills Progression does not contain exactly the four empty canonical groups",
      "any existing pack, world store, Actor, Item, setting, permission, or progression graph would change"
    ]
  };
  return deepFreeze(plan);
}

export function renderTalentSkillStoragePlanMarkdown(plan) {
  const lines = [
    "# Veilrunner V14 Talent/Skill Storage Plan",
    "",
    `Status: **${plan.ok ? "PLAN CONTRACT LOCKED; CLONE AND LIVE EXECUTION NOT APPROVED" : "BLOCKED"}**`,
    "",
    `Target collection: \`${plan.target.collection}\``,
    `Target documents: ${plan.summary.targetDocuments}`,
    `Manifest packs: ${plan.manifest.packsBefore} -> ${plan.manifest.packsAfter}`,
    "",
    "## Storage decision",
    "",
    plan.decision.route,
    plan.decision.emptyTarget,
    "",
    "## Intended delta",
    "",
    `Insert \`${plan.target.pack.name}\` immediately before \`progression\` and create its empty directory-backed LevelDB store. Every existing manifest value, pack, world store, Actor, Item, setting, and Progression graph remains unchanged.`,
    "",
    "## Safety gate",
    "",
    `${plan.cloneTrial.prerequisite} This plan performs no write and does not authorize a clone build, installed manifest edit, pack creation, or runtime authoring mutation.`
  ];
  return `${lines.join("\n")}\n`;
}
