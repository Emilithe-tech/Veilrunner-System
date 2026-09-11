import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

class Field {
  constructor(options = {}) { this.options = options; Object.assign(this, options); }
  getInitialValue() { return typeof this.initial === "function" ? this.initial() : this.initial ?? ""; }
}
class StringField extends Field {}
class NumberField extends Field {}
class BooleanField extends Field {}
class SchemaField extends Field {
  constructor(fields, options) { super(options); this.fields = fields; }
  getInitialValue() { return Object.fromEntries(Object.entries(this.fields).map(([key, field]) => [key, field.getInitialValue()])); }
}
class ArrayField extends Field { constructor(element, options) { super(options); this.element = element; } }
class TypeDataModel { static migrateData(source) { return source; } }
class ItemSheetV2 {
  constructor(item) { this.item = item; this.isEditable = item.isOwner && !item.pack; this.id = "test-sheet"; }
  async _prepareContext() { return {}; }
  _processFormData(_event, _form, data) { return data; }
  _prepareSubmitData(event, form, data) {
    const result = this._processFormData(event, form, data);
    if (result.system?.firearm?.options) assert.ok(Array.isArray(result.system.firearm.options), "arrays reach V14 validation intact");
    return result;
  }
}
globalThis.foundry = {
  abstract: { TypeDataModel },
  data: { fields: { StringField, NumberField, BooleanField, SchemaField, ArrayField, HTMLField: StringField, FilePathField: StringField } },
  utils: { deepClone: structuredClone, getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object) },
  applications: { api: { HandlebarsApplicationMixin: Class => Class }, sheets: { ItemSheetV2 },
    ux: { TextEditor: { enrichHTML: async value => value } }, handlebars: { loadTemplates: async () => {} } }
};
globalThis.CONFIG = { Actor: { dataModels: { hero: {} } }, statusEffects: [] };
globalThis.game = { user: { isGM: false, getFlag: () => ({}) }, system: { id: "Veilrunner" }, settings: { get: () => [] }, i18n: { localize: key => key } };
const { default: Sheet } = await import("../modules/sheets/item-sheet.mjs");
const { ITEM_TABS, projectItemDetails, projectItemOverview } = await import("../modules/sheets/item-view.mjs");
const { firearmActionForItem } = await import("../modules/items/firearms.mjs");
const { normalizeHudAction } = await import("../modules/apps/action-hud/discovery.mjs");
const { resolveActionConfiguration } = await import("../modules/actions/action-configuration.mjs");
const { replaceHudPreferences } = await import("../modules/apps/action-hud/preferences.mjs");
const { isAmmoCompatible, isMagazineCompatible, executeMagazineAction, setLoadedMagazine } = await import("../modules/items/firearms.mjs");
const { projectAmmunitionRelations, projectItemLoading } = await import("../modules/sheets/ammunition-view.mjs");
const { buildStorefrontCommit } = await import("../modules/apps/chargen/storefront/transaction.mjs");
const { ammunitionAcquisitionQuantity } = await import("../modules/items/ammunition-quantity.mjs");
const { prepareActorOwnedSnapshot } = await import("../modules/data/definitions/provenance.mjs");
const { stackInventoryItems } = await import("../modules/sheets/inventory-view.mjs");
const { splitMagazineStack } = await import("../modules/items/firearms.mjs");

test("same-name magazines never merge even with identical explicit stack keys", () => {
  const first = { id: "mag-one", type: "magazine", name: "Magazine", stackKey: "same", quantity: 1, magazineRounds: 12 };
  const second = { ...first, id: "mag-two", magazineRounds: 3 };
  const rows = stackInventoryItems([first, second]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.itemIds), [["mag-one"], ["mag-two"]]);
  assert.deepEqual(rows.map(row => row.magazineRounds), [12, 3]);
  assert.deepEqual(rows.map(row => row.stackSize), [1, 1]);
});

