import { combatantForActor, getCombatEconomy, movementActionCost, movementDistanceForHistory } from "./economy.mjs";
import { getHudPreferences, replaceHudPreferences, setHudPreferences } from "./preferences.mjs";
import { systemId } from "./constants.mjs";

const clone = value => {
  if (value === undefined) return undefined;
  return globalThis.foundry?.utils?.deepClone?.(value) ?? structuredClone(value);
};
function sourceOf(document) {
  if (document?.toObject) return document.toObject();
  if (document?._source) return clone(document._source);
  const source = {};
  for (const key of ["_id", "id", "name", "img", "type", "system", "flags", "disabled", "changes", "duration", "origin", "transfer", "statuses"])
    if (document?.[key] !== undefined) source[key === "id" ? "_id" : key] = clone(document[key]);
  return source;
}
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function restorationPatch(before, after, prefix = "system", patch = {}) {
  if (same(before, after)) return patch;
  const beforeObject = before && typeof before === "object" && !Array.isArray(before);
  const afterObject = after && typeof after === "object" && !Array.isArray(after);
  if (!beforeObject || !afterObject) {
    patch[prefix] = clone(before);
    return patch;
  }
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!(key in before)) patch[`${prefix}.-=${key}`] = null;
    else if (!(key in after)) patch[`${prefix}.${key}`] = clone(before[key]);
    else restorationPatch(before[key], after[key], `${prefix}.${key}`, patch);
  }
  return patch;
}

function canUpdate(combatant) {
  return Boolean(globalThis.game?.user?.isGM || combatant?.isOwner || combatant?.testUserPermission?.(globalThis.game?.user, "OWNER"));
}

function collectionDocuments(collection) {
  return Array.from(collection ?? []).filter(Boolean);
}

function snapshotDocuments(collection) {
  return collectionDocuments(collection).map(document => sourceOf(document));
}

function changedDocuments(before, after) {
  const beforeById = new Map(before.map(source => [source._id ?? source.id, source]));
  const afterById = new Map(after.map(source => [source._id ?? source.id, source]));
  return {
    restore: before.filter(source => !same(source, afterById.get(source._id ?? source.id))),
    created: after.filter(source => !beforeById.has(source._id ?? source.id)).map(source => source._id ?? source.id).filter(Boolean)
  };
}

function subjectActors(actor) {
  const actors = [actor, ...Array.from(globalThis.game?.user?.targets ?? []).map(token => token?.actor)].filter(Boolean);
  return [...new Map(actors.map(subject => [subject.uuid ?? subject.id, subject])).values()];
}

/** Capture state before an action. The document references remain local and are removed before persistence. */
export function captureHudUndoState(actor, action, combat = globalThis.game?.combat) {
  const economy = getCombatEconomy(actor, combat);
  const preferences = getHudPreferences(actor);
  return {
    actor,
    subjects: subjectActors(actor).map(subject => ({
      subject,
      uuid: subject.uuid ?? subject.id,
      system: clone(subject.system ?? {}),
      items: snapshotDocuments(subject.items),
      effects: snapshotDocuments(subject.effects)
    })),
    actionId: action?.id ?? "",
    actionName: action?.name ?? "Action",
    actorId: actor?.id ?? "",
    actorUuid: actor?.uuid ?? "",
    userId: globalThis.game?.user?.id ?? "",
    system: clone(actor?.system ?? {}),
    items: snapshotDocuments(actor?.items),
    economy: economy ? { key: economy.key, actions: economy.actions, reactions: economy.reactions, attacks: economy.attacks } : null,
    preferences: clone(preferences)
  };
}

/** Reduce the local snapshot to the document state that actually changed. */
export function finalizeHudUndoState(snapshot) {
  if (!snapshot?.actor) return null;
  const itemChanges = changedDocuments(snapshot.items, snapshotDocuments(snapshot.actor.items));
  const currentSystem = clone(snapshot.actor.system ?? {});
  const actorUuids = new Set([snapshot.actorUuid, snapshot.actorId].filter(Boolean));
  const subjectChanges = snapshot.subjects.map(entry => {
    const isActor = actorUuids.has(entry.uuid);
    const system = isActor ? {} : restorationPatch(entry.system, clone(entry.subject.system ?? {}));
    const items = isActor ? { restore: [], created: [] } : changedDocuments(entry.items, snapshotDocuments(entry.subject.items));
    const effects = changedDocuments(entry.effects, snapshotDocuments(entry.subject.effects));
    return { uuid: entry.uuid, system, items, effects };
  }).filter(entry => Object.keys(entry.system).length || entry.items.restore.length || entry.items.created.length || entry.effects.restore.length || entry.effects.created.length);
  return {
    version: 2,
    type: "action",
    actionId: snapshot.actionId,
    actionName: snapshot.actionName,
    actorId: snapshot.actorId,
    actorUuid: snapshot.actorUuid,
    userId: snapshot.userId,
    createdAt: Date.now(),
    system: restorationPatch(snapshot.system, currentSystem),
    items: itemChanges,
    subjects: subjectChanges,
    economy: snapshot.economy,
    preferences: snapshot.preferences
  };
}

