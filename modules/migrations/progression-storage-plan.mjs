import { projectTalentTreeCatalog } from "../data/progression/catalog-projection.mjs";

export const PROGRESSION_STORAGE_PLAN_VERSION = 1;
export const PROGRESSION_STORAGE_MIGRATION_VERSION = 1;
export const PROGRESSION_STORAGE_SOURCE_SETTING = "Veilrunner.talentTreeCatalog";
export const PROGRESSION_STORAGE_COLLECTION = "Veilrunner.progression";
export const PROGRESSION_STORAGE_PACK = Object.freeze({
  name: "progression",
  label: "Progression Library",
  system: "Veilrunner",
  path: "packs/progression",
  type: "Item",
  private: false,
  flags: Object.freeze({})
});

export const PROGRESSION_TERMINAL_EXPECTATIONS = Object.freeze({
  layoutVersion: 10,
  manifestPacks: 13,
  pages: 2,
  practices: 51,
  progressions: 2,
  contentReferences: 54,
  nodes: 117,
  edges: 119
});

export const PROGRESSION_FALLBACK_ONLY_IDENTITIES = Object.freeze({
  practices: Object.freeze(["veilrunner.progression.practice.pyromancy-ii"]),
  content: Object.freeze(["veilrunner.ability.spell.pyromancy-ii.flamethrower"])
});

export const PROGRESSION_TERMINAL_ONLY_GROUPS = Object.freeze([
  "veilrunner.progression.skills:school:armament",
  "veilrunner.progression.skills:school:physique",
  "veilrunner.progression.skills:school:social",
  "veilrunner.progression.skills:school:technical"
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];
const compare = (left, right) => left.localeCompare(right);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function unique(values, label) {
  const normalized = values.map(value => text(value));
  if (normalized.some(value => !value)) throw new ProgressionStoragePlanError(`${label} contains a blank identity.`);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) throw new ProgressionStoragePlanError(`${label} contains duplicate identities.`, { duplicates: [...new Set(duplicates)].sort(compare) });
  return normalized;
}

function difference(left, right) {
  const expected = new Set(right);
  return left.filter(value => !expected.has(value)).sort(compare);
}

function sameValues(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function digestOf(digest, value, label) {
  if (typeof digest !== "function") throw new TypeError("Progression storage planning requires a SHA-256 digest function.");
  const result = text(digest(value)).toLowerCase();
  if (!SHA256_PATTERN.test(result)) throw new ProgressionStoragePlanError(`Progression storage planning received an invalid ${label} SHA-256 digest.`, { digest: result });
  return result;
}

function projectionInventory(projection) {
  const practices = unique(list(projection?.practiceSources).map(source => source?.system?.definitionId), "Practice projection").sort(compare);
  const progressions = unique(list(projection?.progressionSources).map(source => source?.system?.definitionId), "Progression projection").sort(compare);
  const groups = unique(list(projection?.progressionSources).flatMap(source => list(source?.system?.nodes)
    .filter(node => node?.kind === "group")
    .map(node => `${text(source?.system?.definitionId)}:${text(node?.id)}`)), "Progression group projection").sort(compare);
  const content = unique(list(projection?.progressionSources).flatMap(source => list(source?.system?.nodes)
    .filter(node => node?.kind === "content")
    .map(node => node?.definitionId)), "Progression content projection").sort(compare);
  return { practices, progressions, groups, content };
}

export class ProgressionStoragePlanError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProgressionStoragePlanError";
    this.details = details;
  }
}

/** Compare already validated projections without reading Foundry or a database. */
export function reconcileProgressionCatalogs(terminalProjection, fallbackProjection) {
  const terminal = projectionInventory(terminalProjection);
  const fallback = projectionInventory(fallbackProjection);
  return deepFreeze({
    terminalSummary: structuredClone(terminalProjection?.summary ?? {}),
    fallbackSummary: structuredClone(fallbackProjection?.summary ?? {}),
    terminalOnly: {
      practices: difference(terminal.practices, fallback.practices),
      progressions: difference(terminal.progressions, fallback.progressions),
      groups: difference(terminal.groups, fallback.groups),
      content: difference(terminal.content, fallback.content)
    },
    fallbackOnly: {
      practices: difference(fallback.practices, terminal.practices),
      progressions: difference(fallback.progressions, terminal.progressions),
      groups: difference(fallback.groups, terminal.groups),
      content: difference(fallback.content, terminal.content)
    }
  });
}

