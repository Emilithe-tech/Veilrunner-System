import { canonicalIdBuilder } from "./canonical-id.mjs";
import { CompendiumRouter } from "./compendium-router.mjs";

export const DEFINITION_INDEX_FIELDS = Object.freeze([
  "name",
  "type",
  "img",
  "system.definitionId",
  "system.timing.type",
  "system.classification.kind",
  "system.classification.category",
  "system.classification.school",
  "system.classification.practice",
  "system.classification.pillar",
  "system.kind",
  "system.category",
  "system.practice",
  "system.summary",
  "system.tags"
]);

function documentsIn(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  return Array.from(collection?.values?.() ?? collection ?? []);
}

function systemPack(pack, systemId) {
  if (pack?.documentName !== "Item") return false;
  const owner = pack?.metadata?.packageName ?? pack?.metadata?.system;
  if (owner) return String(owner).toLowerCase() === String(systemId).toLowerCase();
  return String(pack?.collection ?? "").toLowerCase().startsWith(`${String(systemId).toLowerCase()}.`);
}

function indexedDefinitionId(entry) {
  return String(entry?.system?.definitionId ?? entry?.["system.definitionId"] ?? "").trim();
}

function packCollection(pack) {
  return String(pack?.collection ?? pack?.metadata?.id ?? "");
}

function packName(pack) {
  return String(pack?.metadata?.name ?? packCollection(pack)).split(".").at(-1);
}

function recordFor(entry, pack) {
  const definitionId = indexedDefinitionId(entry);
  const tags = Array.isArray(entry?.system?.tags) ? entry.system.tags : [];
  const classification = entry?.system?.classification ?? {};
  const kind = String(classification.kind || entry?.system?.kind || "");
  const category = String(classification.category || entry?.system?.category || "");
  const school = String(classification.school || entry?.system?.school || "");
  const practice = String(classification.practice || entry?.system?.practice || "");
  const pillar = String(classification.pillar || entry?.system?.pillar || "");
  return Object.freeze({
    definitionId,
    documentId: String(entry?._id ?? entry?.id ?? ""),
    uuid: String(entry?.uuid ?? ""),
    name: String(entry?.name ?? ""),
    type: String(entry?.type ?? ""),
    timing: String(entry?.system?.timing?.type ?? entry?.["system.timing.type"] ?? ""),
    img: String(entry?.img ?? ""),
    kind,
    category,
    school,
    practice,
    pillar,
    summary: String(entry?.system?.summary ?? ""),
    tags: Object.freeze([...tags]),
    packCollection: packCollection(pack),
    packName: packName(pack),
    searchText: [entry?.name, entry?.type, kind, category, school, practice, pillar, ...tags]
      .map(value => String(value ?? "").toLowerCase()).join(" ")
  });
}

export class DefinitionIndexError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DefinitionIndexError";
    this.code = code;
    this.details = details;
  }
}

/** Lazy semantic index over canonical system Item compendia. */
export class DefinitionIndex {
  constructor({ game = globalThis.game, systemId = game?.system?.id ?? "Veilrunner", router = null } = {}) {
    this.game = game;
    this.systemId = systemId;
    this.router = router ?? new CompendiumRouter({ systemId, packs: documentsIn(game?.packs) });
    this.invalidate();
  }