test("magazine purchases create independent one-magazine documents", async () => {
  const definitionId = "veilrunner.magazine.test-magazine";
  const source = { type: "magazine", name: "Magazine", uuid: "Compendium.Veilrunner.equipment.Item.1234567890123456", system: { definitionId, quantity: 1, rounds: 0, capacity: 12 } };
  const provider = { id: "test", async resolve() { return source; } };
  const index = { async records() { return [{ definitionId, name: source.name, price: 10, weight: 1, availability: "available" }]; } };
  const result = await buildStorefrontCommit({ provider, index, lines: [{ definitionId, quantity: 3 }], credits: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.documents.length, 3);
  assert.deepEqual(result.documents.map(document => document.system.quantity), [1, 1, 1]);
  assert.equal(result.total, 30);
  result.documents[0].system.rounds = 7;
  assert.equal(result.documents[1].system.rounds, 0);
  assert.equal(source.system.rounds, 0);
});

test("legacy magazine split preserves loaded rounds only on the original and rolls back on failure", async () => {
  const system = { quantity: 3, rounds: 7, capacity: 12, ammoId: "ammo", sourceAmmoId: "ammo", ammoDamage: "6", definitionId: "veilrunner.magazine.test-magazine" };
  const magazine = { id: "original", type: "magazine", system, toObject() { return { _id: this.id, type: this.type, system: structuredClone(this.system) }; }, async update(update) { this.system.quantity = update["system.quantity"]; } };
  const actor = { isOwner: true, items: { get: id => id === magazine.id ? magazine : null }, created: [], deleted: [],
    async createEmbeddedDocuments(_type, sources) { this.created = sources.map((source, index) => ({ ...source, id: "new-" + index })); return this.created; },
    async deleteEmbeddedDocuments(_type, ids) { this.deleted = ids; } };
  assert.equal(await splitMagazineStack(actor, magazine.id), true);
  assert.equal(magazine.system.quantity, 1);
  assert.equal(magazine.system.rounds, 7);
  assert.equal(magazine.system.ammoId, "ammo");
  assert.equal(actor.created.length, 2);
  assert.ok(actor.created.every(item => item.system.quantity === 1 && item.system.rounds === 0 && item.system.ammoId === ""));
  assert.ok(actor.created.every(item => item.system.definitionId === system.definitionId));
  system.quantity = 3;
  magazine.update = async () => { throw new Error("Update failed"); };
  await assert.rejects(splitMagazineStack(actor, magazine.id), /Update failed/);
  assert.deepEqual(actor.deleted, ["new-0", "new-1"]);
  assert.equal(system.quantity, 3);
  await assert.rejects(splitMagazineStack({ ...actor, isOwner: false }, magazine.id), /permission/);
});

async function item(type, changes = {}, actor = null) {
  const { default: Model } = await import(`../modules/data/item/${type}.mjs`);
  const schema = Model.defineSchema();
  const source = Object.fromEntries(Object.entries(schema).map(([key, field]) => [key, field.getInitialValue()]));
  const merge = (target, values) => { for (const [key, value] of Object.entries(values)) {
    if (value && typeof value === "object" && !Array.isArray(value)) merge(target[key] ??= {}, value); else target[key] = value;
  } };
  merge(source, changes);
  const system = { ...source };
  Object.defineProperties(system, { schema: { value: schema }, toObject: { value: () => structuredClone(source) } });
  return { id: `${type}-id`, name: `Test ${type}`, type, system, actor, parent: actor, documentName: "Item", isOwner: true, img: "icons/svg/item-bag.svg" };
}

test("all four tabs render representative typed models without catalog reads or obsolete authoring", async () => {
  const require = createRequire(`${process.env.FOUNDRY_APP_PATH || "C:/Program Files/Foundry Virtual Tabletop/resources/app"}/package.json`);
  const Handlebars = require("handlebars");
  for (const name of ["rows", "summary", "actions", "configuration", "details", "field", "ammunition", "loading"]) {
    Handlebars.registerPartial(`systems/veilrunner/templates/item/parts/${name}.hbs`, fs.readFileSync(new URL(`../templates/item/parts/${name}.hbs`, import.meta.url), "utf8"));
  }
  const render = Handlebars.compile(fs.readFileSync(new URL("../templates/item/item-sheet.hbs", import.meta.url), "utf8"));
  Object.defineProperty(game, "packs", { get() { throw new Error("Unexpected catalog read"); } });
  assert.deepEqual(ITEM_TABS.map(tab => tab.id), ["summary", "actions", "configuration", "details"]);
  for (const type of ["weapon", "armor", "spell", "species", "equipment", "ammunition", "magazine"]) {
    const sheet = new Sheet(await item(type));
    for (const tab of ITEM_TABS) {
      sheet.itemTab = tab.id;
      const context = await sheet._prepareContext({});
      const html = render(context);
      assert.equal((html.match(/role="tab"/g) ?? []).length, 4);
      assert.doesNotMatch(html, /name="system\.(quantity|definitionId|rankScaling)/);
      if (tab.id === "summary") assert.doesNotMatch(html, /<prose-mirror/, "empty descriptions do not open editors automatically");
      if (["species", "spell"].includes(type)) assert.equal(context.overview.core.some(row => row.label === "Weight"), false);
    }
  }
});

test("typed overviews separate inventory and expose useful consumable state", async () => {
  const weapon = projectItemOverview(await item("weapon", { weight: 2, price: 100 }));
  assert.equal(weapon.presentation.family, "combat");
  assert.equal(weapon.presentation.statsLabel, "Combat stats");
  assert.deepEqual(weapon.inventory.map(row => row.label), ["Weight", "Price"]);
  assert.equal(weapon.core.some(row => row.label === "Price"), false);
  const consumable = projectItemOverview(await item("consumable", { consumableType: "Medical", uses: { value: 0, max: 3 } }));
  assert.equal(consumable.header.subtype, "Medical");
  assert.equal(consumable.core.find(row => row.label === "Uses remaining").value, "0 / 3");
  const spell = projectItemOverview(await item("spell"));
  assert.equal(spell.presentation.family, "magic");
  assert.deepEqual(spell.inventory, []);
  const fallback = projectItemOverview({ type: "unknown", system: {} });
  assert.equal(fallback.presentation.statsLabel, "Key stats");
});

test("empty and invalid persona labels do not create feature cards or alter stored content", async () => {
  const document = await item("species", { persona: ["undefined", "null", "", "Steadfast"] });
  assert.deepEqual(projectItemOverview(document).features.map(feature => feature.label), ["Steadfast"]);
  assert.deepEqual(document.system.persona, ["undefined", "null", "", "Steadfast"]);
});

test("ammo families and magazine fits reject cross-loading in every direction", () => {
  for (const family of ["ballistic", "thermal", "laser"]) {
    const weapon = { type: "weapon", system: { weaponKind: "firearm", firearm: { compatibility: { ammoTypes: [family], magazineTypes: [family] } } } };
    for (const other of ["ballistic", "thermal", "laser"]) {
      const ammo = { type: "ammunition", system: { ammoType: other } };
      const magazine = { type: "magazine", system: { magazineType: other, rounds: 0, ammoType: other, compatibility: { ammoTypes: [other] } } };
      assert.equal(isAmmoCompatible(weapon, ammo), family === other);
      assert.equal(isMagazineCompatible(weapon, magazine), family === other);
      magazine.system.rounds = 2;
      assert.equal(isMagazineCompatible(weapon, magazine), family === other);
    }
    const missing = { type: "magazine", system: { compatibility: { caliber: "9mm" } } };
    assert.equal(isAmmoCompatible(missing, { type: "ammunition", system: { caliber: "9mm", ammoType: family } }), false);
  }
});

test("magazine exceptions do not bypass loaded ammo checks and blocks win", () => {
  const weapon = { type: "weapon", system: { weaponKind: "firearm", firearm: { compatibility: { ammoTypes: ["ballistic"], allowDefinitionIds: ["veilrunner.magazine.test"] } } } };
  const magazine = { type: "magazine", system: { definitionId: "veilrunner.magazine.test", rounds: 2, ammoType: "laser", compatibility: { ammoTypes: ["laser"] } } };
  assert.equal(isMagazineCompatible(weapon, magazine), false);
  magazine.system.rounds = 0;
  assert.equal(isMagazineCompatible(weapon, magazine), true);
  weapon.system.firearm.compatibility.blockDefinitionIds = [magazine.system.definitionId];
  assert.equal(isMagazineCompatible(weapon, magazine), false);
});

test("magazine loading transfers rounds, preserves damage, and refuses inserted magazines", async () => {
  const ammo = { id: "rounds", name: "Rounds", type: "ammunition", system: { quantity: 50, roundsPerPack: 50, ammoType: "ballistic", damage: { base: "8", type: "piercing", modifier: 1 } } };
  const magazine = { id: "mag", name: "Magazine", type: "magazine", system: { capacity: 12, rounds: 0, compatibility: { ammoTypes: ["ballistic"] } } };
  const actor = { isOwner: true, items: [ammo, magazine], async updateEmbeddedDocuments(type, updates) {
    assert.equal(type, "Item");
    for (const update of updates) for (const [path, value] of Object.entries(update)) {
      if (path === "_id") continue;
      const keys = path.split(".");
      const last = keys.pop();
      const target = keys.reduce((current, key) => current[key] ??= {}, this.items.get(update._id));
      target[last] = value;
    }
  } };
  actor.items.get = id => actor.items.find(entry => entry.id === id);
  assert.equal(await executeMagazineAction(actor, "mag", "load"), true);
  assert.equal(ammo.system.quantity, 38);
  assert.equal(magazine.system.rounds, 12);
  assert.equal(magazine.system.ammoDamage, "8");
  assert.equal(await executeMagazineAction(actor, "mag", "unload"), true);
  assert.equal(ammo.system.quantity, 50);
  assert.equal(magazine.system.rounds, 0);
  ammo.system.quantity = 5;
  assert.equal(await executeMagazineAction(actor, "mag", "load"), true);
  assert.equal(ammo.system.quantity, 0);
  assert.equal(magazine.system.rounds, 5);
  assert.equal(await executeMagazineAction(actor, "mag", "unload"), true);
  assert.equal(ammo.system.quantity, 5);
  actor.items.push({ type: "weapon", system: { firearm: { loadedMagazineId: "mag" } } });
  await assert.rejects(executeMagazineAction(actor, "mag", "load"), /Remove the magazine/);
  await assert.rejects(executeMagazineAction({ ...actor, isOwner: false }, "mag", "load"), /permission/);
});

test("ammo source quantity follows pack size rather than a submitted pack count", async () => {
  const document = await item("ammunition", { roundsPerPack: 30 });
  const relation = projectAmmunitionRelations(document);
  assert.ok(relation.fields.some(field => field.path === "roundsPerPack"));
  const sheet = new Sheet(document);
  const result = sheet._processFormData({}, {}, { system: { roundsPerPack: 50, damage: { base: "8" }, quantity: 999 } });
  assert.equal(result.system.roundsPerPack, 50);
  assert.equal(result.system.damage.base, "8");
  assert.equal(result.system.quantity, 50);
});

test("owned ammo quantities can be corrected and depleted without pack-size refills", async () => {
  const document = await item("ammunition", { roundsPerPack: 50, quantity: 38 }, { isOwner: true });
  const sheet = new Sheet(document);
  assert.equal(sheet._processFormData({}, {}, { system: { quantity: "50" } }).system.quantity, 50);
  assert.equal(sheet._processFormData({}, {}, { system: { quantity: "0" } }).system.quantity, 0);
  assert.equal(sheet._processFormData({}, {}, { system: { roundsPerPack: 100 } }).system.quantity, undefined);
  assert.throws(() => sheet._processFormData({}, {}, { system: { quantity: -1 } }), /whole number/);
  assert.throws(() => sheet._processFormData({}, {}, { system: { quantity: 1.5 } }), /whole number/);
});

test("50-round source packs initialize Qty 50 without refilling owned transfers", () => {
  const source = { type: "ammunition", uuid: "Compendium.Veilrunner.equipment.Item.1234567890123456", system: { definitionId: "veilrunner.ammunition.test-rounds", quantity: 1, roundsPerPack: 50 } };
  assert.equal(ammunitionAcquisitionQuantity(source), 50);
  assert.equal(prepareActorOwnedSnapshot(source).system.quantity, 50);
  const owned = { ...source, actor: { id: "owner" }, system: { ...source.system, quantity: 0 } };
  assert.equal(ammunitionAcquisitionQuantity(owned), null);
  assert.equal(prepareActorOwnedSnapshot(owned).system.quantity, 0);
  assert.equal(ammunitionAcquisitionQuantity({ ...source, parent: { documentName: "Actor" } }), null);
  assert.equal(ammunitionAcquisitionQuantity({ type: "magazine" }), null);
});

test("inventory display preserves zero rounds and totals actual rounds", () => {
  const empty = { id: "empty", name: "Rounds", type: "ammunition", quantity: 0 };
  assert.equal(stackInventoryItems([empty])[0].quantity, 0);
  assert.equal(stackInventoryItems([empty, { ...empty, id: "full", quantity: 50 }])[0].quantity, 50);
});

test("summary loading selects a specific ammo stack then inserts into an unequipped firearm", async () => {
  const actor = { id: "loading-actor", isOwner: true, items: [], async updateEmbeddedDocuments(_type, updates) {
    for (const update of updates) for (const [path, value] of Object.entries(update)) {
      if (path === "_id") continue;
      const keys = path.split(".");
      const last = keys.pop();
      keys.reduce((current, key) => current[key] ??= {}, this.items.get(update._id))[last] = value;
    }
  } };
  actor.items.get = id => actor.items.find(entry => entry.id === id);
  const ammo = { id: "selected-ammo", type: "ammunition", name: "Selected rounds", actor, system: { quantity: 20, ammoType: "ballistic", damage: { base: "6" } } };
  const other = { ...ammo, id: "other-ammo", system: { ...ammo.system, quantity: 50 } };
  const magazine = { id: "magazine", type: "magazine", name: "Magazine", actor, system: { magazineType: "pistol", capacity: 10, rounds: 0, compatibility: { ammoTypes: ["ballistic"] } } };
  const weapon = { id: "firearm", type: "weapon", name: "Firearm", actor, system: { weaponKind: "firearm", firearm: { magazineMode: "detachable", loadedMagazineId: "", compatibility: { ammoTypes: ["ballistic"], magazineTypes: ["pistol"] } } },
    async update(changes) { this.system.firearm.loadedMagazineId = changes["system.firearm.loadedMagazineId"]; } };
  actor.items.push(ammo, other, magazine, weapon);
  assert.equal(projectItemLoading(ammo).rows[0].ammoId, ammo.id);
  assert.equal(projectItemLoading(magazine).rows.find(row => row.operation === "insert").weaponId, weapon.id);
  assert.equal(await executeMagazineAction(actor, magazine.id, "load", { ammoId: ammo.id }), true);
  assert.equal(ammo.system.quantity, 10);
  assert.equal(other.system.quantity, 50);
  assert.equal(magazine.system.rounds, 10);
  assert.equal(await setLoadedMagazine(actor, weapon.id, magazine.id), true);
  assert.equal(weapon.system.firearm.loadedMagazineId, magazine.id);
  assert.equal(projectItemLoading(weapon).rows[0].operation, "remove");
  assert.match(projectItemLoading(ammo).rows[0].reason, /Remove from/);
  assert.equal(await setLoadedMagazine(actor, weapon.id), true);
  assert.equal(weapon.system.firearm.loadedMagazineId, "");
  assert.equal(magazine.system.rounds, 10);
  assert.equal(await executeMagazineAction(actor, magazine.id, "load", { ammoId: "not-owned" }), false);
});

test("direct magazine insertion enforces compatibility, ownership, reuse, and combat routing", async () => {
  const actor = { id: "actor", isOwner: true, items: [] };
  actor.items.get = id => actor.items.find(entry => entry.id === id);
  const magazine = { id: "mag", type: "magazine", system: { magazineType: "pistol", rounds: 0, compatibility: { ammoTypes: ["ballistic"] } } };
  const weapon = { id: "weapon", type: "weapon", system: { weaponKind: "firearm", firearm: { magazineMode: "detachable", loadedMagazineId: "", compatibility: { ammoTypes: ["ballistic"], magazineTypes: ["pistol"] } } }, async update(changes) { this.system.firearm.loadedMagazineId = changes["system.firearm.loadedMagazineId"]; } };
  actor.items.push(magazine, weapon);
  await assert.rejects(setLoadedMagazine({ ...actor, isOwner: false }, weapon.id, magazine.id), /permission/);
  await assert.rejects(setLoadedMagazine(actor, weapon.id, "foreign-magazine"), /incompatible/);
  magazine.system.magazineType = "rifle";
  await assert.rejects(setLoadedMagazine(actor, weapon.id, magazine.id), /incompatible/);
  magazine.system.magazineType = "pistol";
  actor.items.push({ id: "other", type: "weapon", system: { firearm: { loadedMagazineId: magazine.id } } });
  await assert.rejects(setLoadedMagazine(actor, weapon.id, magazine.id), /already installed/);
  actor.items.pop();
  game.combat = { started: true, combatants: [{ actor }] };
  try { await assert.rejects(setLoadedMagazine(actor, weapon.id, magazine.id), /during combat/); }
  finally { delete game.combat; }
  assert.equal(weapon.system.firearm.loadedMagazineId, "");
});

test("loading panel renders selected-item controls and explains unowned definitions", () => {
  const require = createRequire(`${process.env.FOUNDRY_APP_PATH || "C:/Program Files/Foundry Virtual Tabletop/resources/app"}/package.json`);
  const Handlebars = require("handlebars");
  const render = Handlebars.compile(fs.readFileSync(new URL("../templates/item/parts/loading.hbs", import.meta.url), "utf8"));
  const context = { canConfigure: true, itemLoading: { title: "Load rounds", rows: [{ name: "Magazine", operation: "rounds", ammoId: "ammo", magazineId: "mag", label: "Load rounds" }] } };
  assert.match(render(context), /data-sheet-action="itemLoading"/);
  assert.match(render(context), /data-ammo-id="ammo"/);
  assert.doesNotMatch(render({ ...context, canConfigure: false }), /<button/);
  assert.match(render({ itemLoading: projectItemLoading({ type: "ammunition" }) }), /character's inventory/);
});

test("purchasing ammo converts packs to rounds without changing pack pricing", async () => {
  const definitionId = "veilrunner.ammunition.test-rounds";
  const source = { type: "ammunition", name: "Ammo pack", uuid: "Compendium.Veilrunner.equipment.Item.1234567890123456", system: { definitionId, roundsPerPack: 30, quantity: 99 } };
  const provider = { id: "test", async resolve() { return source; } };
  const index = { async records() { return [{ definitionId, name: source.name, price: 10, weight: 0.3, availability: "available" }]; } };
  const result = await buildStorefrontCommit({ provider, index, lines: [{ definitionId, quantity: 2 }], credits: 100 });
  assert.equal(result.valid, true);
  assert.equal(result.documents[0].system.quantity, 60);
  assert.equal(result.total, 20);
  assert.equal(result.weight, 0.6);
});

test("firearm damage uses ammo then caps before modifiers and ignores mode base replacement", async () => {
  const document = await item("weapon", { weaponKind: "firearm", damage: { base: "99", max: "6", modifier: 3 }, firearm: {
    magazineMode: "internal", internal: { quantity: 5, ammoType: "ballistic", ammoDamage: "8" },
    compatibility: { ammoTypes: ["ballistic"] }, fireModes: [{ id: "single", label: "Single", damageFormula: "100", actions: 1, ammoCost: 1 }]
  } });
  const action = firearmActionForItem(document);
  const resolved = resolveActionConfiguration(null, normalizeHudAction(action), {});
  assert.equal(resolved.damageOutcome.formula, "min((8), 6) + 3");
  assert.equal(resolved.damageOutcome.maximum, 9);
  assert.equal(resolved.damageOutcome.minimum, 9);
});

test("owned configuration shares firearm results with HUD and keeps ammunition status", async () => {
  const actor = { id: "actor", isOwner: true, documentName: "Actor", items: [], system: { resources: {} } };
  actor.items.get = id => actor.items.find(entry => entry.id === id);
  const weapon = await item("weapon", { weaponKind: "firearm", damage: { base: "1d6", modifier: 0 },
    firearm: { magazineMode: "internal", capacity: 12, compatibility: { ammoTypes: ["ballistic"] }, internal: { quantity: 8, ammoType: "ballistic", ammoDamage: "1d6" }, options: [{ id: "aim", label: "Aim", damageModifier: 2 }] } }, actor);
  actor.items.push(weapon);
  const original = weapon.system.toObject();
  const source = firearmActionForItem(weapon, actor);
  assert.equal(source.damageTooltip, "8/12");
  assert.equal(source.cost, "8/12");
  const sheet = new Sheet(weapon);
  sheet.previewSelections[source.id] = { "weaponOption:aim": "1" };
  const context = await sheet._prepareContext({});
  const resolved = resolveActionConfiguration(actor, normalizeHudAction(source, { actor }), sheet.previewSelections[source.id]);
  assert.equal(context.overview.damage[0].value, resolved.damageOutcome.formula);
  assert.equal(resolved.damageOutcome.minimum, 3);
  assert.equal(context.configurations[0].hasSelections, true);
  assert.equal(context.canConfigure, true);
  assert.deepEqual(weapon.system.toObject(), original);
});

test("Details reconstructs arrays before validation and preserves excluded instance and reference data", async () => {
  const weapon = await item("weapon", { quantity: 9, rules: [{ id: "grant", key: "GrantItem", uuid: "Compendium.old.Item.legacy", definitionId: "veilrunner.ability.test" }] });
  const sheet = new Sheet(weapon);
  const result = sheet._prepareSubmitData(null, null, { system: { quantity: 0, definitionId: "bad", firearm: { options: { 0: { id: "aim", label: "Aim", damageModifier: "2" } } }, rules: { 0: { id: "grant", label: "New" } } } });
  assert.equal(result.system.firearm.options[0].damageModifier, 2);
  assert.equal(result.system.quantity, undefined);
  assert.equal(result.system.definitionId, undefined);
  assert.equal(result.system.rules[0].uuid, "Compendium.old.Item.legacy");
  const rules = projectItemDetails(weapon, {}, true).flatMap(group => group.fields).find(field => field.path === "rules");
  assert.equal(rules.rows[0].field.fields.some(field => field.path.endsWith(".uuid")), false);
  weapon.pack = "Veilrunner.weapons";
  assert.deepEqual(new Sheet(weapon)._prepareSubmitData(null, null, { name: "changed" }), {});
});

test("owned spell previews cannot exceed the purchased level", async () => {
  const actor = { id: "actor", isOwner: true, documentName: "Actor", items: [], system: { resources: {} } };
  const spell = await item("spell", { owned: { currentLevel: 3 }, progression: { maxLevel: 10 }, baseSpellDamage: "4", spellDamagePerLevel: "1d6" }, actor);
  const sheet = new Sheet(spell);
  const view = await sheet._prepareContext({});
  assert.equal(view.configurations[0].choices.find(choice => choice.key === "spellLevel").max, 3);
  assert.equal(spell.system.owned.currentLevel, 3);
});

test("reset removes stale selections under Foundry flag merging while retaining other actors", async () => {
  const before = { Actor_test: { remembered: { removed: { option: "1" }, kept: { rank: "2", stale: "1" } } }, Actor_other: { pins: ["keep"] } };
  let payload;
  const user = { getFlag: () => before, setFlag: async (_scope, _key, value) => { payload = value; } };
  const result = await replaceHudPreferences({ uuid: "Actor.test" }, { remembered: { kept: { rank: "1" } } }, user);
  assert.deepEqual(payload.Actor_test.remembered, { "-=removed": null, kept: { rank: "1", "-=stale": null } });
  assert.deepEqual(payload.Actor_other, before.Actor_other);
  assert.deepEqual(result.remembered, { kept: { rank: "1" } });
});
