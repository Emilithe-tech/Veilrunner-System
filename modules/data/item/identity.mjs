/** Portable Veilrunner item-definition identity and capability helpers. */
const { ArrayField, StringField } = foundry.data.fields;

export const DEFINITION_ID_PATTERN = /^veilrunner\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;

export const ITEM_INTENTS = Object.freeze([
  "equippable", "weapon", "ammunition", "armor", "consumable", "container",
  "action-provider", "reaction-provider", "chargen-selectable", "market-sellable"
]);

const INTENT_SET = new Set(ITEM_INTENTS);
const ACTION_PROVIDERS = new Map();

export function normalizeDefinitionId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isDefinitionId(value) {
  return DEFINITION_ID_PATTERN.test(normalizeDefinitionId(value));
}

export function normalizeItemIntents(values) {
  const entries = Array.isArray(values) ? values : values && typeof values === "object"
    ? Object.values(values) : String(values ?? "").split(/[\n,]/);
  return [...new Set(entries.map(value => String(value ?? "").trim().toLowerCase()).filter(intent => INTENT_SET.has(intent)))];
}

/** Defaults apply only to newly-authored or explicitly migrated definitions. */
export function defaultIntentsForItem(type, system = {}) {
  const defaults = new Set();
  if (["weapon", "armor", "accessory", "shield"].includes(type)) defaults.add("equippable");
  if (["weapon", "ammunition", "magazine", "armor", "accessory", "shield", "consumable", "container", "equipment", "treasure"].includes(type)) defaults.add("market-sellable");
  if (type === "weapon") {
    defaults.add("weapon");
    defaults.add("action-provider");
  }
  if (type === "ammunition") defaults.add("ammunition");
  if (type === "armor" || type === "shield") defaults.add("armor");
  if (type === "consumable") defaults.add("consumable");
  if (type === "container") defaults.add("container");
  if (["action", "ability", "spell", "skill"].includes(type)) defaults.add("action-provider");
  if (["action", "spell", "skill"].includes(type) && (system.actionType === "reaction" || system.category === "reactions")) defaults.add("reaction-provider");
  if (["species", "origin", "background", "archetype", "profession", "discipline", "quality", "perk", "flaw"].includes(type)) defaults.add("chargen-selectable");
  return [...defaults];
}

function officialDefinitionId(item) {
  const domain = String(item?.type ?? "item").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const slug = String(item?.name ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `veilrunner.${domain}.${slug}` : "";
}

export function itemIdentityFields() {
  return {
    definitionId: new StringField({ required: true, blank: true, initial: "" }),
    intents: new ArrayField(new StringField({
      required: true, blank: false, choices: Object.fromEntries(ITEM_INTENTS.map(intent => [intent, intent]))
    }), { initial: [] }),
    providedActionIds: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] })
  };
}

export function migrateItemIdentityData(source) {
  if (!source || typeof source !== "object") return source;
  if (source.definitionId !== undefined) source.definitionId = normalizeDefinitionId(source.definitionId);
  if (source.intents !== undefined) source.intents = normalizeItemIntents(source.intents);
  if (source.providedActionIds !== undefined) {
    source.providedActionIds = (Array.isArray(source.providedActionIds) ? source.providedActionIds : Object.values(source.providedActionIds ?? {}))
      .map(normalizeDefinitionId).filter(isDefinitionId);
  }
  return source;
}

export function getDefinitionId(item) {
  const definitionId = normalizeDefinitionId(item?.system?.definitionId);
  return isDefinitionId(definitionId) ? definitionId : "";
}

export function hasItemIntent(item, intent) {
  return normalizeItemIntents(item?.system?.intents).includes(intent);
}

export function itemsWithIntent(items, intent) {
  const entries = Array.isArray(items?.contents) ? items.contents : Array.from(items ?? []);
  return entries.filter(item => hasItemIntent(item, intent));
}

function documentsIn(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  return Array.from(collection ?? []);
}

