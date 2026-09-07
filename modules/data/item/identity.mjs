/** Portable Veilrunner item-definition identity and capability helpers. */
import { canonicalDefinitionFields } from "../definitions/semantic-fields.mjs";
const { ArrayField, StringField } = foundry.data.fields;

export const DEFINITION_ID_PATTERN = /^veilrunner\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;

export function normalizeDefinitionId(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isDefinitionId(value) {
  return DEFINITION_ID_PATTERN.test(normalizeDefinitionId(value));
}

export function itemIdentityFields() {
  return {
    ...canonicalDefinitionFields(),
    providedActionIds: new ArrayField(new StringField({ required: true, blank: false }), { initial: () => [] })
  };
}

export function migrateItemIdentityData(source) {
  if (!source || typeof source !== "object") return source;
  if (source.definitionId !== undefined) source.definitionId = normalizeDefinitionId(source.definitionId);
  delete source.intents;
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

function documentsIn(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  return Array.from(collection ?? []);
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
