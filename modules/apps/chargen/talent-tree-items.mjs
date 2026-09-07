import { talentTreeCatalog } from "../../data/talent-tree.mjs";
import { canonicalIdBuilder } from "../../data/definitions/canonical-id.mjs";
import { CanonicalDefinitionReader } from "../../data/definitions/canonical-reader.mjs";
import { prepareActorOwnedSnapshot } from "../../data/definitions/provenance.mjs";

const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection?.values?.() ?? collection ?? []);

function treeLeaves(catalog) {
  const records = new Map();
  for (const page of ["skills", "magic"]) for (const school of catalog[page] ?? []) for (const practice of school.practices ?? []) for (const leaf of practice.spells ?? []) {
    if (records.has(leaf.id)) throw new Error("Progression node identity is ambiguous: " + leaf.id);
    records.set(leaf.id, { page, school, practice, leaf });
  }
  return records;
}

function ownedTreeItems(actor, systemId) {
  const items = new Map();
  for (const item of documentsIn(actor?.items)) {
    const nodeId = item.flags?.[systemId]?.treeNodeId ?? item.flags?.veilrunner?.treeNodeId;
    if (!nodeId) continue;
    if (items.has(nodeId)) throw new Error("Owned progression node identity is ambiguous: " + nodeId);
    items.set(nodeId, item);
  }
  return items;
}

/** Prepare a whole grant batch before the first Actor write. Existing snapshots remain authoritative. */
export async function prepareTalentTreeItemGrants(actor, tree, catalog = talentTreeCatalog()) {
  const creates = [];
  const updates = [];
  const errors = [];
  const systemId = globalThis.game?.system?.id ?? "Veilrunner";
  try {
    const records = treeLeaves(catalog);
    const existing = ownedTreeItems(actor, systemId);
    const readers = new Map();
    const purchases = new Set();
    for (const purchase of tree?.leaves ?? []) {
      if (purchases.has(purchase.id)) throw new Error("Progression purchase is duplicated: " + purchase.id);
      purchases.add(purchase.id);
      const record = records.get(purchase.id);
      if (!record) throw new Error(purchase.id + " has no canonical progression node.");
      const definitionId = String(record.leaf.definitionId ?? "");
      if (!canonicalIdBuilder.isValid(definitionId)) throw new Error(purchase.id + " has no saved canonical definition identity.");
      const current = existing.get(purchase.id);
      const expectedTypes = record.page === "magic" ? ["spell"] : ["skill", "talent"];
      if (current) {
        if (current.system?.definitionId !== definitionId || !expectedTypes.includes(current.type)) {
          throw new Error(purchase.id + " needs an explicit owned-identity migration before advancement.");
        }
        const maxLevel = current.system?.progression?.maxLevel ?? current.system?.maxLevel ?? 1;
        const currentLevel = Math.min(Math.max(1, Number(maxLevel) || 1), Math.max(1, Number(purchase.rank) || 1));
        if (Number(current.system?.owned?.currentLevel ?? current.system?.currentLevel) !== currentLevel) {
          updates.push({ _id: current.id, "system.owned.currentLevel": currentLevel,
            ...(Object.hasOwn(current.system ?? {}, "currentLevel") ? { "system.currentLevel": currentLevel } : {}) });
        }
        continue;
      }
      let reader = readers.get(record.page);
      if (!reader) {
        reader = new CanonicalDefinitionReader(expectedTypes, { capability: "progressionContent" });
        readers.set(record.page, reader);
      }
      const sourceDocument = await reader.resolve(definitionId);
      const maxLevel = sourceDocument.system?.progression?.maxLevel ?? sourceDocument.system?.maxLevel ?? 1;
      const currentLevel = Math.min(Math.max(1, Number(maxLevel) || 1), Math.max(1, Number(purchase.rank) || 1));
      const source = prepareActorOwnedSnapshot(sourceDocument, {
        sourceVersion: sourceDocument._stats?.systemVersion ?? globalThis.game?.system?.version ?? "", currentLevel
      });
      for (const key of ["folder", "sort", "ownership", "_stats"]) delete source[key];
      if (Object.hasOwn(source.system, "currentLevel")) source.system.currentLevel = currentLevel;
      source.flags[systemId] = { ...(source.flags[systemId] ?? {}), treeNodeId: purchase.id, talentTreePage: record.page };
      creates.push(source);
    }
  } catch (error) {
    errors.push(error.message);
  }
  return { valid: !errors.length, errors, creates: errors.length ? [] : creates, updates: errors.length ? [] : updates };
}

export async function validateTalentTreeItemSources(tree, catalog = talentTreeCatalog(), actor = null) {
  const { valid, errors } = await prepareTalentTreeItemGrants(actor, tree, catalog);
  return { valid, errors };
}

/** Grants use canonical definitions; advancement updates only state on the owned snapshot. */
export async function syncActorTalentTreeItems(actor, tree = actor?.system?.talentTree, catalog = talentTreeCatalog()) {
  const plan = await prepareTalentTreeItemGrants(actor, tree, catalog);
  if (!plan.valid) return { valid: false, errors: plan.errors, created: 0, updated: 0 };
  if (plan.creates.length) await actor.createEmbeddedDocuments("Item", plan.creates);
  if (plan.updates.length) await actor.updateEmbeddedDocuments("Item", plan.updates);
  return { valid: true, errors: [], created: plan.creates.length, updated: plan.updates.length };
}

