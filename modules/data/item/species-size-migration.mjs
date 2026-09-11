const SPECIES_PACK = "Veilrunner.character-library";

/** Persist the temporary Medium default into every existing Species definition once. */
export async function migrateSpeciesSizes() {
  if (!globalThis.game?.user?.isGM) return { migrated: 0, missingPack: false };
  const pack = game.packs.get(SPECIES_PACK);
  if (!pack) return { migrated: 0, missingPack: true };
  const documents = await pack.getDocuments();
  const updates = documents.filter(document => document.type === "species" && !String(document._source?.system?.size ?? "").trim())
    .map(document => ({ _id: document.id, "system.size": "Medium" }));
  if (!updates.length) return { migrated: 0, missingPack: false };
  const wasLocked = Boolean(pack.locked);
  if (wasLocked) await pack.configure({ locked: false });
  try {
    await Item.updateDocuments(updates, { pack: pack.collection });
  } finally {
    if (wasLocked) await pack.configure({ locked: true });
  }
  return { migrated: updates.length, missingPack: false };
}
