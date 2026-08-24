import { QUALITY_PILLARS, QUALITY_TIERS, evaluateQualitySelection, qualitySelectionId, tierCost } from "./quality-rules.mjs";

export const QUALITY_CATALOG_PACK = "Veilrunner.qualities-perks";
const text = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const list = value => Array.isArray(value) ? value.map(entry => String(entry ?? "").trim()).filter(Boolean) : [];

export function normalizeQualityRecord(document = {}) {
  const system = document.system ?? document._source?.system ?? {};
  const definitionId = String(system.definitionId ?? "").trim();
  const name = String(document.name ?? "").trim();
  const kind = ["perk", "flaw"].includes(document.type) ? document.type : system.kind;
  if (!definitionId || !name || !["perk", "flaw"].includes(kind) || !QUALITY_TIERS.includes(system.tier) || !QUALITY_PILLARS.includes(system.pillar)) return null;
  const requirements = {
    text: text(system.requirements?.text),
    minimumLevel: Math.max(0, Math.trunc(Number(system.requirements?.minimumLevel) || 0)),
    requiredDefinitionIds: list(system.requirements?.requiredDefinitionIds),
    requiredTags: list(system.requirements?.requiredTags)
  };
  const record = {
    id: definitionId,
    definitionId,
    sourceUuid: String(document.uuid ?? `Compendium.${document.pack ?? ""}.${document._id ?? document.id ?? ""}`),
    name,
    img: String(document.img ?? "icons/svg/book.svg"),
    kind,
    tier: system.tier,
    points: tierCost(system.tier),
    pillar: system.pillar,
    summary: text(system.summary),
    description: text(system.description),
    mechanics: text(system.mechanics),
    requirements,
    requirementsText: requirements.text,
    tags: list(system.tags),
    recommendationTags: list(system.recommendationTags),
    effects: Array.from(document.effects ?? []).map(effect => String(effect?.name ?? effect?.label ?? "")).filter(Boolean)
  };
  record.searchText = [record.name, record.summary, record.description, record.mechanics, record.requirementsText, ...record.tags].join(" ").toLowerCase();
  return record;
}

export function qualityCatalogFacets(records = []) {
  return {
    tags: [...new Set(records.flatMap(record => record.tags ?? []))].sort((a, b) => a.localeCompare(b)),
    pillars: QUALITY_PILLARS,
    tiers: QUALITY_TIERS
  };
}

export function qualityBuildTags(build = {}) {
  return [...new Set([
    build.species, build.origin, build.background, build.archetype, build.profession, build.discipline,
    ...(Array.isArray(build.tags) ? build.tags : [])
  ].map(value => String(value ?? "").trim().toLowerCase()).filter(Boolean))];
}

export function queryQualityCatalog(records = [], query = {}, build = {}) {
  const needle = String(query.search ?? "").trim().toLowerCase();
  const selectedIds = new Set([...(build.qualitiesTaken ?? []), ...(build.flawsTaken ?? [])].map(qualitySelectionId).filter(Boolean));
  let output = records.filter(record => {
    if (query.mode === "selected" && !record.selected && !selectedIds.has(record.definitionId)) return false;
    if (query.type && query.type !== "all" && record.kind !== query.type) return false;
    if (query.pillar && query.pillar !== "all" && record.pillar !== query.pillar) return false;
    if (query.tier && query.tier !== "all" && record.tier !== query.tier) return false;
    if (query.tag && query.tag !== "all" && !(record.tags ?? []).includes(query.tag)) return false;
    if (needle && !record.searchText.includes(needle)) return false;
    if (query.availableOnly && !evaluateQualitySelection(record, build).canSelect && !selectedIds.has(record.definitionId)) return false;
    return true;
  });
  if (query.mode === "recommended") {
    const buildTags = new Set(qualityBuildTags(build));
    output = output.map(record => ({
      record,
      score: (record.recommendationTags ?? []).reduce((score, tag) => score + (buildTags.has(String(tag).toLowerCase()) ? 1 : 0), 0)
    })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || a.record.name.localeCompare(b.record.name)).slice(0, 24).map(entry => entry.record);
  } else output.sort((a, b) => a.name.localeCompare(b.name));
  return output;
}

export class QualityCatalogProvider {
  constructor(packId = QUALITY_CATALOG_PACK) { this.packId = packId; this.cache = null; }
  async records() {
    if (this.cache) return this.cache;
    const pack = globalThis.game?.packs?.get?.(this.packId);
    if (!pack) return (this.cache = []);
    const documents = await pack.getDocuments();
    this.cache = documents.map(normalizeQualityRecord).filter(Boolean);
    return this.cache;
  }
  invalidate() { this.cache = null; }
}

export function registerQualityCatalogInvalidation(provider, onInvalidate = null) {
  if (!globalThis.Hooks?.on) return () => {};
  const registrations = ["createItem", "updateItem", "deleteItem"].map(hook => [hook, Hooks.on(hook, item => {
    if (item?.pack !== provider.packId) return;
    provider.invalidate();
    onInvalidate?.();
  })]);
  return () => registrations.forEach(([hook, id]) => Hooks.off(hook, id));
}