function assertProjectionSummary(projection, expected, label) {
  for (const key of ["pages", "practices", "progressions", "nodes", "edges"]) {
    if (Number(projection?.summary?.[key]) !== Number(expected[key])) {
      throw new ProgressionStoragePlanError(`${label} projection ${key} drifted: expected ${expected[key]}, found ${projection?.summary?.[key]}.`, {
        label,
        key,
        expected: expected[key],
        actual: projection?.summary?.[key]
      });
    }
  }
}

function assertTerminalReconciliation(reconciliation) {
  const expectedEmpty = [];
  const checks = [
    [reconciliation.terminalOnly.practices, expectedEmpty, "terminal-only Practices"],
    [reconciliation.terminalOnly.progressions, expectedEmpty, "terminal-only Progressions"],
    [reconciliation.terminalOnly.content, expectedEmpty, "terminal-only content"],
    [reconciliation.fallbackOnly.progressions, expectedEmpty, "fallback-only Progressions"],
    [reconciliation.fallbackOnly.groups, expectedEmpty, "fallback-only groups"],
    [reconciliation.terminalOnly.groups, [...PROGRESSION_TERMINAL_ONLY_GROUPS], "terminal-only groups"],
    [reconciliation.fallbackOnly.practices, [...PROGRESSION_FALLBACK_ONLY_IDENTITIES.practices], "fallback-only Practices"],
    [reconciliation.fallbackOnly.content, [...PROGRESSION_FALLBACK_ONLY_IDENTITIES.content], "fallback-only content"]
  ];
  for (const [actual, expected, label] of checks) {
    const normalizedExpected = [...expected].sort(compare);
    if (!sameValues(actual, normalizedExpected)) {
      throw new ProgressionStoragePlanError(`Progression storage refuses an unreconciled ${label} inventory.`, { actual, expected: normalizedExpected });
    }
  }
}

function assertManifestBaseline(manifest) {
  if (manifest?.id !== "Veilrunner") throw new ProgressionStoragePlanError("Progression storage is locked to the case-sensitive Veilrunner system package.", { id: manifest?.id });
  if (!Array.isArray(manifest?.packs)) throw new ProgressionStoragePlanError("Progression storage requires a system manifest pack array.");
  if (manifest.packs.length !== PROGRESSION_TERMINAL_EXPECTATIONS.manifestPacks) {
    throw new ProgressionStoragePlanError(`System manifest pack count drifted: expected ${PROGRESSION_TERMINAL_EXPECTATIONS.manifestPacks}, found ${manifest.packs.length}.`);
  }
  const names = list(manifest.packs).map(pack => text(pack?.name));
  const paths = list(manifest.packs).map(pack => text(pack?.path));
  unique(names, "System manifest pack names");
  unique(paths, "System manifest pack paths");
  if (names.includes(PROGRESSION_STORAGE_PACK.name) || paths.includes(PROGRESSION_STORAGE_PACK.path)) {
    throw new ProgressionStoragePlanError("Progression storage planning requires the canonical target pack to be absent from the baseline manifest.");
  }
  const anchorIndexes = names.flatMap((name, index) => name === "unique-abilities" ? [index] : []);
  if (anchorIndexes.length !== 1) throw new ProgressionStoragePlanError("Progression storage requires one exact unique-abilities manifest anchor.");
  return anchorIndexes[0];
}

/** Return the proposed manifest value; this function never writes system.json. */
export function prepareProgressionManifest(systemManifest) {
  const anchorIndex = assertManifestBaseline(systemManifest);
  const prepared = structuredClone(systemManifest);
  prepared.packs.splice(anchorIndex + 1, 0, structuredClone(PROGRESSION_STORAGE_PACK));
  return prepared;
}

