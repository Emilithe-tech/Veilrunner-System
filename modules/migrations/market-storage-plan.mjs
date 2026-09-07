import { canonicalIdBuilder } from "../data/definitions/canonical-id.mjs";
import { CompendiumRouter } from "../data/definitions/compendium-router.mjs";
import { itemTypesWithCapability } from "../data/definitions/item-capabilities.mjs";

export const MARKET_STORAGE_PLAN_VERSION = 1;
export const MARKET_DEFINITION_COPY_VERSION = 1;

const physicalTypes = new Set(itemTypesWithCapability("marketSellable"));
const clone = value => structuredClone(value);
const sha256Pattern = /^[a-f0-9]{64}$/;
const documentIdPattern = /^[a-zA-Z0-9]{16}$/;

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

export class MarketStoragePlanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MarketStoragePlanError";
    this.code = code;
    this.details = details;
  }
}

function requireValue(condition, code, message, details = {}) {
  if (!condition) throw new MarketStoragePlanError(code, message, details);
}

function digestOf(digest, value) {
  requireValue(typeof digest === "function", "digest-required", "A SHA-256 digest function is required.");
  const result = digest(value);
  requireValue(sha256Pattern.test(result), "digest-invalid", "A valid SHA-256 digest is required.");
  return result;
}

export const MARKET_STORAGE_PACKS = freeze([
  ["weapons", "Weapons Library"],
  ["armor", "Armor & Shields Library"],
  ["ammunition", "Ammunition & Magazines Library"],
  ["equipment", "Equipment Library"]
].map(([name, label]) => ({ name, label, system: "Veilrunner", path: `packs/${name}`, type: "Item", private: false, flags: {} })));

// This version belongs to the accepted fifteen-pack baseline. Historical
// Talent/Skill and Progression migration plans remain sealed and unchanged.
const sourcePacks = ["archetypes", "professions", "disciplines", "actions-test-library",
  "unique-abilities", "talents-skills", "progression", "unique-actions", "unique-reactions",
  "unique-traits", "species", "origins", "backgrounds", "languages", "qualities-perks"];

/** Propose four storage destinations; never register absent stores at runtime. */
export function prepareMarketManifest(manifest) {
  requireValue(manifest?.id === "Veilrunner", "system-identity", "The case-sensitive Veilrunner system is required.");
  requireValue(Array.isArray(manifest.packs) && manifest.packs.length === sourcePacks.length,
    "manifest-baseline", "Market storage requires the accepted fifteen-pack source manifest.");
  sourcePacks.forEach((name, index) => {
    const entry = manifest.packs[index];
    const expectedPath = `packs/${name === "professions" ? "path-professions" : name}`;
    requireValue(entry?.name === name && entry.path === expectedPath && entry.system === "Veilrunner" && entry.type === "Item",
      "manifest-baseline", `Source pack ${index} differs from the accepted baseline.`, { name, expectedPath });
  });
  const result = clone(manifest);
  result.packs.splice(sourcePacks.indexOf("species"), 0, ...clone(MARKET_STORAGE_PACKS));
  const router = new CompendiumRouter({ packs: result.packs });
  for (const type of physicalTypes) router.route(type, { strict: true });
  return freeze(result);
}

/** Add only the equipment domain. Names, classifications and scopes are not inferred. */
export function proposeMarketDefinitionId({ type, definitionId }) {
  requireValue(physicalTypes.has(type), "non-market-type", "Only structural market Item types may enter market storage.", { type });
  requireValue(canonicalIdBuilder.isValid(definitionId), "invalid-definition-id", "A normalized existing definition ID is required.");
  const segments = definitionId.split(".");
  if (type === "equipment") {
    requireValue(segments[1] === "equipment" && !physicalTypes.has(segments[2]),
      "semantic-identity-mismatch", "Generic equipment cannot claim another physical type's namespace.");
    return definitionId;
  }
  if (segments[1] === "equipment") {
    requireValue(segments[2] === type && segments.length >= 4, "semantic-identity-mismatch", "Canonical equipment identity contradicts the Item type.");
    return definitionId;
  }
  requireValue(segments[1] === type && segments.length >= 3, "semantic-identity-mismatch", "Legacy equipment identity contradicts the Item type.");
  return [segments[0], "equipment", ...segments.slice(1)].join(".");
}

function evidenceType(definitionId) {
  const segments = definitionId.split(".");
  if (segments[1] !== "equipment") return physicalTypes.has(segments[1]) ? segments[1] : null;
  return physicalTypes.has(segments[2]) ? segments[2] : "equipment";
}

