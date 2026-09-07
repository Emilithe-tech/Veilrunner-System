import { CANONICAL_ID_PATTERN } from "../data/definitions/canonical-id.mjs";

export const CANONICAL_IDENTITY_MIGRATION_VERSION = 1;
export const CANONICAL_IDENTITY_MIGRATION_FLAG_PATH = "flags.Veilrunner.migrations.canonicalIdentity";
export const CANONICAL_IDENTITY_REFERENCE_FIELDS = Object.freeze({
  disciplines: Object.freeze(["professionId"]),
  professions: Object.freeze(["archetypeId"])
});

export class CanonicalIdentityMigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CanonicalIdentityMigrationError";
    this.details = details;
  }
}

const text = value => String(value ?? "").trim();
const documentKey = (pack, documentId) => `${pack}:${documentId}`;

function objectContainer(parent, key, path) {
  const value = parent[key];
  if (value === undefined || value === null) return (parent[key] = {});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CanonicalIdentityMigrationError(`Cannot stamp migration provenance because ${path} is not an object.`, { path, value });
  }
  return value;
}

function uniqueIndex(rows, keyOf, code) {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (index.has(key)) throw new CanonicalIdentityMigrationError(`Locked canonical ID map contains duplicate ${code}: ${key}.`, { code, key });
    index.set(key, row);
  }
  return index;
}

/** Validate and index the evidence map without regenerating any IDs. */
export function createCanonicalIdentityMap(rows = [], { expectedRows = null } = {}) {
  if (!Array.isArray(rows)) throw new TypeError("Canonical identity map rows must be an array.");
  if (expectedRows !== null && rows.length !== Number(expectedRows)) {
    throw new CanonicalIdentityMigrationError(`Locked canonical ID map must contain exactly ${expectedRows} rows, not ${rows.length}.`, {
      expectedRows: Number(expectedRows),
      actualRows: rows.length
    });
  }
  const normalized = rows.map((row, index) => {
    const entry = Object.freeze({
      pack: text(row?.pack),
      documentId: text(row?.documentId),
      name: text(row?.name),
      oldDefinitionId: text(row?.oldDefinitionId),
      proposedDefinitionId: text(row?.proposedDefinitionId)
    });
    if (!entry.pack || !entry.documentId) {
      throw new CanonicalIdentityMigrationError(`Locked map row ${index} is missing its pack or document ID.`, { index, row });
    }
    if (!CANONICAL_ID_PATTERN.test(entry.oldDefinitionId) || !CANONICAL_ID_PATTERN.test(entry.proposedDefinitionId)) {
      throw new CanonicalIdentityMigrationError(`Locked map row ${index} contains an invalid definition ID.`, { index, row: entry });
    }
    if (entry.oldDefinitionId === entry.proposedDefinitionId) {
      throw new CanonicalIdentityMigrationError(`Locked map row ${index} does not change identity.`, { index, row: entry });
    }
    return entry;
  });
  const byDocument = uniqueIndex(normalized, row => documentKey(row.pack, row.documentId), "pack/document key");
  const byOldId = uniqueIndex(normalized, row => row.oldDefinitionId, "current definition ID");
  const byProposedId = uniqueIndex(normalized, row => row.proposedDefinitionId, "proposed definition ID");
  return Object.freeze({
    rows: Object.freeze(normalized),
    byDocument,
    byOldId,
    byProposedId,
    packs: Object.freeze([...new Set(normalized.map(row => row.pack))].sort())
  });
}

function referencePlan(source, pack, map) {
  const fields = CANONICAL_IDENTITY_REFERENCE_FIELDS[pack] ?? [];
  return fields.map(field => {
    const path = `system.${field}`;
    const value = text(source.system?.[field]);
    const target = map.byOldId.get(value) ?? map.byProposedId.get(value);
    if (!value || !target) {
      throw new CanonicalIdentityMigrationError(`${path} does not resolve through the locked canonical ID map.`, {
        pack,
        documentId: text(source?._id ?? source?.id),
        path,
        value
      });
    }
    return Object.freeze({ path, field, source: target.oldDefinitionId, target: target.proposedDefinitionId, current: value });
  });
}

