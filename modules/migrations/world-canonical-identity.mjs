import {
  CANONICAL_IDENTITY_MIGRATION_VERSION
} from "./canonical-identity.mjs";
import {
  QUALITY_ALIAS_MIGRATION_VERSION
} from "./quality-alias.mjs";

export const WORLD_CANONICAL_IDENTITY_MIGRATION_VERSION = 1;
export const WORLD_CANONICAL_IDENTITY_SETTING = "canonicalIdentityMigration";
export const WORLD_CANONICAL_IDENTITY_MAP_SHA256 = "303b49e721e5ccadea396f617ef22f848cd9929f05878c96ad7f1b69df01c458";

export const WORLD_CANONICAL_IDENTITY_TARGET = Object.freeze({
  pack: "qualities-perks",
  documentId: "mBNqPx2UWhqhqpf9",
  name: "Art of the Deal",
  sourceType: "flaw",
  targetType: "quality",
  kind: "flaw",
  oldDefinitionId: "veilrunner.flaw.artofthedeal",
  proposedDefinitionId: "veilrunner.quality.flaw.social.art-of-the-deal",
  sourceUuid: "Compendium.Veilrunner.qualities-perks.Item.mBNqPx2UWhqhqpf9"
});

export const WORLD_CANONICAL_IDENTITY_SYSTEM_SENTINELS = Object.freeze([
  ["archetypes", "62e379500f189953", "archetype", "veilrunner.archetype.physique", "veilrunner.character.archetype.physique"],
  ["backgrounds", "1fxDuFbouRtE0ZOk", "background", "veilrunner.background.underworldoperative", "veilrunner.character.background.underworld-operative"],
  ["disciplines", "001a26b3c69d0811", "discipline", "veilrunner.discipline.vehicle-pilot.ground-operator", "veilrunner.character.discipline.vehicle-pilot.ground-operator"],
  ["origins", "03wwqzev5NDsS3pk", "origin", "veilrunner.origin.test", "veilrunner.character.origin.test"],
  ["professions", "012d8af2a469d1d1", "profession", "veilrunner.profession.martial-artist", "veilrunner.character.profession.martial-artist"],
  ["qualities-perks", "mBNqPx2UWhqhqpf9", "quality", "veilrunner.flaw.artofthedeal", "veilrunner.quality.flaw.social.art-of-the-deal"],
  ["species", "5x6meSyNiW6nVStc", "species", "veilrunner.species.mammalian.terran", "veilrunner.character.species.mammalian.terran"],
  ["unique-abilities", "3b7435b9ce6aabc9", "ability", "veilrunner.unique-abilities.cleric.adjudicator.divine-veil", "veilrunner.ability.cleric.adjudicator.divine-veil"],
  ["unique-actions", "0b27e862ef300644", "action", "veilrunner.unique-actions.duelist.assassin.assassinate", "veilrunner.ability.action.duelist.assassin.assassinate"],
  ["unique-reactions", "906fbfcbddab4de6", "action", "veilrunner.unique-reactions.berserker.warrior.last-word", "veilrunner.ability.action.berserker.warrior.last-word"],
  ["unique-traits", "06bcd33d054541ef", "trait", "veilrunner.unique-traits.druid.shapeshifter.commune-with-fauna", "veilrunner.trait.druid.shapeshifter.commune-with-fauna"]
].map(([pack, documentId, type, oldDefinitionId, proposedDefinitionId]) => Object.freeze({ pack, documentId, type, oldDefinitionId, proposedDefinitionId })));

const WORLD_EXPECTATIONS = Object.freeze({
  veilrunner: Object.freeze([
    Object.freeze({ kind: "world-item", documentId: WORLD_CANONICAL_IDENTITY_TARGET.documentId, actorId: "", compendiumSource: null }),
    Object.freeze({ kind: "actor-item", documentId: WORLD_CANONICAL_IDENTITY_TARGET.documentId, actorId: "zZQeMCAkBzeGByCE", compendiumSource: WORLD_CANONICAL_IDENTITY_TARGET.sourceUuid })
  ]),
  "veilrunner-human": Object.freeze([])
});

export class WorldCanonicalIdentityMigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "WorldCanonicalIdentityMigrationError";
    this.details = details;
  }
}

function documentsIn(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (Array.isArray(collection.contents)) return collection.contents;
  if (typeof collection.values === "function") return [...collection.values()];
  return [];
}

function documentIn(collection, id) {
  return collection?.get?.(id) ?? documentsIn(collection).find(document => String(document?.id ?? document?._id) === id) ?? null;
}

function sourceOf(document) {
  if (document?._source && typeof document._source === "object") return document._source;
  if (typeof document?.toObject === "function") return document.toObject();
  return document ?? {};
}

function text(value) {
  return String(value ?? "").trim();
}

function locationKey(kind, actorId, documentId) {
  return `${kind}:${actorId || "world"}:${documentId}`;
}

function markerMatches(source) {
  const alias = source.flags?.Veilrunner?.migrations?.qualityAlias;
  const identity = source.flags?.Veilrunner?.migrations?.canonicalIdentity;
  return alias?.version === QUALITY_ALIAS_MIGRATION_VERSION
    && alias?.sourceType === WORLD_CANONICAL_IDENTITY_TARGET.sourceType
    && identity?.version === CANONICAL_IDENTITY_MIGRATION_VERSION
    && identity?.sourceDefinitionId === WORLD_CANONICAL_IDENTITY_TARGET.oldDefinitionId
    && identity?.targetDefinitionId === WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId
    && Array.isArray(identity?.references)
    && identity.references.length === 0;
}

function updateFor(documentId, source) {
  // Foundry normalizes update payloads in place, including assigning `_id`.
  // Keep this complete payload mutable even though the surrounding plan is immutable.
  const system = structuredClone(source.system);
  system.definitionId = WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId;
  return {
    _id: documentId,
    type: WORLD_CANONICAL_IDENTITY_TARGET.targetType,
    system,
    "flags.Veilrunner.migrations.qualityAlias": {
      version: QUALITY_ALIAS_MIGRATION_VERSION,
      sourceType: WORLD_CANONICAL_IDENTITY_TARGET.sourceType
    },
    "flags.Veilrunner.migrations.canonicalIdentity": {
      version: CANONICAL_IDENTITY_MIGRATION_VERSION,
      sourceDefinitionId: WORLD_CANONICAL_IDENTITY_TARGET.oldDefinitionId,
      targetDefinitionId: WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId,
      references: []
    }
  };
}

/** Wrap complete system data in the Foundry V14 operator required for a Document type change. */
export function prepareWorldCanonicalIdentityFoundryUpdate(update, { replaceSystem } = {}) {
  if (!update?.system || typeof update.system !== "object" || Array.isArray(update.system)) {
    throw new WorldCanonicalIdentityMigrationError("World identity type changes require complete object-valued system data.", { update });
  }
  let replacement = replaceSystem;
  if (!replacement) {
    const ForcedReplacement = globalThis.foundry?.data?.operators?.ForcedReplacement;
    if (typeof ForcedReplacement?.create === "function") replacement = value => ForcedReplacement.create(value);
  }
  if (typeof replacement !== "function") {
    throw new WorldCanonicalIdentityMigrationError("Foundry ForcedReplacement.create is unavailable for the world identity type change.");
  }
  return { ...update, system: replacement(structuredClone(update.system)) };
}

