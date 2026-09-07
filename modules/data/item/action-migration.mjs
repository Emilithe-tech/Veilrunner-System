import { migrateActionSystemData } from "./action-formula.mjs";

const ACTION_ITEM_TYPES = new Set(["action", "ability", "spell", "skill"]);
const MIGRATED_KEYS = ["actionMode", "activationKind", "actionType", "category", "actions", "damageFormula", "baseSpellDamage", "spellDamagePerLevel", "favorite"];

export function isBundledSystemItemPack(pack, systemId) {
  return pack?.documentName === "Item" && (
    pack.metadata?.packageName === systemId || String(pack.collection ?? "").startsWith(`${systemId}.`)
  );
}

export function actionMigrationUpdate(item) {
  if (!ACTION_ITEM_TYPES.has(item?.type)) return null;
  const current = item._source?.system ?? item.system?.toObject?.() ?? item.system ?? {};
  const migrated = migrateActionSystemData(structuredClone(current), { itemType: item.type });
  const id = item._source?._id ?? item.toObject?.()._id ?? item._id ?? item.id;
  if (!id) return null;
  const update = { _id: id };
  let changed = false;
  for (const key of MIGRATED_KEYS) {
    if (current[key] === migrated[key]) continue;
    update[`system.${key}`] = migrated[key];
    changed = true;
  }
  if ((["spell", "skill"].includes(item.type) || migrated.actionMode === "spell") && current.rankScaling?.enabled !== true) {
    update["system.rankScaling.enabled"] = true;
    changed = true;
  }
  return changed ? update : null;
}

/** GM-only, idempotent migration; locked system-pack work remains deferred. */
export async function migrateActionItemsToCompactFormat() {
  if (!game.user?.isGM) return { world: 0, actors: 0, packs: 0, deferredPacks: [] };
  let world = 0;
  let actors = 0;
  let packs = 0;
  const deferredPacks = [];

  const worldUpdates = Array.from(game.items ?? []).map(actionMigrationUpdate).filter(Boolean);
  if (worldUpdates.length) {
    await foundry.documents.Item.updateDocuments(worldUpdates);
    world = worldUpdates.length;
  }

  for (const actor of Array.from(game.actors ?? [])) {
    const updates = Array.from(actor.items ?? []).map(actionMigrationUpdate).filter(Boolean);
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates);
    actors += updates.length;
  }

  for (const pack of game.packs.filter(entry => isBundledSystemItemPack(entry, game.system.id))) {
    const documents = await pack.getDocuments();
    const updates = documents.map(actionMigrationUpdate).filter(Boolean);
    if (!updates.length) continue;
    // Startup never grants itself a pack-write permission or unlocks canonical content.
    if (pack.locked !== false) {
      deferredPacks.push({ collection: pack.collection, documents: updates.length,
        reason: pack.locked === true ? "locked" : "lock-state-unavailable" });
      continue;
    }
    await pack.documentClass.updateDocuments(updates, { pack: pack.collection });
    packs += updates.length;
  }

  if (deferredPacks.length) console.warn("Veilrunner | Compact action migration deferred for non-writable compendia; sources and locks unchanged.", deferredPacks);
  return { world, actors, packs, deferredPacks };
}
