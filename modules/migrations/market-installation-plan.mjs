import { prepareMarketManifest, MARKET_STORAGE_PACKS, prepareMarketDefinitionCopy } from "./market-storage-plan.mjs";

export const MARKET_INSTALLATION_VERSION = 1;
const ensure = (condition, message) => { if (!condition) throw new Error(message); };
const freeze = value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze); return Object.freeze(value);
};
const keyOf = entry => JSON.stringify([entry.scope, entry.world ?? "", entry.collection, entry.recordKey, entry.path ?? ""]);

/**
 * Account for every decoded definition candidate. Deferred source content remains
 * in place; explicit deferral cannot authorize deleting or rewriting it.
 */
export function createMarketInstallationPlan({ systemManifest, inventory, inventoryFileSha256, decisions, digest }) {
  const afterManifest = prepareMarketManifest(systemManifest);
  ensure(inventory?.version === 1 && inventory.coverageComplete === true && inventory.sourceAndArchiveUnchanged === true,
    "A completed, preserved physical-content inventory is required.");
  ensure(/^[a-f0-9]{64}$/.test(inventoryFileSha256) && /^[a-f0-9]{64}$/.test(inventory.archiveTreeSha256), "Bound inventory/archive digests are required.");
  ensure(Array.isArray(inventory.entries) && Array.isArray(inventory.canonicalTargets) && Array.isArray(inventory.issues)
    && Array.isArray(decisions), "Decoded content and explicit source decisions are required.");
  const hash = value => { const result = digest(value); ensure(/^[a-f0-9]{64}$/.test(result), "SHA-256 digest required."); return result; };
  const candidates = inventory.entries.filter(entry => !entry.owned);
  const entries = new Map(candidates.map(entry => [keyOf(entry), entry]));
  ensure(entries.size === candidates.length && decisions.length === candidates.length, "Every candidate needs exactly one disposition.");
  const selected = [], deferred = [], covered = new Set(), targets = structuredClone(inventory.canonicalTargets);
  const locationKeys = new Set(inventory.entries.map(keyOf));
  // Only recorded missing identities may remain as deferred content debt.
  // Coverage/shape/collision failures block storage preparation outright.
  for (const issue of inventory.issues) {
    ensure(issue.code === "unassigned-physical-item" && locationKeys.has(keyOf(issue.location)), "Unresolved inventory integrity issue blocks installation.");
  }
  for (const decision of decisions) {
    const key = keyOf(decision), entry = entries.get(key);
    ensure(entry && !covered.has(key) && ["copy", "defer"].includes(decision.action)
      && typeof decision.reason === "string" && decision.reason.trim(), "Invalid, duplicate or unexplained source disposition.");
    covered.add(key);
    ensure(decision.documentSha256 === entry.documentSha256 && entry.document && hash(entry.document) === entry.documentSha256,
      "Reviewed definition content has drifted.");
    const location = { ...entry, path: "system.definitionId", recordId: entry.documentId, recordName: entry.name,
      occurrenceKind: entry.scope === "world-compendium" ? "world-compendium-item-identity" : "world-item-identity" };
    if (decision.action === "defer") {
      deferred.push({ scope: entry.scope, world: entry.world, collection: entry.collection, recordKey: entry.recordKey,
        documentId: entry.documentId, name: entry.name, type: entry.type, definitionId: entry.definitionId,
        documentSha256: entry.documentSha256, reason: decision.reason, mutation: null });
      continue;
    }
    ensure(!inventory.issues.some(issue => issue.location && keyOf(issue.location) === key), "An unresolved source issue cannot enter canonical storage.");
    const prepared = prepareMarketDefinitionCopy({ document: entry.document, location, sourceDefinitionId: entry.definitionId,
      targetDefinitionId: decision.targetDefinitionId, expectedSourceSha256: entry.documentSha256, targetInventory: targets, digest: hash });
    selected.push({ ...prepared, reason: decision.reason, contentNotes: [...(decision.contentNotes ?? [])] });
    targets.push({ definitionId: prepared.document.system.definitionId, documentId: prepared.document._id, collection: prepared.targetCollection });
  }
  ensure(selected.length > 0, "This content-backed storage plan requires at least one selected definition.");
  const packs = MARKET_STORAGE_PACKS.map(pack => ({ ...structuredClone(pack),
    documents: selected.filter(entry => entry.targetCollection === `Veilrunner.${pack.name}`).map(entry => entry.document) }));
  const plan = {
    version: MARKET_INSTALLATION_VERSION, operation: "install-canonical-market-storage", executionApproved: false,
    inventoryFileSha256, archiveTreeSha256: inventory.archiveTreeSha256,
    manifest: { before: structuredClone(systemManifest), after: afterManifest,
      beforeSha256: hash(systemManifest), afterSha256: hash(afterManifest) },
    packs: packs.map(pack => ({ ...pack, documentsSha256: hash(pack.documents) })), selected, deferred,
    retainedOwnedSnapshots: inventory.entries.filter(entry => entry.owned).map(entry => ({ scope: entry.scope, world: entry.world,
      collection: entry.collection, recordKey: entry.recordKey, path: entry.path, documentId: entry.documentId,
      definitionId: entry.definitionId, sourceSha256: entry.sourceSha256, documentSha256: entry.documentSha256, mutation: null })),
    referencesSha256: hash(inventory.references), references: structuredClone(inventory.references),
    preservation: { sourceDefinitions: "retain-exact", actorSnapshots: "retain-exact", originalPacks: "retain-exact",
      worldFiles: "retain-exact", settings: "retain-exact", sourceIdentityMigration: false },
    completion: { canonicalStorage: "pending-trial-and-installation", remainingContent: deferred.length,
      actorIdentityCutover: "deferred", consumerAcceptance: "pending" }
  };
  return freeze({ ...plan, planSha256: hash(plan) });
}