function documentRows(projection, digest) {
  const sources = [...list(projection.practiceSources), ...list(projection.progressionSources)];
  const rows = sources.map(source => {
    const type = text(source?.type);
    const definitionId = text(source?.system?.definitionId);
    const name = text(source?.name);
    if (!name || !["practice", "progression"].includes(type)) {
      throw new ProgressionStoragePlanError("Projected Progression pack source has an invalid name or Item type.", { name, type, definitionId });
    }
    if (type === "practice" && !definitionId.startsWith("veilrunner.progression.practice.")) {
      throw new ProgressionStoragePlanError("Projected Practice source has an invalid canonical identity.", { definitionId });
    }
    if (type === "progression" && !["veilrunner.progression.skills", "veilrunner.progression.magic"].includes(definitionId)) {
      throw new ProgressionStoragePlanError("Projected Progression source has an unexpected canonical identity.", { definitionId });
    }
    const serialized = JSON.stringify(source);
    if (serialized.includes("Compendium.world.spells") || /\"veilrunner\.spell\./.test(serialized)) {
      throw new ProgressionStoragePlanError("Retired Spell UUIDs or legacy definition IDs cannot enter the canonical Progression pack.", { definitionId });
    }
    const classification = source.system?.classification ?? {};
    return {
      definitionId,
      name,
      type,
      sourcePath: type === "practice"
        ? `${PROGRESSION_STORAGE_SOURCE_SETTING}.${text(classification.category)}.${text(classification.school)}.${text(classification.practice)}`
        : `${PROGRESSION_STORAGE_SOURCE_SETTING}.${text(classification.category)}`,
      sourceSha256: digestOf(digest, source, `projected source ${definitionId}`),
      targetCollection: PROGRESSION_STORAGE_COLLECTION,
      physicalDocumentId: null,
      physicalIdPolicy: "The approved clone builder assigns once; the clone/live journal must retain and revalidate the Foundry-compatible ID"
    };
  }).sort((left, right) => compare(left.definitionId, right.definitionId));
  unique(rows.map(row => row.definitionId), "Progression storage map");
  return rows.map((row, index) => Object.freeze({ ordinal: index + 1, ...row }));
}

/**
 * Lock the non-mutating storage plan from already decoded source values.
 * The caller supplies a digest over stable JSON; no Foundry or LevelDB API is used here.
 */