export function getHudUndoRecord(actor, combat = globalThis.game?.combat) {
  return getHudUndoHistory(actor, combat).at(-1) ?? null;
}

/** Return this user's undoable actions for the current combatant turn, oldest first. */
export function getHudUndoHistory(actor, combat = globalThis.game?.combat) {
  const combatant = combatantForActor(actor, combat);
  const hudFlags = combatant?.flags?.[systemId()]?.actionHud ?? {};
  const history = Array.isArray(hudFlags.undoHistory) ? hudFlags.undoHistory : [hudFlags.undo].filter(Boolean);
  return history.filter(record => record?.actorId === actor?.id && (globalThis.game?.user?.isGM || !record.userId || record.userId === globalThis.game?.user?.id));
}

function undoFlagChanges(history) {
  const next = history.at(-1) ?? null;
  return {
    [`flags.${systemId()}.actionHud.undoHistory`]: history,
    [`flags.${systemId()}.actionHud.undo`]: next
  };
}

export async function storeHudUndoState(actor, snapshot, combat = globalThis.game?.combat) {
  const combatant = combatantForActor(actor, combat);
  if (!combatant || !canUpdate(combatant)) return false;
  const record = finalizeHudUndoState(snapshot);
  if (!record) return false;
  const history = [...getHudUndoHistory(actor, combat), record];
  await combatant.update(undoFlagChanges(history));
  return true;
}

/** Make a completed Foundry movement the combatant's latest undoable action. */
export async function recordHudMovementUndo(token, movement, user, combat = globalThis.game?.combat) {
  const actor = token?.actor;
  const combatant = combatantForActor(actor, combat);
  if (!actor || !combatant || !canUpdate(combatant) || user?.id !== globalThis.game?.user?.id) return false;
  const movementId = movement?.id ?? token.movementHistory?.at?.(-1)?.movementId;
  if (!movementId || !token.movementHistory?.some?.(waypoint => waypoint.movementId === movementId)) return false;
  const latestUndo = getHudUndoRecord(actor, combat);
  if (latestUndo?.type === "movement" && latestUndo.movementId === movementId) return false;
  const history = Array.from(token.movementHistory ?? []);
  const first = history.findIndex(waypoint => waypoint.movementId === movementId);
  const priorHistory = first > 0 ? history.slice(0, first) : [];
  const economy = getCombatEconomy(actor, combat);
  if (!economy) return false;
  const priorMovementCost = movementActionCost(movementDistanceForHistory(token, priorHistory), economy.movementLimit);
  const movementCost = movementActionCost(movementDistanceForHistory(token, history), economy.movementLimit);
  const additionalCost = Math.max(0, movementCost - priorMovementCost);
  const economyBefore = { key: economy.key, actions: economy.actions, reactions: economy.reactions, movement: economy.movementLimit, attacks: economy.attacks };
  const nextEconomy = { ...economyBefore, actions: Math.max(0, economy.actions - additionalCost) };
  const record = {
    version: 1,
    type: "movement",
    actionName: "Movement",
    actorId: actor.id,
    actorUuid: actor.uuid ?? "",
    userId: user.id,
    tokenUuid: token.uuid ?? "",
    movementId,
    economy: economyBefore,
    actionCost: additionalCost,
    createdAt: Date.now()
  };
  const historyRecords = [...getHudUndoHistory(actor, combat), record];
  await combatant.update({
    [`flags.${systemId()}.actionHud.economy`]: nextEconomy,
    ...undoFlagChanges(historyRecords)
  });
  return true;
}