/** Resolve a portable definition, preferring the Actor-owned instance when requested. */
export async function resolveDefinition(definitionId, { actor = null, preferActor = true, includeWorld = true, includePacks = true } = {}) {
  const id = normalizeDefinitionId(definitionId);
  if (!isDefinitionId(id)) return null;
  const actorItems = documentsIn(actor?.items);
  const worldItems = includeWorld ? documentsIn(globalThis.game?.items) : [];
  const candidates = preferActor ? [...actorItems, ...worldItems] : [...worldItems, ...actorItems];
  const direct = candidates.find(item => getDefinitionId(item) === id);
  if (direct) return direct;
  if (!includePacks) return null;
  for (const pack of documentsIn(globalThis.game?.packs)) {
    if (pack.documentName !== "Item" || pack.metadata?.system !== globalThis.game?.system?.id) continue;
    const index = pack.index ?? await pack.getIndex?.({ fields: ["system.definitionId"] });
    const entry = documentsIn(index).find(document => normalizeDefinitionId(document.system?.definitionId) === id);
    if (entry) return pack.getDocument(entry._id ?? entry.id);
  }
  return null;
}

export function registerActorActionProvider(key, provider) {
  if (typeof provider !== "function") throw new TypeError("Actor action provider must be a function.");
  ACTION_PROVIDERS.set(String(key), provider);
}

/** Return synthetic actions contributed by Item capabilities, independent of UI. */
export function resolveActorActions(actor) {
  return [...ACTION_PROVIDERS.values()].flatMap(provider => provider(actor) ?? []);
}

/** Duplicate IDs are invalid in definition libraries but expected on actor-owned copies. */
export function auditDefinitionIds(documents, { includeEmbedded = false } = {}) {
  const groups = new Map();
  const unassigned = [];
  for (const document of documentsIn(documents)) {
    if (!includeEmbedded && document.parent?.documentName === "Actor") continue;
    const id = getDefinitionId(document);
    if (!id) { unassigned.push(document); continue; }
    const entries = groups.get(id) ?? [];
    entries.push(document);
    groups.set(id, entries);
  }
  return {
    duplicates: [...groups.entries()].filter(([, entries]) => entries.length > 1).map(([definitionId, entries]) => ({ definitionId, entries })),
    unassigned
  };
}

/** One-time, GM-only backfill for unambiguous bundled Veilrunner compendium definitions. */
export async function migrateOfficialCompendiumDefinitions() {
  if (!globalThis.game?.user?.isGM) return { migrated: 0, conflicts: [] };
  const systemId = globalThis.game.system.id;
  const packs = documentsIn(globalThis.game.packs).filter(pack => pack.documentName === "Item" && (
    pack.metadata?.packageName === systemId || pack.collection?.startsWith(`${systemId}.`)
  ));
  let migrated = 0;
  const conflicts = [];
  for (const pack of packs) {
    const documents = await pack.getDocuments();
    const updates = [];
    const planned = new Map();
    for (const item of documents.filter(item => !getDefinitionId(item))) {
      const definitionId = officialDefinitionId(item);
      if (!definitionId) continue;
      const entries = planned.get(definitionId) ?? [];
      entries.push(item);
      planned.set(definitionId, entries);
    }
    for (const [definitionId, items] of planned) {
      if (items.length !== 1 || documents.some(item => getDefinitionId(item) === definitionId)) {
        conflicts.push({ pack: pack.collection, definitionId, items });
        continue;
      }
      const item = items[0];
      const sourceId = item?._source?._id ?? item?.toObject?.()?._id ?? item?._id ?? item?.id;
      if (!sourceId) {
        conflicts.push({ pack: pack.collection, definitionId, items, reason: "missing-document-id" });
        continue;
      }
      updates.push({
        _id: sourceId,
        "system.definitionId": definitionId,
        "system.intents": defaultIntentsForItem(item.type, item.system)
      });
    }
    if (updates.length) {
      const DocumentClass = pack.documentClass ?? globalThis.Item;
      if (typeof DocumentClass?.updateDocuments !== "function") {
        throw new Error(`Compendium ${pack.collection} does not expose an Item batch update API.`);
      }
      await DocumentClass.updateDocuments(updates, { pack: pack.collection });
      migrated += updates.length;
    }
  }
  if (conflicts.length) console.warn("Veilrunner | Item identity migration left ambiguous official definitions unchanged.", conflicts);
  return { migrated, conflicts };
}
