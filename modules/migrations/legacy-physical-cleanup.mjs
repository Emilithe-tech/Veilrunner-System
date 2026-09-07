import { stableJson } from "./snapshot-compare.mjs";

const ensure = (value, message) => { if (!value) throw new Error(message); };
const identity = value => JSON.stringify([value.scope, value.world, value.collection]);

/** The user's exact 14 unassigned definitions and 17 owned snapshots. No name matching. */
export function selectLegacyPhysicalCleanup(inventory) {
  ensure(inventory?.coverageComplete && inventory.sourceAndArchiveUnchanged, "Complete protected inventory required.");
  const targets = inventory.entries.filter(entry => entry.owned || !entry.definitionId);
  ensure(targets.length === 31 && targets.filter(entry => !entry.owned).length === 14,
    "The approved 14-definition / 17-snapshot inventory changed.");
  const seen = new Set();
  return targets.map(entry => {
    const source = inventory.coverage.find(source => identity(source) === identity(entry));
    const key = `${source?.relativePath}:${entry.recordKey}`;
    ensure(source && !seen.has(key) && !entry.path && entry.document?.effects?.length === 0
      && entry.scope !== "system-compendium" && ["veilrunner", "veilrunner-human"].includes(entry.world),
    "Unsupported or duplicate cleanup target.");
    seen.add(key);
    const { scope, world, collection, recordKey, documentId, owned, type, name, definitionId, sourceSha256, sourceUuid } = entry;
    return { scope, world, collection, relativePath: source.relativePath, recordKey,
      documentId, owned, type, name, definitionId, sourceSha256, sourceUuid };
  });
}

