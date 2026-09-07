import { CANONICAL_ID_PATTERN } from "../data/definitions/canonical-id.mjs";
import { legacyActionDamageFormula, spellDamageFields } from "../data/item/action-formula.mjs";
import { prepareActionContractMigration } from "./action-contract.mjs";

export const SPELL_RELOCATION_VERSION = 2;
export const SPELL_RELOCATION_SOURCE_PACK = "world.spells";
export const SPELL_RELOCATION_TARGET_PACK = "Veilrunner.unique-abilities";
export const SPELL_RELOCATION_FLAG_PATH = "flags.Veilrunner.migrations.spellRelocation";
export const SPELL_RELOCATION_MAP_SHA256 = "676f472e96a8afb4f6761c19f1cecb09f969b56e60c79f79985217e92de198be";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const text = value => String(value ?? "").trim();

export class SpellRelocationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SpellRelocationError";
    this.details = details;
  }
}

function uniqueIndex(rows, keyOf, label) {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (index.has(key)) throw new SpellRelocationError(`Locked Spell relocation map contains duplicate ${label}: ${key}.`, { label, key });
    index.set(key, row);
  }
  return index;
}

function objectContainer(parent, key, path) {
  const value = parent[key];
  if (value === undefined || value === null) return (parent[key] = {});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new SpellRelocationError(`Cannot write Spell relocation provenance because ${path} is not an object.`, { path, value });
  }
  return value;
}

function normalizedDefinitionRow(row, index) {
  if (!Array.isArray(row?.canonicalTraits)) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} is missing its canonical trait snapshot.`, { index, row });
  }
  const canonicalTraits = row.canonicalTraits.map(value => text(value));
  if (canonicalTraits.some(value => !value) || new Set(canonicalTraits).size !== canonicalTraits.length) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} has invalid canonical traits.`, { index, canonicalTraits });
  }
  const entry = Object.freeze({
    sourceKey: text(row?.sourceKey),
    documentId: text(row?.documentId),
    name: text(row?.name),
    sourceDefinitionId: text(row?.sourceDefinitionId),
    targetDefinitionId: text(row?.targetDefinitionId),
    practice: text(row?.practice),
    school: text(row?.school),
    canonicalTraits: Object.freeze(canonicalTraits),
    sourceUuid: text(row?.sourceUuid),
    targetUuid: text(row?.targetUuid),
    sourceSha256: text(row?.sourceSha256).toLowerCase(),
    targetSha256: text(row?.targetSha256).toLowerCase()
  });
  if (!entry.documentId || entry.sourceKey !== `!items!${entry.documentId}` || !entry.name || !entry.practice || !entry.school) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} is missing or contradicts its source identity.`, { index, row: entry });
  }
  if (!CANONICAL_ID_PATTERN.test(entry.sourceDefinitionId) || !CANONICAL_ID_PATTERN.test(entry.targetDefinitionId)) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} contains an invalid definition ID.`, { index, row: entry });
  }
  if (!entry.sourceDefinitionId.startsWith("veilrunner.spell.") || !entry.targetDefinitionId.startsWith("veilrunner.ability.spell.")) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} crosses an unexpected semantic namespace.`, { index, row: entry });
  }
  if (entry.sourceUuid !== `Compendium.${SPELL_RELOCATION_SOURCE_PACK}.Item.${entry.documentId}`
    || entry.targetUuid !== `Compendium.${SPELL_RELOCATION_TARGET_PACK}.Item.${entry.documentId}`) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} has an unexpected source or target UUID.`, { index, row: entry });
  }
  if (!SHA256_PATTERN.test(entry.sourceSha256) || !SHA256_PATTERN.test(entry.targetSha256)) {
    throw new SpellRelocationError(`Locked Spell relocation row ${index} has an invalid source or target digest.`, { index, row: entry });
  }
  return entry;
}

