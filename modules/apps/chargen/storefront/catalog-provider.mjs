import { getDefinitionId, hasItemIntent, normalizeDefinitionId, resolveDefinition } from "../../../data/item/identity.mjs";
import { WEAPON_TYPE_GROUPS, itemRarityData, normalizeWeaponType } from "../../../data/item/physical.mjs";

const entriesOf = context => Array.isArray(context) ? context : context?.entries ?? [];
const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection ?? []);
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

function generatedWeaponDefinitionId(item) {
  const slug = String(item?.name ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug ? `veilrunner.weapon.${slug}` : "";
}

function isItemsCompendium(pack) {
  if (pack?.documentName !== "Item") return false;
  return [pack.title, pack.metadata?.label, pack.metadata?.name, pack.collection?.split(".").at(-1)]
    .some(value => normalizeFolderToken(value) === "items");
}

export class CatalogProvider {
  #compendiumEntries = null;
  #compendiumDocuments = new Map();
  #compendiumLoading = null;
  #revision = 0;
  constructor(context) { this.context = context ?? { id: "veilrunner.store", entries: [] }; }
  get id() { return this.context.id; }
  entries() {
    const configured = entriesOf(this.context).filter(entry => entry?.definitionId);
    const configuredIds = new Set(configured.map(entry => normalizeDefinitionId(entry.definitionId)));
    // World Items are immediately useful during authoring. Canonical store
    // entries still override their price/availability when they exist.
    const discovered = documentsIn(game.items?.contents).map(item => ({
      definitionId: getDefinitionId(item), price: item.system?.price, currency: item.system?.currency,
      availability: "available", autoDiscover: true
    })).filter(entry => entry.definitionId && !configuredIds.has(normalizeDefinitionId(entry.definitionId)));
    return [...configured, ...discovered, ...(this.#compendiumEntries ?? [])];
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
      const existing = new Set(this.entries().map(entry => normalizeDefinitionId(entry.definitionId)));
      for (const pack of documentsIn(globalThis.game?.packs).filter(isItemsCompendium)) {
        const items = await pack.getDocuments?.() ?? [];
        for (const item of items) {
          if (item?.type !== "weapon") continue;
          const classification = compendiumWeaponClassification(item, pack);
          if (!classification) continue;
          const definitionId = getDefinitionId(item) || generatedWeaponDefinitionId(item);
          const normalizedId = normalizeDefinitionId(definitionId);
          if (!normalizedId || existing.has(normalizedId) || compendiumDocuments.has(normalizedId)) continue;
          const entry = {
            definitionId: normalizedId,
            price: item.system?.price,
            currency: item.system?.currency,
            availability: "available",
            autoDiscover: true,
            compendiumWeapon: true,
            weaponGroup: classification.group,
            weaponType: classification.type
          };
          discovered.push(entry);
          compendiumDocuments.set(normalizedId, item);
        }
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
    const discovered = this.#compendiumDocuments.get(normalizeDefinitionId(definitionId));
    if (discovered) return discovered;
    const entry = this.entry(definitionId);
    if (entry?.source) {
      const source = structuredClone(entry.source);
      return { ...source, toObject: () => structuredClone(source) };
    }
    return resolveDefinition(definitionId);
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
      return item && (entry.compendiumWeapon || getDefinitionId(item) === normalizeDefinitionId(entry.definitionId)) && (entry.autoDiscover || hasItemIntent(item, "market-sellable"))
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

/** Attach only once; compendium/world updates make normalized store records stale. */
export function registerCatalogInvalidation(index, onInvalidate = null) {
  let refreshQueued = false;
  const invalidate = item => {
    if (!(item?.pack || (!item?.parent && getDefinitionId(item)))) return;
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