async function resolveSubject(uuid, actor) {
  if ([actor?.uuid, actor?.id].includes(uuid)) return actor;
  const targeted = Array.from(globalThis.game?.user?.targets ?? []).map(token => token?.actor).find(subject => [subject?.uuid, subject?.id].includes(uuid));
  if (targeted) return targeted;
  const worldActor = globalThis.game?.actors?.get?.(uuid) ?? Array.from(globalThis.game?.actors ?? []).find(subject => [subject?.uuid, subject?.id].includes(uuid));
  if (worldActor) return worldActor;
  return globalThis.fromUuid?.(uuid) ?? globalThis.fromUuidSync?.(uuid) ?? null;
}

async function restoreEmbedded(parent, type, changes) {
  if (!parent || !changes) return;
  if (changes.created?.length) await parent.deleteEmbeddedDocuments(type, changes.created);
  const existingIds = new Set(collectionDocuments(type === "Item" ? parent.items : parent.effects).map(document => document.id));
  const updates = (changes.restore ?? []).filter(source => existingIds.has(source._id ?? source.id));
  const recreates = (changes.restore ?? []).filter(source => !existingIds.has(source._id ?? source.id));
  if (updates.length) await parent.updateEmbeddedDocuments(type, updates);
  if (recreates.length) await parent.createEmbeddedDocuments(type, recreates, { keepId: true });
}

/** Restore the last successful HUD action's mechanical state. Chat messages and dice rolls remain as an audit trail. */
export async function undoLastHudAction(actor, combat = globalThis.game?.combat) {
  const combatant = combatantForActor(actor, combat);
  const history = getHudUndoHistory(actor, combat);
  const record = history.at(-1) ?? null;
  if (!combatant || !record || !canUpdate(combatant)) return { success: false, reason: "There is no action available to undo." };
  const remaining = history.slice(0, -1);
  try {
    if (record.type === "movement") {
      const token = await resolveSubject(record.tokenUuid, combatant.token);
      if (!token?.revertRecordedMovement || !await token.revertRecordedMovement(record.movementId))
        return { success: false, reason: "That movement is no longer available to undo." };
      const changes = undoFlagChanges(remaining);
      if (record.economy) changes[`flags.${systemId()}.actionHud.economy`] = clone(record.economy);
      await combatant.update(changes);
      return { success: true, actionName: record.actionName, remaining: remaining.length };
    }
    if (Object.keys(record.system ?? {}).length) await actor.update(clone(record.system));
    await restoreEmbedded(actor, "Item", record.items);
    if (Array.isArray(record.subjects)) {
      for (const changes of record.subjects) {
        const subject = await resolveSubject(changes.uuid, actor);
        if (!subject) throw new Error(`Undo subject ${changes.uuid} is no longer available.`);
        if (Object.keys(changes.system ?? {}).length) await subject.update(clone(changes.system));
        await restoreEmbedded(subject, "Item", changes.items);
        await restoreEmbedded(subject, "ActiveEffect", changes.effects);
      }
    } else {
      for (const changes of record.effects ?? []) await restoreEmbedded(await resolveSubject(changes.uuid, actor), "ActiveEffect", changes);
    }
    if (record.economy) await combatant.update({ [`flags.${systemId()}.actionHud.economy`]: clone(record.economy) });
    if (Number(record.version) >= 2) await replaceHudPreferences(actor, clone(record.preferences ?? {}));
    else await setHudPreferences(actor, { recent: clone(record.preferences?.recent ?? []), remembered: clone(record.preferences?.remembered ?? {}) });
    await combatant.update(undoFlagChanges(remaining));
    return { success: true, actionName: record.actionName, remaining: remaining.length };
  } catch (error) {
    console.error("Veilrunner | Could not undo the last HUD action", error);
    return { success: false, reason: "The last action could not be fully restored.", error };
  }
}

/** Rewind the current turn from the newest record through the selected history entry. */
export async function undoHudActionsThrough(actor, historyIndex, combat = globalThis.game?.combat) {
  const history = getHudUndoHistory(actor, combat);
  const targetIndex = Math.floor(Number(historyIndex));
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= history.length)
    return { success: false, reason: "That undo history entry is no longer available." };
  const selected = history[targetIndex];
  const undone = [];
  for (let index = history.length - 1; index >= targetIndex; index -= 1) {
    const result = await undoLastHudAction(actor, combat);
    if (!result.success) return {
      ...result,
      partial: undone.length > 0,
      undone,
      reason: undone.length ? `${result.reason} ${undone.length} newer history entries were already restored.` : result.reason
    };
    undone.push(result.actionName);
  }
  return { success: true, actionName: selected.actionName, count: undone.length, undone, remaining: targetIndex };
}