export function createProgressionStoragePlan({
  terminalCatalog,
  fallbackCatalog,
  systemManifest,
  sourceSnapshot,
  sourceSnapshotTreeSha256,
  digest
} = {}) {
  if (!terminalCatalog || typeof terminalCatalog !== "object" || Array.isArray(terminalCatalog)) {
    throw new ProgressionStoragePlanError("Progression storage requires the fully decoded terminal talentTreeCatalog value.");
  }
  if (!fallbackCatalog || typeof fallbackCatalog !== "object" || Array.isArray(fallbackCatalog)) {
    throw new ProgressionStoragePlanError("Progression storage requires the shipped fallback catalog for reconciliation.");
  }
  if (Number(terminalCatalog.layoutVersion) !== PROGRESSION_TERMINAL_EXPECTATIONS.layoutVersion) {
    throw new ProgressionStoragePlanError(`Terminal talentTreeCatalog layout version drifted: expected ${PROGRESSION_TERMINAL_EXPECTATIONS.layoutVersion}, found ${terminalCatalog.layoutVersion}.`);
  }
  if (!text(sourceSnapshot)) throw new ProgressionStoragePlanError("Progression storage requires an external source snapshot identity.");
  const snapshotTreeSha256 = text(sourceSnapshotTreeSha256).toLowerCase();
  if (!SHA256_PATTERN.test(snapshotTreeSha256)) throw new ProgressionStoragePlanError("Progression storage requires the external source snapshot tree SHA-256.");

  const terminalProjection = projectTalentTreeCatalog(terminalCatalog);
  const fallbackProjection = projectTalentTreeCatalog(fallbackCatalog);
  assertProjectionSummary(terminalProjection, PROGRESSION_TERMINAL_EXPECTATIONS, "Terminal");
  assertProjectionSummary(fallbackProjection, { pages: 2, practices: 52, progressions: 2, nodes: 115, edges: 119 }, "Fallback");
  const reconciliation = reconcileProgressionCatalogs(terminalProjection, fallbackProjection);
  assertTerminalReconciliation(reconciliation);

  const terminalInventory = projectionInventory(terminalProjection);
  if (terminalInventory.content.length !== PROGRESSION_TERMINAL_EXPECTATIONS.contentReferences) {
    throw new ProgressionStoragePlanError(`Terminal content reference count drifted: expected ${PROGRESSION_TERMINAL_EXPECTATIONS.contentReferences}, found ${terminalInventory.content.length}.`);
  }
  if (terminalInventory.content.some(definitionId => !definitionId.startsWith("veilrunner.ability."))) {
    throw new ProgressionStoragePlanError("Terminal Progression graphs contain a non-canonical content identity.");
  }

  const preparedManifest = prepareProgressionManifest(systemManifest);
  const rows = documentRows(terminalProjection, digest);
  if (rows.length !== PROGRESSION_TERMINAL_EXPECTATIONS.practices + PROGRESSION_TERMINAL_EXPECTATIONS.progressions) {
    throw new ProgressionStoragePlanError(`Progression storage map count drifted: expected 53, found ${rows.length}.`);
  }

  const plan = {
    ok: true,
    version: PROGRESSION_STORAGE_PLAN_VERSION,
    migrationVersion: PROGRESSION_STORAGE_MIGRATION_VERSION,
    executionApproved: false,
    source: {
      snapshot: text(sourceSnapshot),
      snapshotTreeSha256,
      setting: PROGRESSION_STORAGE_SOURCE_SETTING,
      layoutVersion: terminalCatalog.layoutVersion,
      catalogSha256: digestOf(digest, terminalCatalog, "terminal catalog"),
      projectionSha256: digestOf(digest, terminalProjection, "terminal projection")
    },
    target: {
      collection: PROGRESSION_STORAGE_COLLECTION,
      packageOwner: "Veilrunner",
      pack: structuredClone(PROGRESSION_STORAGE_PACK),
      mapSha256: digestOf(digest, rows, "Progression storage map"),
      documents: rows
    },
    manifest: {
      operation: "insert-exact-entry-after-unique-abilities",
      beforeSha256: digestOf(digest, systemManifest, "source manifest"),
      afterSha256: digestOf(digest, preparedManifest, "proposed manifest"),
      packsBefore: systemManifest.packs.length,
      packsAfter: preparedManifest.packs.length,
      allOtherManifestFields: "deep-equal JSON values"
    },
    summary: {
      practices: terminalProjection.summary.practices,
      progressions: terminalProjection.summary.progressions,
      targetDocuments: rows.length,
      contentReferences: terminalInventory.content.length,
      nodes: terminalProjection.summary.nodes,
      edges: terminalProjection.summary.edges
    },
    reconciliation,
    compatibilityBoundary: {
      packBootstrap: "retain talentTreeCatalog byte-for-byte and keep current setting consumers authoritative",
      dualReadValidation: "project the retained setting and require deep-equal canonical sources before consumer cutover",
      consumerCutover: "separate explicit approval and migration version after clone and live pack verification",
      settingRetirement: "out of scope; no deletion or destructive rewrite is authorized",
      legacyMetadata: "retained only in the source setting; retired UUIDs and veilrunner.spell IDs never enter target documents"
    },
    intendedDelta: {
      planning: "no filesystem, manifest, pack, setting, Actor, Item, or runtime mutation",
      cloneTrial: {
        manifest: "add one exact Veilrunner.progression entry",
        pack: "create packs/progression with exactly 51 Practice and two Progression Items",
        setting: "unchanged byte-for-byte",
        consumers: "unchanged; setting remains authoritative",
        existingPacks: "13/13 decoded-identical"
      },
      liveBootstrap: "requires separate approval after a closed-Foundry preflight and successful clone proof",
      consumerCutover: "requires a later separate approval; source setting remains recoverable"
    },
    orderedState: [
      "planned",
      "clone-preflight-verified",
      "clone-pack-staged",
      "clone-pack-verified",
      "live-bootstrap-approved",
      "live-pack-applied",
      "dual-read-verified",
      "consumer-cutover-approved",
      "consumer-cutover-complete"
    ],
    retryContract: {
      optimisticLocks: ["source snapshot tree SHA-256", "talentTreeCatalog SHA-256", "system manifest SHA-256", "target pack absence or exact journaled state"],
      freshCreate: "target collection must be absent and every semantic identity must be unique",
      retry: "every existing target must match its journaled physical ID, canonical definition ID, type, and projected-source SHA-256",
      partial: "stop, preserve the journal, and report exact created/verified/unresolved rows; never infer a rollback target"
    },
    rollbackContract: {
      packBootstrap: "remove only journaled target documents and the exact newly created packs/progression store after digest verification",
      manifest: "restore the exact preflight system.json value from the external archive",
      setting: "no bootstrap rollback is needed because the setting is not changed",
      consumers: "consumer rollback is a later versioned slice and must restore setting-authoritative reads"
    },
    refusalConditions: [
      "FoundryVTT or Electron is running before any LevelDB-opening clone or live operation",
      "the external snapshot/archive is missing or its tree digest drifts",
      "the complete decoded layout-version-10 talentTreeCatalog is unavailable or its digest drifts",
      "the terminal projection is not exactly 51 Practices, two Progressions, 54 content references, 117 nodes, and 119 edges",
      "the shipped fallback is substituted for the terminal catalog or the Pyromancy II / Flamethrower discrepancy is not exact",
      "the four terminal Skills groups are absent or any additional Practice, Progression, group, or content identity differs",
      "the case-sensitive Veilrunner package, 13-pack manifest baseline, insertion anchor, or proposed manifest digest drifts",
      "the target pack already exists without an exact successful migration journal",
      "any projected source, semantic identity, or source digest is missing, duplicated, or ambiguous",
      "any of the 54 canonical content references fails to resolve exactly once in approved system packs at its locked digest",
      "any existing pack, world document, Actor snapshot, setting, or runtime consumer would change during pack bootstrap",
      "live bootstrap, setting migration, or consumer cutover approval is absent"
    ],
    exclusions: [
      "eight actions-test-library fixture Actions",
      "two unrelated world equipment identities",
      "unconfigured historical system-pack directories"
    ]
  };
  return deepFreeze(plan);
}