function normalizedActorTarget(row, index) {
  const entry = Object.freeze({
    sourceKey: text(row?.sourceKey),
    actorId: text(row?.actorId),
    itemId: text(row?.itemId),
    definitionDocumentId: text(row?.definitionDocumentId),
    name: text(row?.name),
    sourceDefinitionId: text(row?.sourceDefinitionId),
    targetDefinitionId: text(row?.targetDefinitionId),
    sourceUuid: text(row?.sourceUuid),
    targetUuid: text(row?.targetUuid),
    legacyCompendiumSource: text(row?.legacyCompendiumSource),
    sourceSha256: text(row?.sourceSha256).toLowerCase(),
    targetSha256: text(row?.targetSha256).toLowerCase()
  });
  if (!entry.actorId || !entry.itemId || !entry.definitionDocumentId
    || entry.sourceKey !== `!actors.items!${entry.actorId}.${entry.itemId}` || !entry.name) {
    throw new SpellRelocationError(`Locked Actor Spell target ${index} is missing or contradicts its embedded identity.`, { index, row: entry });
  }
  if (!CANONICAL_ID_PATTERN.test(entry.sourceDefinitionId) || !CANONICAL_ID_PATTERN.test(entry.targetDefinitionId)) {
    throw new SpellRelocationError(`Locked Actor Spell target ${index} contains an invalid definition ID.`, { index, row: entry });
  }
  if (entry.sourceUuid !== `Compendium.${SPELL_RELOCATION_SOURCE_PACK}.Item.${entry.definitionDocumentId}`
    || entry.targetUuid !== `Compendium.${SPELL_RELOCATION_TARGET_PACK}.Item.${entry.definitionDocumentId}`
    || entry.legacyCompendiumSource !== entry.sourceUuid) {
    throw new SpellRelocationError(`Locked Actor Spell target ${index} has unexpected provenance.`, { index, row: entry });
  }
  if (!SHA256_PATTERN.test(entry.sourceSha256) || !SHA256_PATTERN.test(entry.targetSha256)) {
    throw new SpellRelocationError(`Locked Actor Spell target ${index} has an invalid source or target digest.`, { index, row: entry });
  }
  return entry;
}

/** Validate and index a frozen cross-pack Spell relocation map without regenerating identities. */
export function createSpellRelocationMap(rows = [], actorTargets = [], {
  expectedDefinitions = null,
  expectedActorTargets = null
} = {}) {
  if (!Array.isArray(rows) || !Array.isArray(actorTargets)) throw new TypeError("Spell relocation rows and Actor targets must be arrays.");
  if (expectedDefinitions !== null && rows.length !== Number(expectedDefinitions)) {
    throw new SpellRelocationError(`Locked Spell relocation map must contain exactly ${expectedDefinitions} definitions, not ${rows.length}.`);
  }
  if (expectedActorTargets !== null && actorTargets.length !== Number(expectedActorTargets)) {
    throw new SpellRelocationError(`Locked Spell relocation map must contain exactly ${expectedActorTargets} Actor targets, not ${actorTargets.length}.`);
  }
  const definitions = Object.freeze(rows.map(normalizedDefinitionRow));
  const actors = Object.freeze(actorTargets.map(normalizedActorTarget));
  const byDocumentId = uniqueIndex(definitions, row => row.documentId, "definition document ID");
  const bySourceDefinitionId = uniqueIndex(definitions, row => row.sourceDefinitionId, "source definition ID");
  const byTargetDefinitionId = uniqueIndex(definitions, row => row.targetDefinitionId, "target definition ID");
  const byActorKey = uniqueIndex(actors, row => `${row.actorId}:${row.itemId}`, "Actor/item key");
  for (const actor of actors) {
    const definition = bySourceDefinitionId.get(actor.sourceDefinitionId);
    if (!definition || definition.documentId !== actor.definitionDocumentId || definition.targetDefinitionId !== actor.targetDefinitionId
      || definition.sourceUuid !== actor.sourceUuid || definition.targetUuid !== actor.targetUuid) {
      throw new SpellRelocationError("Locked Actor Spell target does not resolve to exactly one locked definition row.", { actor });
    }
  }
  return Object.freeze({
    rows: definitions,
    actorTargets: actors,
    byDocumentId,
    bySourceDefinitionId,
    byTargetDefinitionId,
    byActorKey
  });
}