  #packs() {
    return documentsIn(this.game?.packs)
      .filter(pack => systemPack(pack, this.systemId))
      .filter(pack => !this.router || this.router.isCanonicalPack(pack))
      .sort((left, right) => packCollection(left).localeCompare(packCollection(right)));
  }

  invalidate(pack = null) {
    this.dirty = true;
    this.invalidatedPacks ??= new Set();
    if (pack) this.invalidatedPacks.add(typeof pack === "string" ? pack : packCollection(pack));
    else this.invalidatedPacks.clear();
    this.documentCache = new Map();
  }

  async rebuild() {
    const byId = new Map();
    const invalid = [];
    const unassigned = [];
    const packs = this.#packs();

    for (const pack of packs) {
      const entries = documentsIn(await pack.getIndex({ fields: [...DEFINITION_INDEX_FIELDS] }));
      for (const entry of entries) {
        const definitionId = indexedDefinitionId(entry);
        if (!definitionId) {
          unassigned.push(Object.freeze({ documentId: String(entry?._id ?? entry?.id ?? ""), name: String(entry?.name ?? ""), type: String(entry?.type ?? ""), packCollection: packCollection(pack) }));
          continue;
        }
        if (!canonicalIdBuilder.isValid(definitionId)) {
          invalid.push(Object.freeze({ definitionId, documentId: String(entry?._id ?? entry?.id ?? ""), name: String(entry?.name ?? ""), type: String(entry?.type ?? ""), packCollection: packCollection(pack) }));
          continue;
        }
        const records = byId.get(definitionId) ?? [];
        records.push(recordFor(entry, pack));
        byId.set(definitionId, records);
      }
    }

    this.byId = byId;
    this.packByCollection = new Map(packs.map(pack => [packCollection(pack), pack]));
    this.invalid = Object.freeze(invalid);
    this.unassigned = Object.freeze(unassigned);
    this.duplicates = Object.freeze([...byId.entries()]
      .filter(([, records]) => records.length > 1)
      .map(([definitionId, records]) => Object.freeze({ definitionId, records: Object.freeze([...records]) })));
    this.dirty = false;
    this.invalidatedPacks.clear();
    return this.audit();
  }

  async ensure() {
    if (this.dirty) await this.rebuild();
    return this;
  }

  audit() {
    return Object.freeze({
      definitions: this.byId?.size ?? 0,
      duplicates: this.duplicates ?? Object.freeze([]),
      invalid: this.invalid ?? Object.freeze([]),
      unassigned: this.unassigned ?? Object.freeze([])
    });
  }

  async records() {
    await this.ensure();
    return Object.freeze([...this.byId.values()].flat());
  }

  async metadata(definitionId) {
    await this.ensure();
    const records = this.byId.get(String(definitionId ?? "")) ?? [];
    if (records.length > 1) {
      throw new DefinitionIndexError("duplicate-definition-id", `Canonical definition ID is duplicated: ${definitionId}`, { definitionId, records });
    }
    return records[0] ?? null;
  }

  async resolve(definitionId) {
    const cached = this.documentCache.get(definitionId);
    if (cached) return cached;
    const record = await this.metadata(definitionId);
    if (!record) return null;
    const pack = this.packByCollection.get(record.packCollection);
    if (!pack) throw new DefinitionIndexError("missing-pack", `Canonical pack is unavailable: ${record.packCollection}`, { record });
    const document = await pack.getDocument(record.documentId);
    if (!document) throw new DefinitionIndexError("missing-document", `Canonical document is unavailable: ${definitionId}`, { record });
    this.documentCache.set(definitionId, document);
    return document;
  }

  async search({ text = "", types = [], limit = 100 } = {}) {
    const query = String(text).trim().toLowerCase();
    const selectedTypes = new Set(Array.from(types ?? [], type => String(type)));
    return (await this.records())
      .filter(record => !selectedTypes.size || selectedTypes.has(record.type))
      .filter(record => !query || record.searchText.includes(query))
      .sort((left, right) => left.name.localeCompare(right.name) || left.definitionId.localeCompare(right.definitionId))
      .slice(0, Math.max(0, Number(limit) || 0));
  }

  async auditReferences(definitionIds = []) {
    await this.ensure();
    const requested = [...new Set(Array.from(definitionIds ?? [], value => String(value ?? "").trim()).filter(Boolean))];
    return Object.freeze({
      missing: Object.freeze(requested.filter(definitionId => !this.byId.has(definitionId))),
      duplicated: Object.freeze(requested.filter(definitionId => (this.byId.get(definitionId)?.length ?? 0) > 1)),
      invalid: Object.freeze(requested.filter(definitionId => !canonicalIdBuilder.isValid(definitionId)))
    });
  }
}