function inspectExpectedDocument(document, expected) {
  if (!document) throw new WorldCanonicalIdentityMigrationError("Inventoried world Item is missing.", expected);
  const source = sourceOf(document);
  const actual = {
    id: text(source._id ?? source.id ?? document.id),
    name: text(source.name ?? document.name),
    type: text(source.type ?? document.type),
    kind: text(source.system?.kind ?? document.system?.kind),
    definitionId: text(source.system?.definitionId ?? document.system?.definitionId),
    compendiumSource: source._stats?.compendiumSource ?? null
  };
  if (actual.id !== expected.documentId || actual.name !== WORLD_CANONICAL_IDENTITY_TARGET.name || actual.kind !== WORLD_CANONICAL_IDENTITY_TARGET.kind) {
    throw new WorldCanonicalIdentityMigrationError("Inventoried world Item identity or quality classification drifted.", { expected, actual });
  }
  if (actual.compendiumSource !== expected.compendiumSource) {
    throw new WorldCanonicalIdentityMigrationError("Inventoried world Item Compendium provenance drifted.", { expected, actual });
  }
  const legacy = actual.type === WORLD_CANONICAL_IDENTITY_TARGET.sourceType
    && actual.definitionId === WORLD_CANONICAL_IDENTITY_TARGET.oldDefinitionId
    && source.flags?.Veilrunner?.migrations?.qualityAlias === undefined
    && source.flags?.Veilrunner?.migrations?.canonicalIdentity === undefined;
  if (legacy) return { state: "legacy", source, update: updateFor(expected.documentId, source) };
  const applied = actual.type === WORLD_CANONICAL_IDENTITY_TARGET.targetType
    && actual.definitionId === WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId
    && markerMatches(source);
  if (applied) return { state: "applied", source, update: null };
  throw new WorldCanonicalIdentityMigrationError("Inventoried world Item is partially migrated or differs from locked source/target state.", { expected, actual });
}

/** Plan exact current-world updates without invoking Foundry APIs. */
export function planWorldCanonicalIdentityMigration({ worldId, worldItems, actors } = {}) {
  const expectations = WORLD_EXPECTATIONS[worldId];
  if (!expectations) return Object.freeze({ complete: false, blocked: "world-not-in-inventory", worldId, expected: 0, applied: 0, updates: Object.freeze([]) });

  const observed = [];
  for (const item of documentsIn(worldItems)) {
    const source = sourceOf(item);
    if ([WORLD_CANONICAL_IDENTITY_TARGET.oldDefinitionId, WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId].includes(text(source.system?.definitionId))) {
      observed.push(locationKey("world-item", "", text(source._id ?? item.id)));
    }
  }
  for (const actor of documentsIn(actors)) {
    for (const item of documentsIn(actor?.items)) {
      const source = sourceOf(item);
      if ([WORLD_CANONICAL_IDENTITY_TARGET.oldDefinitionId, WORLD_CANONICAL_IDENTITY_TARGET.proposedDefinitionId].includes(text(source.system?.definitionId))) {
        observed.push(locationKey("actor-item", text(actor.id ?? actor._id), text(source._id ?? item.id)));
      }
    }
  }
  const expectedKeys = expectations.map(entry => locationKey(entry.kind, entry.actorId, entry.documentId));
  const extras = observed.filter(key => !expectedKeys.includes(key));
  if (extras.length) throw new WorldCanonicalIdentityMigrationError("Unexpected additional world copies use the mapped quality identity.", { worldId, extras });

  const updates = [];
  let applied = 0;
  for (const expected of expectations) {
    const actor = expected.actorId ? documentIn(actors, expected.actorId) : null;
    if (expected.actorId && !actor) throw new WorldCanonicalIdentityMigrationError("Inventoried owner Actor is missing.", expected);
    const document = expected.kind === "world-item"
      ? documentIn(worldItems, expected.documentId)
      : documentIn(actor.items, expected.documentId);
    const inspection = inspectExpectedDocument(document, expected);
    if (inspection.state === "applied") applied += 1;
    else updates.push(Object.freeze({ ...expected, document, actor, update: inspection.update }));
  }
  return Object.freeze({
    complete: updates.length === 0,
    blocked: "",
    worldId,
    expected: expectations.length,
    applied,
    updates: Object.freeze(updates)
  });
}

function packIn(game, packName) {
  const collection = `${game.system.id}.${packName}`;
  return game.packs?.get?.(collection)
    ?? documentsIn(game.packs).find(pack => pack.collection === collection || pack.metadata?.name === packName)
    ?? null;
}

