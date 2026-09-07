import { getDefinitionId, normalizeDefinitionId } from "../../../data/item/identity.mjs";
import { itemHasCapability, itemTypesWithCapability } from "../../../data/definitions/item-capabilities.mjs";
import { CompendiumRouter } from "../../../data/definitions/compendium-router.mjs";
import { DefinitionIndex } from "../../../data/definitions/definition-index.mjs";
import { WEAPON_TYPE_GROUPS, itemRarityData, normalizeWeaponType } from "../../../data/item/physical.mjs";

const entriesOf = context => Array.isArray(context) ? context : context?.entries ?? [];
const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection?.values?.() ?? collection ?? []);
const normalizeFolderToken = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");

function folderById(pack, id) {
  if (!id) return null;
  return pack?.folders?.get?.(id) ?? documentsIn(pack?.folders).find(folder => (folder.id ?? folder._id) === id) ?? null;
}

function parentFolder(folder, pack) {
  const parent = folder?.folder ?? folder?.parent;
  return typeof parent === "string" ? folderById(pack, parent) : parent ?? null;
}

/** Read Weapons / family / subtype from the Items compendium folder ancestry. */
export function compendiumWeaponClassification(item, pack = null) {
  const folders = [];
  const seen = new Set();
  const assignedFolder = item?.folder ?? item?._source?.folder;
  let folder = typeof assignedFolder === "string" ? folderById(pack, assignedFolder) : assignedFolder;
  while (folder && !seen.has(folder.id ?? folder._id ?? folder)) {
    seen.add(folder.id ?? folder._id ?? folder);
    folders.push(folder);
    folder = parentFolder(folder, pack);
  }
  const rootIndex = folders.findIndex(entry => normalizeFolderToken(entry.name) === "weapons");
  if (rootIndex < 2) return null;
  const type = normalizeWeaponType(folders[rootIndex - 2]?.name);
  const group = WEAPON_TYPE_GROUPS.find(entry => entry.types.includes(type));
  if (!group || normalizeFolderToken(folders[rootIndex - 1]?.name) !== normalizeFolderToken(group.key)) return null;
  return { group: group.key, type };
}

export class StorefrontCatalogError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "StorefrontCatalogError";
    this.code = code;
  }
}

