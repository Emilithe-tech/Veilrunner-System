import { CanonicalDefinitionReader } from "../../data/definitions/canonical-reader.mjs";

export const LANGUAGE_CATALOG_PACK = "Veilrunner.languages";

const text = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function normalizeLanguageRecord(document = {}) {
  if (document.type !== "language") return null;
  const system = document.system ?? document._source?.system ?? {};
  const definitionId = String(system.definitionId ?? "").trim();
  const name = String(document.name ?? "").trim();
  if (!definitionId || !name) return null;
  const record = {
    id: definitionId,
    definitionId,
    sourceUuid: String(document.uuid ?? `Compendium.${document.pack ?? ""}.${document._id ?? document.id ?? ""}`),
    name,
    img: String(document.img ?? "icons/svg/book.svg"),
    description: text(system.description)
  };
  record.searchText = `${record.name} ${record.description}`.toLowerCase();
  return record;
}

export function queryLanguageCatalog(records = [], search = "") {
  const needle = String(search ?? "").trim().toLowerCase();
  return records.filter(record => !needle || record.searchText.includes(needle))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export class LanguageCatalogProvider {
  constructor() {
    this.packId = LANGUAGE_CATALOG_PACK;
    this.cache = null;
    this.revision = 0;
  }

  async records() {
    if (this.cache) return this.cache;
    const revision = this.revision;
    const reader = new CanonicalDefinitionReader(["language"], { capability: "chargenSelectable" });
    const documents = await reader.documents();
    if (revision !== this.revision) return this.records();
    this.cache = documents.map(normalizeLanguageRecord).filter(Boolean);
    return this.cache;
  }

  invalidate() { this.revision += 1; this.cache = null; }
}

export function registerLanguageCatalogInvalidation(provider, onInvalidate = null) {
  if (!globalThis.Hooks?.on) return () => {};
  const registrations = ["createItem", "updateItem", "deleteItem"].map(hook => [hook, Hooks.on(hook, item => {
    if (item?.pack !== provider.packId) return;
    provider.invalidate();
    onInvalidate?.();
  })]);
  return () => registrations.forEach(([hook, id]) => Hooks.off(hook, id));
}
