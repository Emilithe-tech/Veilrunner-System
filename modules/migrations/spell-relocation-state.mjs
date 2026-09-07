import {
  SpellRelocationError,
  prepareRelocatedActorSpell,
  prepareRelocatedSpellDefinition
} from "./spell-relocation.mjs";

function recordsByKey(records, label) {
  if (!Array.isArray(records)) throw new TypeError(`${label} records must be an array.`);
  const indexed = new Map();
  for (const record of records) {
    const key = String(Array.isArray(record) ? record[0] : record?.key ?? "");
    const value = Array.isArray(record) ? record[1] : record?.value;
    if (!key || indexed.has(key)) throw new SpellRelocationError(`${label} contains a missing or duplicate decoded key: ${key}.`, { label, key });
    indexed.set(key, value);
  }
  return indexed;
}

function assertDigest(digest, value, expected, label) {
  const actual = String(digest(value) ?? "");
  if (actual !== expected) throw new SpellRelocationError(`${label} digest drifted from the locked Spell relocation map.`, { label, expected, actual });
}

/** Classify a complete frozen/live relocation state before any writes occur. */
export function planSpellRelocationState({
  map,
  systemRecords,
  worldSpellRecords,
  actorRecords,
  systemId = "Veilrunner",
  systemVersion,
  digest
} = {}) {
  if (!map?.byDocumentId || !map?.bySourceDefinitionId || !map?.byTargetDefinitionId || !map?.byActorKey) {
    throw new TypeError("Spell relocation state planning requires an indexed locked map.");
  }
  if (typeof digest !== "function") throw new TypeError("Spell relocation state planning requires a deterministic digest function.");
  if (!String(systemVersion ?? "").trim()) throw new TypeError("Spell relocation state planning requires the target system version.");
  const system = recordsByKey(systemRecords, "System target pack");
  const world = recordsByKey(worldSpellRecords, "World Spell source pack");
  const actors = recordsByKey(actorRecords, "World Actor database");
  const lockedWorldKeys = new Set(map.rows.map(row => row.sourceKey));
  const actualWorldSpellKeys = [...world.entries()]
    .filter(([, value]) => value?.type === "spell")
    .map(([key]) => key);
  const unexpectedWorldKeys = actualWorldSpellKeys.filter(key => !lockedWorldKeys.has(key));
  if (actualWorldSpellKeys.length !== map.rows.length || unexpectedWorldKeys.length) {
    throw new SpellRelocationError("World Spell source pack no longer matches the exact locked definition set.", {
      expected: map.rows.length,
      actual: actualWorldSpellKeys.length,
      unexpectedWorldKeys
    });
  }

  const sourceByDefinitionId = new Map();
  for (const row of map.rows) {
    const source = world.get(row.sourceKey);
    if (!source) throw new SpellRelocationError(`Locked World Spell source is missing: ${row.sourceKey}.`, { row });
    assertDigest(digest, source, row.sourceSha256, `World Spell ${row.sourceKey}`);
    sourceByDefinitionId.set(row.sourceDefinitionId, source);
  }

  const targetByDefinitionId = new Map(map.rows.map(row => [row.targetDefinitionId, row]));
  const unexpectedSystemSpellKeys = [];
  for (const [key, value] of system) {
    if (!key.startsWith("!items!")) continue;
    const row = targetByDefinitionId.get(String(value?.system?.definitionId ?? ""));
    if (value?.type === "spell" && !row) unexpectedSystemSpellKeys.push(key);
    if (row && key !== `!items!${row.documentId}`) {
      throw new SpellRelocationError("Canonical system target identity exists under an unexpected document key.", { key, row });
    }
  }
  if (unexpectedSystemSpellKeys.length) {
    throw new SpellRelocationError("System target pack contains Spell definitions outside the locked relocation map.", { unexpectedSystemSpellKeys });
  }

  const definitionCreates = [];
  let appliedDefinitions = 0;
  for (const row of map.rows) {
    const key = `!items!${row.documentId}`;
    const current = system.get(key);
    if (current !== undefined) {
      assertDigest(digest, current, row.targetSha256, `Canonical system Spell ${key}`);
      appliedDefinitions += 1;
      continue;
    }
    const prepared = prepareRelocatedSpellDefinition(sourceByDefinitionId.get(row.sourceDefinitionId), {
      row,
      systemId,
      systemVersion
    }).document;
    assertDigest(digest, prepared, row.targetSha256, `Prepared canonical system Spell ${key}`);
    definitionCreates.push(Object.freeze({ key, after: prepared, afterSha256: row.targetSha256 }));
  }

  const actorBySourceKey = new Map(map.actorTargets.map(row => [row.sourceKey, row]));
  const sourceIds = new Set(map.rows.map(row => row.sourceDefinitionId));
  const targetIds = new Set(map.rows.map(row => row.targetDefinitionId));
  const unexpectedActorKeys = [];
  for (const [key, value] of actors) {
    if (!key.startsWith("!actors.items!")) continue;
    const definitionId = String(value?.system?.definitionId ?? "");
    if (value?.type === "spell" && !actorBySourceKey.has(key)) unexpectedActorKeys.push(key);
    else if ((sourceIds.has(definitionId) || targetIds.has(definitionId)) && !actorBySourceKey.has(key)) unexpectedActorKeys.push(key);
  }
  if (unexpectedActorKeys.length) {
    throw new SpellRelocationError("Actor database contains Spell copies outside the locked relocation target set.", { unexpectedActorKeys });
  }

  const actorUpdates = [];
  let appliedActorTargets = 0;
  for (const row of map.actorTargets) {
    const current = actors.get(row.sourceKey);
    if (!current) throw new SpellRelocationError(`Locked Actor Spell target is missing: ${row.sourceKey}.`, { row });
    const currentSha256 = String(digest(current) ?? "");
    if (currentSha256 === row.targetSha256) {
      appliedActorTargets += 1;
      continue;
    }
    if (currentSha256 !== row.sourceSha256) {
      throw new SpellRelocationError(`Actor Spell ${row.sourceKey} is neither the locked source nor expected target.`, {
        expectedSource: row.sourceSha256,
        expectedTarget: row.targetSha256,
        actual: currentSha256
      });
    }
    const prepared = prepareRelocatedActorSpell(current, { row, systemVersion }).document;
    assertDigest(digest, prepared, row.targetSha256, `Prepared Actor Spell ${row.sourceKey}`);
    actorUpdates.push(Object.freeze({
      key: row.sourceKey,
      before: current,
      beforeSha256: row.sourceSha256,
      after: prepared,
      afterSha256: row.targetSha256
    }));
  }

  return Object.freeze({
    definitionCreates: Object.freeze(definitionCreates),
    actorUpdates: Object.freeze(actorUpdates),
    summary: Object.freeze({
      sourceDefinitions: map.rows.length,
      pendingDefinitionCreates: definitionCreates.length,
      appliedDefinitions,
      actorTargets: map.actorTargets.length,
      pendingActorUpdates: actorUpdates.length,
      appliedActorTargets
    })
  });
}