function sourceLocation(location) {
  requireValue(location?.path === "system.definitionId" && documentIdPattern.test(location.recordId)
    && /^[a-z0-9][a-z0-9-]*$/.test(location.world), "source-location-invalid", "An exact world Item identity location is required.");
  const result = {
    occurrenceKind: location.occurrenceKind, scope: location.scope, world: location.world,
    collection: location.collection, recordKey: location.recordKey,
    documentId: location.recordId, name: String(location.recordName ?? "")
  };
  if (location.occurrenceKind === "actor-embedded-item-identity") {
    const match = /^!actors.items!([a-zA-Z0-9]{16})\.([a-zA-Z0-9]{16})$/.exec(location.recordKey);
    requireValue(location.scope === "world-data" && location.collection === "actors" && match?.[2] === location.recordId,
      "source-location-invalid", "Actor identity evidence has inconsistent scope or record keys.");
    return { ...result, actorId: match[1], role: "owned-snapshot", sourceUuid: `Actor.${match[1]}.Item.${location.recordId}` };
  }
  requireValue(location.recordKey === `!items!${location.recordId}`, "source-location-invalid", "Definition record key contradicts its Item ID.");
  if (location.occurrenceKind === "world-compendium-item-identity") {
    requireValue(location.scope === "world-compendium" && /^[a-z0-9][a-z0-9-]*$/.test(location.collection),
      "source-location-invalid", "World compendium identity evidence has inconsistent scope.");
    return { ...result, role: "definition-candidate", sourceUuid: `Compendium.world.${location.collection}.Item.${location.recordId}` };
  }
  requireValue(location.occurrenceKind === "world-item-identity" && location.scope === "world-data" && location.collection === "items",
    "source-location-invalid", "Only an explicitly selected World Item or world compendium definition may be copied.");
  return { ...result, role: "definition-candidate", sourceUuid: `Item.${location.recordId}` };
}

/**
 * Classify retained identity evidence without treating it as a current, complete
 * physical-content inventory. In particular, unnamed/unassigned gear is unknown.
 */
export function createMarketStorageProposal({ systemManifest, referenceInventory, referenceInventorySha256, digest }) {
  const proposedManifest = prepareMarketManifest(systemManifest);
  requireValue(referenceInventory?.ok === true && referenceInventory.systemId === "Veilrunner"
    && Array.isArray(referenceInventory.unmappedDefinitionIds), "inventory-invalid", "A successful retained Veilrunner identity inventory is required.");
  requireValue(sha256Pattern.test(referenceInventorySha256), "inventory-digest-invalid", "The retained inventory file SHA-256 is required.");
  const router = new CompendiumRouter({ packs: proposedManifest.packs });
  const ids = new Set();
  const seenLocations = new Set();
  const targets = new Set();
  const definitions = [];
  for (const row of referenceInventory.unmappedDefinitionIds) {
    requireValue(typeof row?.definitionId === "string", "inventory-invalid", "Identity evidence contains an unreadable row.");
    const type = evidenceType(row.definitionId);
    if (!type) continue;
    const targetDefinitionId = proposeMarketDefinitionId({ type, definitionId: row.definitionId });
    requireValue(!ids.has(row.definitionId) && !targets.has(targetDefinitionId), "identity-collision", "Physical identity evidence collides after canonical mapping.");
    ids.add(row.definitionId);
    targets.add(targetDefinitionId);
    requireValue(Array.isArray(row.locations) && row.locations.length > 0, "inventory-incomplete", "Physical identity evidence is missing locations.");
    const locations = row.locations.map(sourceLocation);
    for (const location of locations) {
      const key = JSON.stringify([location.scope, location.world, location.collection, location.recordKey]);
      requireValue(!seenLocations.has(key), "source-location-duplicate", "The same Item location occurs more than once in physical identity evidence.");
      seenLocations.add(key);
    }
    const candidates = locations.filter(location => location.role === "definition-candidate");
    definitions.push({ sourceDefinitionId: row.definitionId, targetDefinitionId, inferredType: type,
      targetCollection: router.route(type, { strict: true }).collection,
      candidates, ownedSnapshots: locations.filter(location => location.role === "owned-snapshot"),
      sourceSelection: null, contentStatus: candidates.length ? "requires-decoded-source-review" : "no-definition-source" });
  }
  definitions.sort((a, b) => a.targetDefinitionId.localeCompare(b.targetDefinitionId));
  return freeze({
    version: MARKET_STORAGE_PLAN_VERSION, operation: "prepare-canonical-market-storage",
    executionApproved: false, executionReady: false,
    manifest: { beforeSha256: digestOf(digest, systemManifest), afterSha256: digestOf(digest, proposedManifest),
      beforeCount: systemManifest.packs.length, afterCount: proposedManifest.packs.length,
      additions: clone(MARKET_STORAGE_PACKS), proposed: proposedManifest },
    evidence: { generatedAt: referenceInventory.generatedAt, source: clone(referenceInventory.source),
      referenceInventorySha256, currentContentInventoryComplete: false,
      physicalIdentities: definitions.length, definitionCandidates: definitions.reduce((sum, row) => sum + row.candidates.length, 0),
      ownedSnapshots: definitions.reduce((sum, row) => sum + row.ownedSnapshots.length, 0) },
    definitions,
    unresolved: ["fresh-complete-decoded-physical-inventory", "explicit-definition-source-selection",
      "unassigned-items-and-identity-collisions", "definition-and-reference-digests", "disposable-clone-apply-and-rollback"],
    preservation: { originalPacks: "unchanged", worldStores: "unchanged", actorSnapshots: "unchanged",
      legacyDefinitions: "retained", settings: "unchanged", runtimeFallback: false }
  });
}