export class CatalogProvider {
  #compendiumEntries = null;
  #compendiumDocuments = new Map();
  #compendiumLoading = null;
  #revision = 0;
  constructor(context, { game = globalThis.game } = {}) {
    this.context = context ?? { id: "veilrunner.store", entries: [] };
    this.game = game;
  }
  get id() { return this.context.id; }
  entries() {
    // Store configuration controls offers, never the mechanical definition source.
    const configured = entriesOf(this.context).filter(entry => entry?.definitionId && !entry.source).map(entry => ({
      definitionId: normalizeDefinitionId(entry.definitionId), price: entry.price, currency: entry.currency,
      availability: entry.availability ?? "available", stock: entry.stock, options: entry.options,
      storeCategory: entry.storeCategory
    }));
    const entries = new Map((this.#compendiumEntries ?? []).map(entry => [entry.definitionId, entry]));
    for (const entry of configured) entries.set(entry.definitionId, { ...entries.get(entry.definitionId),
      ...Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined)) });
    return [...entries.values()];
  }
  invalidate() {
    this.#revision += 1;
    this.#compendiumEntries = null;
    this.#compendiumDocuments.clear();
    this.#compendiumLoading = null;
  }
  async catalogEntries() {
    if (this.#compendiumEntries) return this.entries();
    if (this.#compendiumLoading) return this.#compendiumLoading;
    const revision = this.#revision;
    const loading = (async () => {
      const discovered = [];
      const compendiumDocuments = new Map();
      const systemId = this.game?.system?.id ?? "Veilrunner";
      const packs = documentsIn(this.game?.packs);
      const router = new CompendiumRouter({ systemId, packs });
      const collections = new Set(itemTypesWithCapability("marketSellable").map(type => router.route(type, { strict: true }).collection));
      const canonicalPacks = [...collections].map(collection => {
        const pack = packs.find(pack => pack.collection === collection);
        if (!pack || pack.documentName !== "Item" || (pack.metadata?.packageName ?? pack.metadata?.system) !== systemId) {
          throw new StorefrontCatalogError("pack-identity-mismatch", `Canonical market pack ${collection} is unavailable or has an unexpected identity.`);
        }
        if (pack.visible === false || pack.testUserPermission?.(this.game?.user, "OBSERVER") === false) {
          throw new StorefrontCatalogError("pack-unreadable", `Canonical market pack ${collection} is not readable.`);
        }
        return pack;
      });
      const definitions = new DefinitionIndex({ game: { system: this.game?.system, packs: canonicalPacks }, systemId, router });
      const records = await definitions.records();
      const audit = definitions.audit();
      if (audit.invalid.length || audit.unassigned.length || audit.duplicates.length) {
        throw new StorefrontCatalogError("invalid-canonical-identities", "Canonical market definitions contain missing, invalid, or duplicate identities.");
      }
      for (const record of records) {
        if (!itemHasCapability(record.type, "marketSellable")) continue;
        if (router.route(record.type, { strict: true }).collection !== record.packCollection) {
          throw new StorefrontCatalogError("definition-route-mismatch", `Market definition ${record.definitionId} is in the wrong canonical pack.`);
        }
        const item = await definitions.resolve(record.definitionId);
        if (getDefinitionId(item) !== record.definitionId || item?.type !== record.type || (item?.id ?? item?._id) !== record.documentId
          || item?.uuid !== `Compendium.${record.packCollection}.Item.${record.documentId}`) {
          throw new StorefrontCatalogError("definition-identity-mismatch", `Market definition ${record.definitionId} no longer matches its index.`);
        }
        const pack = canonicalPacks.find(pack => pack.collection === record.packCollection);
        const classification = item.type === "weapon" ? compendiumWeaponClassification(item, pack) : null;
        discovered.push({ definitionId: record.definitionId, price: item.system?.price, currency: item.system?.currency,
          availability: "available", weaponGroup: classification?.group ?? "",
          weaponType: normalizeWeaponType(item.system?.weaponType) || classification?.type || "" });
        compendiumDocuments.set(record.definitionId, { document: item, record });
      }
      return { discovered, compendiumDocuments };
    })().then(result => {
      if (revision !== this.#revision) {
        if (this.#compendiumLoading === loading) this.#compendiumLoading = null;
        return this.catalogEntries();
      }
      // Commit a complete discovery snapshot. Invalidation can no longer expose
      // a half-populated document map to CatalogIndex.resolve().
      this.#compendiumDocuments = result.compendiumDocuments;
      this.#compendiumEntries = result.discovered;
      return this.entries();
    }).finally(() => {
      if (this.#compendiumLoading === loading) this.#compendiumLoading = null;
    });
    this.#compendiumLoading = loading;
    return loading;
  }
  entry(definitionId) { return this.entries().find(entry => normalizeDefinitionId(entry.definitionId) === normalizeDefinitionId(definitionId)) ?? null; }
  async resolve(definitionId) {
    await this.catalogEntries();
    const id = normalizeDefinitionId(definitionId);
    const cached = this.#compendiumDocuments.get(id);
    if (!cached) return null;
    const { document, record } = cached;
    if (getDefinitionId(document) !== id || document.type !== record.type || (document.id ?? document._id) !== record.documentId
      || document.uuid !== `Compendium.${record.packCollection}.Item.${record.documentId}` || !itemHasCapability(document, "marketSellable")) {
      throw new StorefrontCatalogError("definition-identity-mismatch", `Market definition ${id} has changed. Refresh the catalog.`);
    }
    return document;
  }
}

const STORE_CATEGORIES = new Set(["weapons", "armor", "tech", "gear", "consumables"]);

export function storeCategoryFor(item, entry = {}) {
  const override = String(entry.storeCategory ?? item.system?.storeCategory ?? "").trim().toLowerCase();
  if (STORE_CATEGORIES.has(override)) return override;
  if (item.type === "weapon") return "weapons";
  if (["armor", "shield"].includes(item.type)) return "armor";
  if (item.type === "consumable") return "consumables";
  if (String(item.system?.category ?? "").trim().toLowerCase() === "tech") return "tech";
  return "gear";
}

function descriptionText(value) {
  return String(value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function searchable(item, grade, entry = {}) {
  return [item.name, item.type, entry.weaponGroup, entry.weaponType, item.system?.weaponType, item.system?.weaponKind, item.system?.rarity,
    grade, item.system?.manufacturer, item.system?.caliber, item.system?.ammoType, ...(item.system?.traits ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
}

export function catalogRecord(item, entry) {
  const system = item.system ?? {};
  const rarity = itemRarityData(item);
  const grade = Math.max(1, Math.floor(Number(system.grade) || 1));
  const storeCategory = storeCategoryFor(item, entry);
  const subtype = entry.weaponType || normalizeWeaponType(system.weaponType) || system.ammoType || system.category || item.type || "";
  const fireModes = Array.isArray(system.fireModes) ? system.fireModes : String(system.fireModes ?? "").split(/[,\n]/).map(value => value.trim()).filter(Boolean);
  return Object.freeze({
    definitionId: normalizeDefinitionId(entry.definitionId) || getDefinitionId(item), name: item.name, img: item.img, type: item.type,
    category: item.type, storeCategory, subcategory: subtype, subtype,
    weaponType: entry.weaponType || normalizeWeaponType(system.weaponType) || "", weaponGroup: entry.weaponGroup || "", weaponKind: system.weaponKind || "",
    rarity: rarity.slug, rarityName: rarity.name, rarityColor: rarity.color, rarityTier: rarity.tier,
    grade, manufacturer: system.manufacturer || "",
    price: Math.max(0, Number(entry.price ?? system.price) || 0), currency: entry.currency || system.currency || "credits",
    weight: Math.max(0, Number(system.weight) || 0), damage: system.damage?.base || "", range: Math.max(0, Number(system.range) || 0),
    magazine: Math.max(0, Number(system.firearm?.capacity ?? system.capacity) || 0), fireModes, reload: system.reload || "",
    actions: system.actions ?? "", description: descriptionText(system.description?.value ?? system.description),
    buildCompatibility: Array.isArray(system.buildCompatibility) ? system.buildCompatibility : [],
    traits: Array.isArray(system.traits) ? system.traits : [], caliber: system.caliber || system.firearm?.compatibility?.caliber || "",
    ammoType: system.ammoType || "", availability: entry.availability ?? "available",
    stock: entry.stock ?? null, options: entry.options ?? {}, search: searchable(item, grade, entry)
  });
}

/** Cached compact records; full Item documents are resolved only for Details/commit. */
export class CatalogIndex {
  #provider; #records = null; #loading = null; #revision = 0;
  constructor(provider) { this.#provider = provider; }
  invalidate() {
    this.#revision += 1;
    this.#records = null;
    this.#loading = null;
    this.#provider.invalidate?.();
  }
  async records() {
    if (this.#records) return this.#records;
    if (this.#loading) return this.#loading;
    const revision = this.#revision;
    const loading = this.#provider.catalogEntries().then(entries => Promise.all(entries.map(async entry => {
      const item = await this.#provider.resolve(entry.definitionId);
      return item && getDefinitionId(item) === normalizeDefinitionId(entry.definitionId) && itemHasCapability(item, "marketSellable")
        ? catalogRecord(item, entry) : null;
    }))).then(records => {
      if (revision !== this.#revision) {
        if (this.#loading === loading) this.#loading = null;
        return this.records();
      }
      this.#records = records.filter(Boolean);
      if (this.#loading === loading) this.#loading = null;
      return this.#records;
    }).catch(error => {
      if (this.#loading === loading) this.#loading = null;
      throw error;
    });
    this.#loading = loading;
    return loading;
  }
}

/** Attach only once; compendium updates make normalized store records stale. */
export function registerCatalogInvalidation(index, onInvalidate = null) {
  let refreshQueued = false;
  const invalidate = item => {
    if (!item?.pack) return;
    index.invalidate();
    if (refreshQueued || typeof onInvalidate !== "function") return;
    refreshQueued = true;
    queueMicrotask(async () => {
      refreshQueued = false;
      try { await onInvalidate(); }
      catch (error) { console.error("Veilrunner | Failed to refresh the Galactic Market catalog.", error); }
    });
  };
  const registrations = ["createItem", "updateItem", "deleteItem"].map(hook => [hook, Hooks.on(hook, item => {
    invalidate(item);
  })]);
  return () => registrations.forEach(([hook, id]) => Hooks.off(hook, id));
}