function exactReferences(value, tokens, at = "", output = [], depth = 0) {
  ensure(depth < 100, "Reference structure is too deep to verify.");
  if (typeof value === "string") {
    if (tokens.has(value)) output.push({ path: at, value });
    if (/^\s*[\[{]/.test(value)) {
      let parsed;
      try { parsed = JSON.parse(value); } catch { return output; }
      exactReferences(parsed, tokens, `${at}.$json`, output, depth + 1);
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const next = at ? `${at}.${key}` : key;
      if (tokens.has(key)) output.push({ path: next, value: key });
      exactReferences(child, tokens, next, output, depth + 1);
    }
  }
  return output;
}

/** Prepare exact row deletes and the necessary Actor ownership/equipment detachment. */
export function prepareLegacyPhysicalCleanup({ targets, sources, digest }) {
  ensure(Array.isArray(targets) && targets.length > 0 && Array.isArray(sources), "Explicit cleanup inputs required.");
  const stores = new Map();
  for (const source of sources) {
    ensure(!stores.has(source.relativePath), "Duplicate cleanup store.");
    const before = new Map(source.records.map(row => [row.key, structuredClone(row.value)]));
    ensure(before.size === source.records.length, "Duplicate cleanup record.");
    stores.set(source.relativePath, { source, before, after: new Map([...before].map(([key, value]) => [key, structuredClone(value)])) });
  }
  const ownedByActor = new Map(), selected = new Set();
  for (const target of targets) {
    const store = stores.get(target.relativePath), value = store?.before.get(target.recordKey);
    const key = `${target.relativePath}:${target.recordKey}`;
    ensure(!selected.has(key) && value && digest(value) === target.sourceSha256
      && value._id === target.documentId && value.type === target.type
      && String(value.system?.definitionId ?? "") === target.definitionId,
    `Cleanup target changed: ${target.world} / ${target.name} / ${target.recordKey}`);
    selected.add(key);
    ensure(Array.isArray(value.effects) && value.effects.length === 0, "New embedded effects require review before deletion.");
    const suffix = target.recordKey.split("!").at(-1);
    const effectPrefix = `${target.owned ? "!actors.items.effects!" : "!items.effects!"}${suffix}.`;
    ensure(![...store.before.keys()].some(key => key.startsWith(effectPrefix)), "Unlisted embedded effect prevents cleanup.");
    store.after.delete(target.recordKey);
    if (target.owned) {
      const match = /^!actors\.items!([a-zA-Z0-9]{16})\.([a-zA-Z0-9]{16})$/.exec(target.recordKey);
      ensure(match && match[2] === target.documentId, "Unsupported owned snapshot storage.");
      const actorKey = `!actors!${match[1]}`, groupKey = `${target.relativePath}:${actorKey}`;
      const group = ownedByActor.get(groupKey) ?? { store, actorKey, ids: new Set() };
      group.ids.add(target.documentId); ownedByActor.set(groupKey, group);
    } else ensure(/^!items![a-zA-Z0-9]{16}$/.test(target.recordKey) && !target.definitionId,
      "Only reviewed unassigned definitions can be removed.");
  }

  const actorUpdates = [];
  for (const { store, actorKey, ids } of ownedByActor.values()) {
    const actor = store.after.get(actorKey);
    ensure(actor && Array.isArray(actor.items) && actor.items.every(id => typeof id === "string")
      && [...ids].every(id => actor.items.filter(value => value === id).length === 1), "Actor membership drift prevents cleanup.");
    actor.items = actor.items.filter(id => !ids.has(id));
    const clearedSlots = [];
    for (const [slot, id] of Object.entries(actor.system?.equipment ?? {})) {
      if (ids.has(id)) { actor.system.equipment[slot] = ""; clearedSlots.push(slot); }
    }
    if (actor.system?.equipmentAssignments !== undefined) {
      ensure(Array.isArray(actor.system.equipmentAssignments), "Unreadable equipment assignments.");
      actor.system.equipmentAssignments = actor.system.equipmentAssignments.filter(entry => !ids.has(entry.itemId));
    }
    // Unknown links (container loads, granted rules, custom flags, etc.) are never guessed away.
    for (const [key, value] of store.after) {
      if (key === actorKey || (key.startsWith("!actors.") && key.split("!").at(-1).startsWith(`${actor._id}.`))) {
        ensure(exactReferences(value, ids).length === 0, `Unresolved owned Item reference in ${key}.`);
      }
    }
    actorUpdates.push({ world: store.source.world, actorId: actor._id, actorName: actor.name,
      removedItemIds: [...ids], clearedSlots });
  }
  for (const { source, after } of stores.values()) {
    const tokens = new Set(targets.filter(target => !source.world || target.world === source.world)
      .map(target => target.owned ? `Actor.${target.recordKey.split("!").at(-1).split(".")[0]}.Item.${target.documentId}` : target.sourceUuid)
      .filter(Boolean));
    for (const [key, value] of after) ensure(exactReferences(value, tokens).length === 0,
      `Unresolved reference to deleted content in ${source.relativePath} / ${key}.`);
  }
  const changes = [];
  for (const [relativePath, { before, after }] of stores) {
    for (const [key, value] of before) {
      if (!after.has(key) || stableJson(value) !== stableJson(after.get(key))) {
        changes.push({ relativePath, key, before: value, after: after.has(key) ? after.get(key) : null });
      }
    }
  }
  return { version: 1, operation: "remove-reviewed-legacy-physical-content", targets,
    deletedDocuments: targets.length, actorUpdates, changes };
}

/** Only exact before/after states are retryable; unrelated edits fail closed. */
export function cleanupBatchForState(changes, rows, { rollback = false } = {}) {
  const current = new Map(rows.map(row => [row.key, row.value]));
  return changes.flatMap(change => {
    const value = current.get(change.key) ?? null;
    ensure(stableJson(value) === stableJson(change.before) || stableJson(value) === stableJson(change.after),
      `Cleanup row drift: ${change.key}`);
    const desired = rollback ? change.before : change.after;
    if (stableJson(value) === stableJson(desired)) return [];
    return [desired === null ? { type: "del", key: change.key } : { type: "put", key: change.key, value: structuredClone(desired) }];
  });
}