function validateAppliedMarker(marker, row, references) {
  if (!marker || typeof marker !== "object" || Array.isArray(marker)) return false;
  if (marker.version !== CANONICAL_IDENTITY_MIGRATION_VERSION) return false;
  if (marker.sourceDefinitionId !== row.oldDefinitionId || marker.targetDefinitionId !== row.proposedDefinitionId) return false;
  if (!Array.isArray(marker.references) || marker.references.length !== references.length) return false;
  return references.every((reference, index) => {
    const stored = marker.references[index];
    return stored?.path === reference.path && stored?.source === reference.source && stored?.target === reference.target;
  });
}

/** Prepare one complete replacement Item from a locked evidence-map row. */
export function prepareCanonicalIdentityMigration(source, { pack, map } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Canonical identity migration requires an Item source object.");
  }
  if (!map?.byDocument || !map?.byOldId || !map?.byProposedId) {
    throw new TypeError("Canonical identity migration requires an indexed locked map.");
  }
  const documentId = text(source._id ?? source.id);
  const row = map.byDocument.get(documentKey(pack, documentId));
  if (!row) {
    throw new CanonicalIdentityMigrationError("Production Item is absent from the locked canonical ID map.", {
      pack,
      documentId,
      name: text(source.name),
      definitionId: text(source.system?.definitionId)
    });
  }
  if (!source.system || typeof source.system !== "object" || Array.isArray(source.system)) {
    throw new CanonicalIdentityMigrationError("Mapped Item requires an object-valued system source.", { pack, documentId });
  }

  const references = referencePlan(source, pack, map);
  const currentDefinitionId = text(source.system.definitionId);
  const marker = source.flags?.Veilrunner?.migrations?.canonicalIdentity;
  if (currentDefinitionId === row.proposedDefinitionId) {
    if (!references.every(reference => reference.current === reference.target) || !validateAppliedMarker(marker, row, references)) {
      throw new CanonicalIdentityMigrationError("Item has a proposed ID but incomplete or conflicting canonical identity provenance.", {
        pack, documentId, currentDefinitionId, marker, references
      });
    }
    return { changed: false, pack, documentId, row, referenceChanges: 0, document: source };
  }
  if (currentDefinitionId !== row.oldDefinitionId) {
    throw new CanonicalIdentityMigrationError("Item definition ID differs from both locked source and target values.", {
      pack,
      documentId,
      expectedSource: row.oldDefinitionId,
      expectedTarget: row.proposedDefinitionId,
      actual: currentDefinitionId
    });
  }
  if (marker !== undefined) {
    throw new CanonicalIdentityMigrationError("Source identity already has canonicalIdentity migration provenance; refusing to overwrite it.", {
      pack, documentId, marker
    });
  }
  for (const reference of references) {
    if (reference.current !== reference.source) {
      throw new CanonicalIdentityMigrationError(`${reference.path} is already partially migrated or differs from locked evidence.`, {
        pack, documentId, reference
      });
    }
  }

  const document = structuredClone(source);
  document.system.definitionId = row.proposedDefinitionId;
  for (const reference of references) document.system[reference.field] = reference.target;
  const flags = objectContainer(document, "flags", "flags");
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  migrations.canonicalIdentity = {
    version: CANONICAL_IDENTITY_MIGRATION_VERSION,
    sourceDefinitionId: row.oldDefinitionId,
    targetDefinitionId: row.proposedDefinitionId,
    references: references.map(reference => ({ path: reference.path, source: reference.source, target: reference.target }))
  };
  return {
    changed: true,
    pack,
    documentId,
    row,
    referenceChanges: references.length,
    document
  };
}
