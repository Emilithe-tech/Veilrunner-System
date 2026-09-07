import { itemHasCapability, isSemanticItemType } from "../data/definitions/item-capabilities.mjs";
import { canonicalIdBuilder } from "../data/definitions/canonical-id.mjs";
import { CompendiumRouter } from "../data/definitions/compendium-router.mjs";
import { MARKET_STORAGE_PACKS, proposeMarketDefinitionId } from "./market-storage-plan.mjs";

export const MARKET_CONTENT_INVENTORY_VERSION = 1;
const idPattern = /^[a-zA-Z0-9]{16}$/;
const sourceKey = source => JSON.stringify([source.scope, source.world ?? "", source.collection]);
const freeze = value => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
};
const ensure = (condition, message) => { if (!condition) throw new Error(message); };

/** Build exact coverage from manifest packs and the archived world store catalog. */
export function marketInventorySources(systemManifest, worlds) {
  ensure(systemManifest?.id === "Veilrunner" && Array.isArray(systemManifest.packs), "Veilrunner manifest required.");
  ensure(Array.isArray(worlds) && worlds.length > 0, "The complete Veilrunner world catalog is required.");
  const result = systemManifest.packs.map(pack => ({ scope: "system-compendium", world: "", collection: pack.name,
    documentType: pack.type, relativePath: `systems/Veilrunner/${pack.path}` }));
  const worldIds = new Set();
  for (const { manifest, stores } of worlds) {
    ensure(manifest?.system === "Veilrunner" && /^[a-z0-9-]+$/.test(manifest.id) && !worldIds.has(manifest.id), "Invalid or duplicate world identity.");
    worldIds.add(manifest.id);
    ensure(Array.isArray(stores) && ["actors", "items"].every(name => stores.includes(name)), "World Actor/Item store coverage is incomplete.");
    for (const pack of manifest.packs ?? []) result.push({ scope: "world-compendium", world: manifest.id,
      collection: pack.name, documentType: pack.type, relativePath: `worlds/${manifest.id}/${pack.path}` });
    for (const name of stores) result.push({ scope: "world-data", world: manifest.id, collection: name,
      documentType: name === "actors" ? "Actor" : name === "items" ? "Item" : null,
      relativePath: `worlds/${manifest.id}/data/${name}` });
  }
  const keys = new Set(), paths = new Set();
  for (const source of result) {
    ensure(/^[a-z0-9-]+$/.test(source.collection)
      && /^(?:systems\/Veilrunner\/packs|worlds\/[a-z0-9-]+\/(?:packs|data))\/[a-z0-9-]+$/.test(source.relativePath), "Unsafe inventory database path.");
    ensure(!keys.has(sourceKey(source)) && !paths.has(source.relativePath.toLowerCase()), "Duplicate inventory database.");
    keys.add(sourceKey(source)); paths.add(source.relativePath.toLowerCase());
  }
  return freeze(result);
}

function itemSources(source, rows) {
  const result = [];
  for (const { key, value } of rows) {
    if (source.documentType === "Item" && /^!items![a-zA-Z0-9]{16}$/.test(key)) {
      result.push({ key, value, path: "", owned: false });
    } else if (/^![a-z.]+\.items![a-zA-Z0-9.]+$/.test(key)) {
      result.push({ key, value, path: "", owned: true });
    }
    // Actor packs and synthetic Token Actor deltas can contain inline snapshots.
    if (!(source.documentType === "Actor" || (source.scope === "world-data" && source.collection === "scenes"))) continue;
    function walk(current, at = "") {
      if (!current || typeof current !== "object") return;
      for (const [field, child] of Object.entries(current)) {
        const next = at ? `${at}.${field}` : field;
        if (field === "items" && Array.isArray(child)) {
          child.forEach((item, index) => {
            if (item && typeof item === "object") result.push({ key, value: item, path: `${next}.${index}`, owned: true });
          });
        } else if (field !== "system" && field !== "flags") walk(child, next);
      }
    }
    if (/^!(?:actors|scenes(?:\.tokens)?)!/.test(key)) walk(value);
  }
  return result;
}

function hydrateEffects(item, rowIndex) {
  const document = structuredClone(item.value);
  const effects = document.effects ?? [];
  ensure(Array.isArray(effects), "Item effects are unreadable.");
  const prefix = item.key.replace(/!([^!]*)$/, ".effects!$1.");
  const used = new Set();
  document.effects = effects.map(effect => {
    ensure(!item.path || typeof effect !== "string", "Inline Item effect references require explicit reconstruction.");
    const value = typeof effect === "string" ? rowIndex.get(`${prefix}${effect}`) : effect;
    ensure(value && typeof value === "object" && idPattern.test(value._id) && !used.has(value._id), "Missing, duplicate or unreadable embedded Item effect.");
    if (typeof effect === "string") ensure(value._id === effect, "Embedded Item effect identity drift.");
    used.add(value._id);
    return structuredClone(value);
  });
  if (!item.path) for (const key of rowIndex.keys()) {
    if (key.startsWith(prefix)) ensure(used.has(key.slice(prefix.length)), "Orphan embedded Item effect needs review.");
  }
  return document;
}