/** Require one fully migrated sentinel from every batch-atomic system pack. */
export async function canonicalIdentitySystemGate(game = globalThis.game) {
  const pending = [];
  for (const sentinel of WORLD_CANONICAL_IDENTITY_SYSTEM_SENTINELS) {
    const pack = packIn(game, sentinel.pack);
    if (!pack) {
      pending.push({ pack: sentinel.pack, reason: "missing-pack" });
      continue;
    }
    const document = await pack.getDocument?.(sentinel.documentId);
    if (!document) {
      pending.push({ pack: sentinel.pack, reason: "missing-document" });
      continue;
    }
    const source = sourceOf(document);
    const definitionId = text(source.system?.definitionId ?? document.system?.definitionId);
    const type = text(source.type ?? document.type);
    const marker = source.flags?.Veilrunner?.migrations?.canonicalIdentity;
    if (definitionId === sentinel.oldDefinitionId && marker === undefined) {
      pending.push({ pack: sentinel.pack, reason: "old-identity" });
      continue;
    }
    if (definitionId !== sentinel.proposedDefinitionId || type !== sentinel.type
      || marker?.version !== CANONICAL_IDENTITY_MIGRATION_VERSION
      || marker?.sourceDefinitionId !== sentinel.oldDefinitionId
      || marker?.targetDefinitionId !== sentinel.proposedDefinitionId) {
      throw new WorldCanonicalIdentityMigrationError("System-pack sentinel is partially migrated or conflicts with the locked map.", {
        sentinel, definitionId, type, marker
      });
    }
  }
  return Object.freeze({ ready: pending.length === 0, pending: Object.freeze(pending) });
}

/** Run the exact world updates through Foundry document APIs and persist state only after revalidation. */
export async function migrateWorldCanonicalIdentities({ game = globalThis.game, now = () => Date.now(), replaceSystem } = {}) {
  if (!game?.user?.isGM) return { complete: false, skipped: "gm-only" };
  const worldId = game.world?.id ?? "";
  const setting = game.settings.get(game.system.id, WORLD_CANONICAL_IDENTITY_SETTING) ?? {};
  if (setting.version === WORLD_CANONICAL_IDENTITY_MIGRATION_VERSION && setting.status === "complete") {
    const expected = WORLD_EXPECTATIONS[worldId]?.length;
    if (setting.mapSha256 !== WORLD_CANONICAL_IDENTITY_MAP_SHA256 || setting.worldId !== worldId || setting.expected !== expected) {
      throw new WorldCanonicalIdentityMigrationError("Completed world migration setting conflicts with the current world or locked map.", { setting, worldId, expected });
    }
    return { complete: true, alreadyComplete: true, worldId };
  }

  const gate = await canonicalIdentitySystemGate(game);
  if (!gate.ready) return { complete: false, blocked: "system-pack-pending", pending: gate.pending };
  let plan = planWorldCanonicalIdentityMigration({ worldId, worldItems: game.items, actors: game.actors });
  if (plan.blocked) return plan;
  const updated = { worldItems: 0, actorItems: 0 };
  for (const entry of plan.updates) {
    const update = prepareWorldCanonicalIdentityFoundryUpdate(entry.update, { replaceSystem });
    if (entry.kind === "world-item") {
      await entry.document.update(update);
      updated.worldItems += 1;
    } else {
      await entry.actor.updateEmbeddedDocuments("Item", [update]);
      updated.actorItems += 1;
    }
  }
  plan = planWorldCanonicalIdentityMigration({ worldId, worldItems: game.items, actors: game.actors });
  if (!plan.complete) throw new WorldCanonicalIdentityMigrationError("World documents did not reach complete canonical identity state after Foundry API updates.", { plan });
  const completed = {
    version: WORLD_CANONICAL_IDENTITY_MIGRATION_VERSION,
    status: "complete",
    mapSha256: WORLD_CANONICAL_IDENTITY_MAP_SHA256,
    worldId,
    expected: plan.expected,
    completedAt: now()
  };
  await game.settings.set(game.system.id, WORLD_CANONICAL_IDENTITY_SETTING, completed);
  return { complete: true, alreadyComplete: false, worldId, updated, setting: completed };
}