export function renderProgressionStoragePlanMarkdown(plan) {
  const fallbackPractice = plan.reconciliation.fallbackOnly.practices.join(", ");
  const fallbackContent = plan.reconciliation.fallbackOnly.content.join(", ");
  const lines = [
    "# Veilrunner V14 Practice/Progression Storage Plan",
    "",
    `Status: **${plan.ok ? "PLAN CONTRACT LOCKED; CLONE AND LIVE EXECUTION NOT APPROVED" : "BLOCKED"}**`,
    "",
    `Source setting: \`${plan.source.setting}\` (layout ${plan.source.layoutVersion})`,
    `Target collection: \`${plan.target.collection}\``,
    `Projected source map: \`${plan.target.mapSha256}\``,
    "",
    "## Locked inventory",
    "",
    `- ${plan.summary.practices} Practice documents`,
    `- ${plan.summary.progressions} Progression documents`,
    `- ${plan.summary.contentReferences} canonical content references`,
    `- ${plan.summary.nodes} graph nodes and ${plan.summary.edges} graph edges`,
    "",
    "## Reconciliation",
    "",
    `The terminal catalog is authoritative. The shipped fallback-only Practice is \`${fallbackPractice}\`; its sole fallback-only content identity is \`${fallbackContent}\`. Neither may be injected into the target pack.`,
    `The terminal-only Skills groups are ${plan.reconciliation.terminalOnly.groups.map(value => `\`${value}\``).join(", ")}.`,
    "",
    "## Manifest proposal",
    "",
    `Insert \`${plan.target.pack.name}\` after \`unique-abilities\`, changing the configured pack count from ${plan.manifest.packsBefore} to ${plan.manifest.packsAfter}. Every other manifest value remains deep-equal.`,
    "",
    "## Compatibility and execution boundary",
    "",
    `- ${plan.compatibilityBoundary.packBootstrap}.`,
    `- ${plan.compatibilityBoundary.dualReadValidation}.`,
    `- ${plan.compatibilityBoundary.consumerCutover}.`,
    `- ${plan.compatibilityBoundary.settingRetirement}.`,
    "",
    "This plan performs no write and does not authorize a clone build, manifest edit, pack write, setting migration, or consumer cutover."
  ];
  return `${lines.join("\n")}\n`;
}