/**
 * Prepare bytes for ONE explicitly selected definition. This function performs
 * no I/O and grants no write authority. Actor snapshots are never source templates.
 */
export function prepareMarketDefinitionCopy({ document, location, sourceDefinitionId, targetDefinitionId,
  expectedSourceSha256, targetInventory, digest }) {
  const source = sourceLocation(location);
  requireValue(source.role === "definition-candidate", "owned-source-refused", "Actor-owned snapshots cannot seed canonical definitions.");
  requireValue(document?._id === source.documentId && document.system?.definitionId === sourceDefinitionId,
    "source-identity-drift", "Decoded definition differs from its selected source identity.");
  const proposedId = proposeMarketDefinitionId({ type: document.type, definitionId: sourceDefinitionId });
  requireValue(targetDefinitionId === proposedId, "target-identity-drift", "The requested identity differs from the exact canonical mapping.");
  const targetCollection = new CompendiumRouter({ packs: MARKET_STORAGE_PACKS }).route(document.type, { strict: true }).collection;
  requireValue(Array.isArray(targetInventory), "target-inventory-required", "The decoded canonical target inventory is required.");
  for (const entry of targetInventory) {
    requireValue(canonicalIdBuilder.isValid(entry?.definitionId) && documentIdPattern.test(entry.documentId)
      && /^Veilrunner\.[a-z0-9][a-z0-9-]*$/.test(entry.collection),
      "target-inventory-invalid", "A canonical target identity location is unreadable.");
    requireValue(entry.definitionId !== targetDefinitionId
      && !(entry.collection === targetCollection && entry.documentId === source.documentId),
      "target-identity-collision", "The target semantic identity or pack document ID already exists.");
  }
  const sourceSha256 = digestOf(digest, document);
  requireValue(sha256Pattern.test(expectedSourceSha256) && sourceSha256 === expectedSourceSha256,
    "source-content-drift", "Decoded definition differs from the reviewed source digest.");
  const prepared = clone(document);
  for (const key of ["flags", "system"]) {
    requireValue(prepared[key] == null || (typeof prepared[key] === "object" && !Array.isArray(prepared[key])),
      "source-shape-invalid", `The source ${key} must be an object.`);
  }
  prepared.flags ??= {};
  prepared.flags.Veilrunner ??= {};
  requireValue(typeof prepared.flags.Veilrunner === "object" && !Array.isArray(prepared.flags.Veilrunner),
    "source-shape-invalid", "The source Veilrunner flags must be an object.");
  prepared.flags.Veilrunner.migrations ??= {};
  requireValue(typeof prepared.flags.Veilrunner.migrations === "object" && !Array.isArray(prepared.flags.Veilrunner.migrations)
    && !Object.hasOwn(prepared.flags.Veilrunner.migrations, "marketDefinitionCopy"),
    "migration-provenance-conflict", "Existing market copy provenance cannot be replaced.");
  prepared.system.definitionId = targetDefinitionId;
  prepared.flags.Veilrunner.migrations.marketDefinitionCopy = {
    version: MARKET_DEFINITION_COPY_VERSION, sourceWorld: source.world, sourceUuid: source.sourceUuid,
    sourceDefinitionId, targetDefinitionId, sourceSha256
  };
  // Placement, ownership and bookkeeping belong to the destination pack.
  for (const key of ["folder", "sort", "ownership", "_stats"]) delete prepared[key];
  return freeze({ source, sourceSha256, targetCollection, targetUuid: `Compendium.${targetCollection}.Item.${prepared._id}`,
    targetSha256: digestOf(digest, prepared), document: prepared, sourceMutation: null, ownedSnapshotMutations: [] });
}
