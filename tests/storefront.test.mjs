import assert from "node:assert/strict";

globalThis.game = { system: { id: "Veilrunner" }, items: { contents: [] }, packs: [] };
class Field { constructor(options = {}) { this.options = options; } }
globalThis.foundry = {
  abstract: { TypeDataModel: class TypeDataModel {} },
  data: { fields: { ArrayField: class ArrayField extends Field {}, StringField: Field, NumberField: Field, BooleanField: Field, SchemaField: Field, HTMLField: Field } },
  utils: { deepClone: structuredClone, escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") }
};
const { addToCart, cartItemCount, cartTotal, cartWeight, mergeCarts, normalizeCart, removeFromCart, setCartQuantity } = await import("../modules/apps/chargen/storefront/cart.mjs");
const { catalogFacets, paginateCatalog, queryCatalog } = await import("../modules/apps/chargen/storefront/query.mjs");
const { buildStorefrontCommit, validateStorefrontTransaction } = await import("../modules/apps/chargen/storefront/transaction.mjs");
const { CatalogIndex, CatalogProvider, compendiumWeaponClassification } = await import("../modules/apps/chargen/storefront/catalog-provider.mjs");
const { VEILRUNNER_STARTER_STORE_FIXTURES, starterStoreContext } = await import("../modules/data/starter-store.mjs");
const { renderStorefrontBrowser, renderStorefrontContext } = await import("../modules/apps/chargen/storefront/view.mjs");

const records = [
  { definitionId: "veilrunner.weapon.test-pistol", name: "Test Pistol", category: "weapon", storeCategory: "weapons", subtype: "pistol", weaponType: "pistol", rarity: "common", rarityTier: 3, grade: 3, traits: ["firearm"], price: 25, weight: 1.2, availability: "available", stock: 4, search: "test pistol weapon pistol common grade 3 firearm" },
  { definitionId: "veilrunner.ammunition.test-rounds", name: "Test Rounds", category: "ammunition", storeCategory: "gear", subtype: "ballistic", rarity: "common", rarityTier: 3, grade: 1, traits: [], price: 2, weight: .2, availability: "available", stock: null, search: "test rounds ammunition ballistic common grade 1" },
  { definitionId: "veilrunner.weapon.rare-rifle", name: "Rare Rifle", category: "weapon", storeCategory: "weapons", subtype: "assaultRifle", weaponType: "assaultRifle", rarity: "rare", rarityTier: 6, grade: 1, traits: ["burst"], price: 75, weight: 3.5, availability: "available", stock: null, search: "rare rifle weapon assault rifle rare grade 1 burst" },
  { definitionId: "veilrunner.consumable.medkit", name: "Medkit", category: "consumable", storeCategory: "consumables", subtype: "consumable", rarity: "uncommon", rarityTier: 4, grade: 2, traits: ["medical"], price: 15, weight: .5, availability: "available", stock: null, search: "medkit consumable uncommon grade 2 medical" }
];
const index = { async records() { return records; } };
const documents = new Map(records.map(record => [record.definitionId, {
  toObject: () => ({ _id: "source-id", name: record.name, type: record.category, system: { definitionId: record.definitionId, quantity: 1 } })
}]));
const provider = { id: "veilrunner.chargen-store", async resolve(id) { return documents.get(id) ?? null; } };

let cart = addToCart([], records[0].definitionId);
cart = addToCart(cart, records[0].definitionId);
assert.deepEqual(cart, [{ definitionId: records[0].definitionId, quantity: 2, options: {} }], "cart retains only canonical identity, quantity, and transaction options");
assert.equal(cartTotal(cart, records), 50);
assert.equal(cartItemCount(cart), 2);
assert.equal(cartWeight(cart, records), 2.4);
cart = setCartQuantity(cart, records[0].definitionId, 3);
assert.equal(cart[0].quantity, 3);
assert.deepEqual(removeFromCart(cart, records[0].definitionId), []);
assert.deepEqual(normalizeCart([{ definitionId: "VEILRUNNER.WEAPON.TEST-PISTOL", quantity: 0 }]), [{ definitionId: records[0].definitionId, quantity: 1, options: {} }]);
assert.deepEqual(mergeCarts([{ definitionId: records[0].definitionId, quantity: 2 }], [{ definitionId: records[0].definitionId, quantity: 3 }]), [{ definitionId: records[0].definitionId, quantity: 5, options: {} }], "purchasing a cart merges matching lines into confirmed purchases");

assert.deepEqual(catalogFacets(records).categories, ["consumables", "gear", "weapons"]);
assert.deepEqual(catalogFacets(records).grades, [1, 2, 3]);
assert.deepEqual(queryCatalog(records, { category: "weapons", sort: "price" }).map(record => record.definitionId), [records[0].definitionId, records[2].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", search: "round" }).map(record => record.definitionId), [records[1].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", subtype: "ballistic" }).map(record => record.definitionId), [records[1].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", rarity: "uncommon" }).map(record => record.definitionId), [records[3].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", grade: 3 }).map(record => record.definitionId), [records[0].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "weapons", subtype: "assaultRifle", rarity: "rare", grade: 1 }).map(record => record.definitionId), [records[2].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", priceMin: 10, priceMax: 30, weightMin: 1, weightMax: 2 }).map(record => record.definitionId), [records[0].definitionId]);
assert.deepEqual(queryCatalog(records, { category: "all", sort: "grade", direction: "desc" }).map(record => record.grade), [3, 2, 1, 1]);
assert.deepEqual(queryCatalog(records, { category: "all", sort: "rarity", direction: "desc" }).map(record => record.rarityTier), [6, 4, 3, 3]);
const paged = paginateCatalog(Array.from({ length: 53 }, (_, index) => ({ index })), 3);
assert.equal(paged.records.length, 3); assert.equal(paged.currentPage, 3); assert.equal(paged.pageCount, 3);
assert.equal(paginateCatalog(records, 99).currentPage, 1, "page clamps after result count shrinks");
const browserMarkup = renderStorefrontBrowser({ query: { category: "weapons", subtype: "all", rarity: "all", grade: "all", sort: "name", direction: "asc" }, facets: catalogFacets(records), page: paginateCatalog(records, 1), selectedDefinitionId: records[0].definitionId });
assert.match(browserMarkup, /vr-store-item-row selected/); assert.match(browserMarkup, /vr-store-rarity/); assert.match(browserMarkup, /vr-store-grade/); assert.match(browserMarkup, /Assault Rifle/); assert.match(browserMarkup, /Projector/);
assert.match(browserMarkup, /vr-store-subtype-row standard[\s\S]*?Arcane[\s\S]*?Martial[\s\S]*?vr-store-subtype-row firearms[\s\S]*?Light Firearms[\s\S]*?Heavy Firearms/, "standard weapon groups render above firearm groups");

const valid = await validateStorefrontTransaction({ provider, index, lines: [{ definitionId: records[0].definitionId, quantity: 2 }], credits: 60 });
assert.equal(valid.valid, true); assert.equal(valid.total, 50); assert.equal(valid.remaining, 10);
const unaffordable = await validateStorefrontTransaction({ provider, index, lines: [{ definitionId: records[0].definitionId, quantity: 3 }], credits: 60 });
assert.equal(unaffordable.valid, false); assert.match(unaffordable.errors[0], /exceeds available credits/);
const unavailable = await validateStorefrontTransaction({ provider, index, lines: [{ definitionId: "veilrunner.weapon.missing", quantity: 1 }], credits: 100 });
assert.equal(unavailable.valid, false); assert.match(unavailable.errors[0], /no longer available/);
const unavailableRecord = { ...records[0], availability: "unavailable" };
const unavailableOffer = await validateStorefrontTransaction({ provider, index: { async records() { return [unavailableRecord]; } }, lines: [{ definitionId: unavailableRecord.definitionId, quantity: 1 }], credits: 100 });
assert.equal(unavailableOffer.valid, false); assert.match(unavailableOffer.errors[0], /not currently available/);
const overweight = await validateStorefrontTransaction({ provider, index, lines: [{ definitionId: records[0].definitionId, quantity: 2 }], credits: 100, carryWeight: 5, carryCapacity: 7 });
assert.equal(overweight.valid, false); assert.match(overweight.errors.at(-1), /carry capacity/);
const commit = await buildStorefrontCommit({ provider, index, lines: [{ definitionId: records[0].definitionId, quantity: 2, options: { finish: "matte" } }], credits: 60 });
assert.equal(commit.valid, true); assert.equal(commit.documents.length, 1); assert.equal(commit.documents[0]._id, undefined); assert.equal(commit.documents[0].system.quantity, 2); assert.equal(commit.documents[0].flags.Veilrunner.storefront.definitionId, records[0].definitionId);

assert.equal(starterStoreContext().entries.length, 0, "sample storefront is disabled by default");
assert.ok(VEILRUNNER_STARTER_STORE_FIXTURES.length > 25, "opt-in fixtures demonstrate pagination");
const fixtureProvider = new CatalogProvider(starterStoreContext({ includeSamples: true }));
const fixtureIndex = new CatalogIndex(fixtureProvider);
const fixtureRecords = await fixtureIndex.records();
assert.equal(fixtureRecords.length, VEILRUNNER_STARTER_STORE_FIXTURES.length);
assert.equal(fixtureRecords[0].grade, 2); assert.equal(fixtureRecords[0].storeCategory, "weapons");
const fixtureBrowser = renderStorefrontBrowser({ query: { category: "weapons", subtype: "all", rarity: "all", grade: "all", sort: "name", direction: "asc" }, facets: catalogFacets(fixtureRecords), page: paginateCatalog(fixtureRecords, 1), selectedDefinitionId: "" });
assert.equal((fixtureBrowser.match(/data-definition-id=/g) ?? []).length, 25, "live fixture page renders exactly 25 item rows");
const fixtureCommit = await buildStorefrontCommit({ provider: fixtureProvider, index: fixtureIndex, lines: [{ definitionId: fixtureRecords[0].definitionId, quantity: 1 }], credits: 5000 });
assert.equal(fixtureCommit.valid, true); assert.equal(fixtureCommit.documents[0].system.definitionId, fixtureRecords[0].definitionId);
const contextMarkup = renderStorefrontContext({ mode: "details", cartLines: [{ definitionId: fixtureRecords[0].definitionId, quantity: 1, options: {} }], recordById: new Map(fixtureRecords.map(record => [record.definitionId, record])), selectedRecord: fixtureRecords[0], itemCount: 1, cartTotal: fixtureRecords[0].price, remainingCredits: 3200, projectedWeight: 3.6, carryCapacity: 20 });
assert.match(contextMarkup, /Proficiency Unknown/); assert.match(contextMarkup, /View Cart/); assert.match(contextMarkup, /Credits Remaining/);
const cartMarkup = renderStorefrontContext({ mode: "cart", cartLines: [{ definitionId: fixtureRecords[0].definitionId, quantity: 1, options: {} }], recordById: new Map(fixtureRecords.map(record => [record.definitionId, record])), selectedRecord: fixtureRecords[0], itemCount: 1, cartTotal: fixtureRecords[0].price, remainingCredits: 3200, projectedWeight: 3.6, carryCapacity: 20 });
assert.match(cartMarkup, /data-action="storefront-purchase-cart"/, "cart exposes an explicit Purchase action before items enter the Live Build");

const weaponsFolder = { id: "weapons", name: "Weapons", folder: null };
const heavyFirearmsFolder = { id: "heavy-firearms", name: "Heavy Firearms", folder: weaponsFolder };
const projectorFolder = { id: "projector", name: "Projector", folder: heavyFirearmsFolder };
const compendiumProjector = {
  name: "Solar Projector", type: "weapon", img: "icons/svg/item-bag.svg", folder: projectorFolder,
  system: { definitionId: "", price: 900, weight: 4, rarity: "rare", grade: 2, traits: [], damage: { base: "2d8" }, description: { value: "" } },
  toObject() { return { _id: "projector-id", name: this.name, type: this.type, img: this.img, folder: "projector", system: structuredClone(this.system) }; }
};
const itemsPack = { documentName: "Item", title: "Items", metadata: { label: "Items" }, folders: new Map(), async getDocuments() { return [compendiumProjector]; } };
assert.deepEqual(compendiumWeaponClassification(compendiumProjector, itemsPack), { group: "heavyFirearms", type: "projector" });
game.packs = [itemsPack];
const compendiumProvider = new CatalogProvider(starterStoreContext());
const compendiumIndex = new CatalogIndex(compendiumProvider);
const compendiumRecords = await compendiumIndex.records();
assert.deepEqual(compendiumRecords.map(record => [record.name, record.subtype]), [["Solar Projector", "projector"]], "Weapons-folder compendium Items populate the storefront");
const compendiumCommit = await buildStorefrontCommit({ provider: compendiumProvider, index: compendiumIndex, lines: [{ definitionId: "veilrunner.weapon.solar-projector", quantity: 1 }], credits: 1000 });
assert.equal(compendiumCommit.documents[0].system.weaponType, "projector", "purchased compendium weapons retain their folder-derived type on the Hero sheet");

console.log("storefront cart, query, validation, and canonical transaction checks passed");
