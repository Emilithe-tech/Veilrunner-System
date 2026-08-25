import { getDefinitionId } from "./identity.mjs";

export const ACTOR_ACTION_ITEM_TYPES = Object.freeze(["action", "ability", "spell", "skill"]);
const ACTION_TYPES = new Set(ACTOR_ACTION_ITEM_TYPES);
const SYNC_OPTION = "veilrunnerCanonicalActionSync";

const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection ?? []);
const clone = value => globalThis.foundry?.utils?.deepClone?.(value) ?? structuredClone(value);

function sourceObject(item) {
  return item?.toObject?.() ?? { name: item?.name, img: item?.img, system: item?.system ?? {}, effects: item?.effects ?? [] };
}

export function isCanonicalActorAction(item) {
  return Boolean(item && ACTION_TYPES.has(item.type) && item.parent?.documentName !== "Actor" && getDefinitionId(item));
}

/** Build a canonical update while retaining fields that belong to this actor's progression/UI. */
export function actorActionSyncUpdate(source, owned) {
  if (!isCanonicalActorAction(source) || !owned || owned.type !== source.type || getDefinitionId(owned) !== getDefinitionId(source)) return null;
  const canonical = sourceObject(source);
  const system = clone(canonical.system ?? {});
  const maxLevel = Math.max(1, Number(system.maxLevel) || 1);
  system.currentLevel = Math.min(maxLevel, Math.max(1, Number(owned.system?.currentLevel) || 1));
  system.favorite = Boolean(owned.system?.favorite);
  return {
    _id: owned.id,
    name: String(canonical.name ?? source.name ?? owned.name),
    img: String(canonical.img ?? source.img ?? owned.img ?? ""),
    system,
    effects: clone(canonical.effects ?? [])
  };
}

export async function syncCanonicalActorAction(source, { actors = globalThis.game?.actors } = {}) {
  if (!isCanonicalActorAction(source)) return { actors: 0, items: 0 };
  let actorCount = 0;
  let itemCount = 0;
  for (const actor of documentsIn(actors)) {
    const updates = documentsIn(actor?.items).map(owned => actorActionSyncUpdate(source, owned)).filter(Boolean);
    if (!updates.length || typeof actor?.updateEmbeddedDocuments !== "function") continue;
    await actor.updateEmbeddedDocuments("Item", updates, { [SYNC_OPTION]: true });
    actorCount += 1;
    itemCount += updates.length;
  }
  return { actors: actorCount, items: itemCount };
}

function isPrimaryGM() {
  if (!globalThis.game?.user?.isGM) return false;
  const activeGM = globalThis.game?.users?.activeGM;
  return !activeGM || activeGM.id === globalThis.game.user.id;
}

export function registerActorActionSync() {
  const synchronize = source => {
    if (!isPrimaryGM() || !isCanonicalActorAction(source)) return;
    syncCanonicalActorAction(source).catch(error => {
      console.error("Veilrunner | Failed to synchronize canonical action to actors", source, error);
      globalThis.ui?.notifications?.error?.(`Could not update actor copies of ${source.name}.`);
    });
  };
  for (const hook of ["createItem", "updateItem"]) Hooks.on(hook, (item, changes, options) => {
    if (!options?.[SYNC_OPTION]) synchronize(item);
  });
  for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, effect => synchronize(effect?.parent));
  }
}