/** Recreate the exact row set for a new V14 Item pack, including Item effects. */
export function marketPackRows(documents) {
  const rows = [], keys = new Set();
  function add(key, value) { ensure(!keys.has(key), "Duplicate target database key."); keys.add(key); rows.push({ key, value }); }
  for (const document of documents) {
    ensure(/^[a-zA-Z0-9]{16}$/.test(document?._id) && Array.isArray(document.effects), "Complete Item sources are required.");
    const item = structuredClone(document), effects = item.effects;
    item.effects = effects.map(effect => {
      ensure(/^[a-zA-Z0-9]{16}$/.test(effect?._id), "Complete effect identity required.");
      add(`!items.effects!${item._id}.${effect._id}`, structuredClone(effect));
      return effect._id;
    });
    add(`!items!${item._id}`, item);
  }
  return freeze(rows.sort((a, b) => a.key.localeCompare(b.key)));
}

/**
 * Idempotent reconciliation for journaled new stores. A partial store may contain
 * only exact reviewed rows; conflicting or foreign bytes are never overwritten.
 */
export function planMarketPackState({ documents, currentRows, digest }) {
  ensure(Array.isArray(currentRows), "Decoded target rows are required.");
  const expectedRows = marketPackRows(documents), expected = new Map(expectedRows.map(row => [row.key, row]));
  const found = new Set();
  for (const row of currentRows) {
    ensure(typeof row?.key === "string" && !found.has(row.key), "Duplicate or unreadable target row.");
    found.add(row.key);
    const target = expected.get(row.key);
    ensure(target && digest(target.value) === digest(row.value), `Unexpected or changed target row: ${row.key}`);
  }
  const creates = expectedRows.filter(row => !found.has(row.key));
  return freeze({ status: creates.length ? "pending" : "applied", creates,
    rollbackDeletes: currentRows.map(row => row.key).sort(), expectedRows });
}