function assertDefinitionSource(source, row) {
  const documentId = text(source?._id ?? source?.id);
  const definitionId = text(source?.system?.definitionId);
  const practice = text(source?.system?.tree?.practice);
  const school = text(source?.system?.tree?.school);
  if (documentId !== row.documentId || text(source?.name) !== row.name || source?.type !== "spell"
    || definitionId !== row.sourceDefinitionId || practice !== row.practice || school !== row.school) {
    throw new SpellRelocationError("World Spell source drifted from its locked relocation row.", {
      expected: row,
      actual: { documentId, name: text(source?.name), type: source?.type, definitionId, practice, school }
    });
  }
}

function applyCanonicalSpellFields(document, source, row, { includeOwnedLevel }) {
  const contract = prepareActionContractMigration(document, { expectedMode: "spell", includeOwnedLevel });
  document = structuredClone(contract.document);
  const damageFormula = text(source.system?.damageFormula) || legacyActionDamageFormula(source.system);
  const damage = spellDamageFields({ ...source.system, damageFormula });
  document.system.definitionId = row.targetDefinitionId;
  document.system.damageFormula = damageFormula;
  document.system.baseSpellDamage = damage.baseSpellDamage;
  document.system.spellDamagePerLevel = damage.spellDamagePerLevel;
  document.system.classification = {
    category: "magic",
    practice: row.practice,
    school: row.school,
    pillar: "",
    kind: "spell"
  };
  document.system.mechanics = text(source.system?.mechanics);
  if (source.system?.rules !== undefined && !Array.isArray(source.system.rules)) {
    throw new SpellRelocationError("World Spell has an ambiguous non-array canonical rules payload.", { documentId: row.documentId, rules: source.system.rules });
  }
  document.system.rules = structuredClone(source.system?.rules ?? []);
  return document;
}

/** Prepare one canonical system-pack Spell definition while leaving the legacy World source unchanged. */
export function prepareRelocatedSpellDefinition(source, { row, systemId = "Veilrunner", systemVersion } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !row) {
    throw new TypeError("Spell relocation requires a source Item and locked map row.");
  }
  assertDefinitionSource(source, row);
  if (!text(systemVersion)) throw new TypeError("Spell relocation requires the target system version.");
  if (!text(source._stats?.coreVersion) || text(source._stats?.systemId) !== text(systemId)) {
    throw new SpellRelocationError("World Spell has unexpected Foundry/system metadata.", {
      documentId: row.documentId,
      coreVersion: text(source._stats?.coreVersion),
      systemId: text(source._stats?.systemId)
    });
  }
  const document = applyCanonicalSpellFields(structuredClone(source), source, row, { includeOwnedLevel: false });
  document.system.traits = [...row.canonicalTraits];
  document.folder = null;
  document.ownership = { default: 0 };
  document._stats = {
    coreVersion: text(source._stats?.coreVersion),
    systemId: text(systemId),
    systemVersion: text(systemVersion)
  };
  const flags = objectContainer(document, "flags", "flags");
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  migrations.spellRelocation = {
    version: SPELL_RELOCATION_VERSION,
    sourceDefinitionId: row.sourceDefinitionId,
    targetDefinitionId: row.targetDefinitionId,
    sourceUuid: row.sourceUuid,
    targetUuid: row.targetUuid
  };
  return Object.freeze({ changed: true, sourceType: "spell", targetType: "spell", document });
}