/** Complete decoded content inventory. No database operations or source selection. */
export function inventoryMarketContent({ expectedSources, sources, digest }) {
  ensure(Array.isArray(expectedSources) && expectedSources.length > 0 && Array.isArray(sources), "Explicit source coverage is required.");
  const hash = value => {
    const result = digest(value);
    ensure(/^[a-f0-9]{64}$/.test(result), "SHA-256 digest required.");
    return result;
  };
  const expected = new Map(expectedSources.map(source => [sourceKey(source), source]));
  ensure(expected.size === expectedSources.length && sources.length === expected.size, "Decoded source coverage is incomplete or duplicated.");
  const seen = new Set(), entries = [], issues = [], canonicalTargets = [], coverage = [];
  const router = new CompendiumRouter({ packs: MARKET_STORAGE_PACKS });
  for (const source of sources) {
    const identity = sourceKey(source), declaration = expected.get(identity);
    ensure(declaration && !seen.has(identity) && source.documentType === declaration.documentType
      && source.relativePath === declaration.relativePath && Array.isArray(source.records), "Decoded source scope or coverage drift.");
    seen.add(identity);
    const rowIndex = new Map();
    for (const row of source.records) {
      ensure(typeof row?.key === "string" && !rowIndex.has(row.key) && row.value !== undefined, "Unreadable or duplicate decoded row.");
      rowIndex.set(row.key, row.value);
    }
    coverage.push({ ...declaration, records: source.records.length, sha256: hash(source.records) });
    for (const item of itemSources(source, source.records)) {
      const location = { scope: source.scope, world: source.world ?? "", collection: source.collection,
        recordKey: item.key, path: item.path, documentId: item.value?._id ?? "", owned: item.owned };
      if (!idPattern.test(location.documentId) || (!item.path && item.key.split("!").at(-1).split(".").at(-1) !== location.documentId)) {
        issues.push({ code: "item-identity-invalid", location }); continue;
      }
      const type = item.value.type, definitionId = String(item.value.system?.definitionId ?? "");
      if (source.scope === "system-compendium" && !item.owned && definitionId) {
        canonicalTargets.push({ definitionId, documentId: location.documentId, collection: `Veilrunner.${source.collection}` });
      }
      if (!isSemanticItemType(type)) {
        issues.push({ code: "unrecognized-item-type", type, definitionId, location }); continue;
      }
      if (!itemHasCapability(type, "marketSellable")) {
        if (/^veilrunner\.(?:equipment|weapon|armor|shield|ammunition|magazine|accessory|consumable|container|treasure)\./.test(definitionId)) {
          issues.push({ code: "physical-identity-on-nonphysical-item", type, definitionId, location });
        }
        continue;
      }
      const entry = { ...location, type, name: String(item.value.name ?? ""), definitionId,
        targetCollection: router.route(type).collection, proposedDefinitionId: null, sourceSha256: hash(item.value),
        document: null, documentSha256: null, sourceSelection: null };
      entry.sourceUuid = !item.owned ? (source.scope === "world-data" ? `Item.${location.documentId}`
        : `Compendium.${source.scope === "system-compendium" ? "Veilrunner" : "world"}.${source.collection}.Item.${location.documentId}`) : null;
      try { entry.proposedDefinitionId = proposeMarketDefinitionId({ type, definitionId }); }
      catch (error) { issues.push({ code: definitionId ? error.code : "unassigned-physical-item", location, type, definitionId }); }
      try { entry.document = hydrateEffects(item, rowIndex); entry.documentSha256 = hash(entry.document); }
      catch (error) { issues.push({ code: "embedded-content-incomplete", location, message: error.message }); }
      entries.push(entry);
    }
  }
  const byCanonicalId = new Map();
  for (const target of canonicalTargets) {
    if (!canonicalIdBuilder.isValid(target.definitionId)) issues.push({ code: "invalid-system-definition-id", target });
    const group = byCanonicalId.get(target.definitionId) ?? [];
    group.push(target); byCanonicalId.set(target.definitionId, group);
  }
  for (const [definitionId, targets] of byCanonicalId) if (targets.length > 1) issues.push({ code: "duplicate-system-definition-id", definitionId, targets });
  const tokens = new Set(entries.flatMap(entry => [entry.definitionId, entry.proposedDefinitionId, entry.sourceUuid,
    !entry.owned ? `Compendium.${entry.targetCollection}.Item.${entry.documentId}` : null]).filter(Boolean));
  const references = [];
  for (const source of sources) for (const record of source.records) {
    function walk(value, path = "", depth = 0) {
      ensure(depth < 100, "Reference structure exceeds inventory depth.");
      if (typeof value === "string") {
        if (tokens.has(value)) references.push({ scope: source.scope, world: source.world ?? "", collection: source.collection,
          recordKey: record.key, path, match: "value", token: value });
        if (/^\s*[\[{]/.test(value)) {
          let decoded;
          try { decoded = JSON.parse(value); } catch { return; }
          walk(decoded, `${path}.$json`, depth + 1);
        }
      } else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (tokens.has(key)) references.push({ scope: source.scope, world: source.world ?? "", collection: source.collection,
          recordKey: record.key, path: next, match: "key", token: key });
        walk(child, next, depth + 1);
      }
    }
    walk(record.value);
  }
  return freeze({ version: MARKET_CONTENT_INVENTORY_VERSION, coverageComplete: true,
    contentReadyForReview: issues.length === 0, executionApproved: false,
    summary: { databases: coverage.length, records: coverage.reduce((n, row) => n + row.records, 0),
      physicalItems: entries.length, definitionCandidates: entries.filter(entry => !entry.owned).length,
      ownedSnapshots: entries.filter(entry => entry.owned).length, issues: issues.length, exactReferences: references.length },
    coverage, entries, canonicalTargets, issues, references });
}