/** Prepare one Actor-owned Spell update while preserving all mutable Actor and Foundry metadata. */
export function prepareRelocatedActorSpell(source, { row, systemVersion } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source) || !row) {
    throw new TypeError("Actor Spell relocation requires an embedded Item source and locked Actor target.");
  }
  const documentId = text(source._id ?? source.id);
  if (documentId !== row.itemId || text(source.name) !== row.name || source.type !== "spell"
    || text(source.system?.definitionId) !== row.sourceDefinitionId
    || text(source._stats?.compendiumSource) !== row.legacyCompendiumSource) {
    throw new SpellRelocationError("Actor-owned Spell drifted from its locked relocation target.", {
      expected: row,
      actual: {
        documentId,
        name: text(source.name),
        type: source.type,
        definitionId: text(source.system?.definitionId),
        compendiumSource: text(source._stats?.compendiumSource)
      }
    });
  }
  if (!text(systemVersion)) throw new TypeError("Actor Spell relocation requires the target system version.");
  const definitionRow = {
    documentId: row.itemId,
    name: row.name,
    sourceDefinitionId: row.sourceDefinitionId,
    targetDefinitionId: row.targetDefinitionId,
    practice: text(source.system?.tree?.practice),
    school: text(source.system?.tree?.school)
  };
  assertDefinitionSource(source, definitionRow);
  const document = applyCanonicalSpellFields(structuredClone(source), source, definitionRow, { includeOwnedLevel: true });
  const flags = objectContainer(document, "flags", "flags");
  const core = objectContainer(flags, "core", "flags.core");
  core.sourceId = row.targetUuid;
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  veilrunner.provenance = {
    definitionId: row.targetDefinitionId,
    sourceUuid: row.targetUuid,
    sourceVersion: text(systemVersion),
    snapshotVersion: 1
  };
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  migrations.spellRelocation = {
    version: SPELL_RELOCATION_VERSION,
    sourceDefinitionId: row.sourceDefinitionId,
    targetDefinitionId: row.targetDefinitionId,
    sourceUuid: row.sourceUuid,
    targetUuid: row.targetUuid
  };
  return Object.freeze({ changed: true, sourceType: "spell", targetType: "spell", document });
}

export function renderSpellRelocationMapMarkdown(report) {
  const lines = [
    "# Veilrunner V14 Spell Relocation Map",
    "",
    `System snapshot: \`${report.source?.systemSnapshot ?? ""}\``,
    `World snapshot: \`${report.source?.worldSnapshot ?? ""}\``,
    `Canonical trait snapshot: \`${report.source?.canonicalWorldSnapshot ?? ""}\``,
    `Locked map SHA-256: \`${report.mapSha256 ?? ""}\``,
    "",
    "## Summary",
    "",
    `- Legacy world Spell definitions: ${report.summary?.sourceDefinitions ?? 0}`,
    `- Canonical system Spell creates: ${report.summary?.targetCreates ?? 0}`,
    `- Actor-owned Spell updates: ${report.summary?.actorUpdates ?? 0}`,
    `- Target document-ID collisions: ${report.summary?.targetDocumentIdCollisions ?? 0}`,
    `- Target definition-ID collisions: ${report.summary?.targetDefinitionIdCollisions ?? 0}`,
    `- Rejected sources: ${report.summary?.rejectedSources ?? 0}`,
    "",
    "## Definition rows",
    "",
    "| Document | Name | Practice / school | Current definition ID | Target definition ID |",
    "|---|---|---|---|---|",
    ...(report.rows ?? []).map(row => `| \`${row.documentId}\` | ${row.name} | ${row.practice} / ${row.school} | \`${row.sourceDefinitionId}\` | \`${row.targetDefinitionId}\` |`),
    "",
    "## Actor targets",
    "",
    "| Actor / Item | Name | Current definition ID | Target definition ID | Target source UUID |",
    "|---|---|---|---|---|",
    ...((report.actorTargets ?? []).length
      ? report.actorTargets.map(row => `| \`${row.actorId}\` / \`${row.itemId}\` | ${row.name} | \`${row.sourceDefinitionId}\` | \`${row.targetDefinitionId}\` | \`${row.targetUuid}\` |`)
      : ["| none | none | none | none | none |"])
  ];
  return `${lines.join("\n")}\n`;
}
