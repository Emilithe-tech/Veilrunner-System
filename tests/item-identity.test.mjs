import assert from "node:assert/strict";

class Field { constructor(options = {}) { this.options = options; } }
class SchemaField extends Field { constructor(fields, options = {}) { super(options); this.fields = fields; } }
class ArrayField extends Field { constructor(element, options = {}) { super(options); this.element = element; } }
class TypeDataModel { static migrateData(source) { return source; } }

globalThis.foundry = {
  abstract: { TypeDataModel },
  data: { fields: { ArrayField, BooleanField: Field, HTMLField: Field, NumberField: Field, SchemaField, StringField: Field } }
};
globalThis.game = { system: { id: "Veilrunner" }, items: [], packs: [] };

const {
  ITEM_INTENTS, auditDefinitionIds, defaultIntentsForItem, getDefinitionId, hasItemIntent,
  isDefinitionId, itemIdentityFields, itemsWithIntent, normalizeItemIntents,
  migrateOfficialCompendiumDefinitions, registerActorActionProvider, resolveActorActions, resolveDefinition
} = await import("../modules/data/item/identity.mjs");

assert.equal(isDefinitionId("veilrunner.weapon.arc-pistol"), true);
assert.equal(isDefinitionId("Veilrunner.weapon.arc-pistol"), true, "IDs normalize before validation");
assert.equal(isDefinitionId("veilrunner.weapon"), false);
assert.equal(isDefinitionId("veilrunner.weapon.Arc Pistol"), false);
assert.deepEqual(normalizeItemIntents(["weapon", "WEAPON", "unknown", "market-sellable"]), ["weapon", "market-sellable"]);
assert.deepEqual(defaultIntentsForItem("weapon", { weaponKind: "firearm" }), ["equippable", "market-sellable", "weapon", "action-provider"]);
assert.ok(defaultIntentsForItem("action", { actionType: "reaction" }).includes("reaction-provider"));
assert.ok(defaultIntentsForItem("spell", {}).includes("action-provider"));
assert.ok(defaultIntentsForItem("skill", {}).includes("action-provider"));

const schema = itemIdentityFields();
assert.ok(schema.definitionId && schema.intents && schema.providedActionIds, "identity fields are reusable schema fields");
assert.equal(ITEM_INTENTS.includes("action-provider"), true);

const { default: ActionData } = await import("../modules/data/item/action.mjs");
const actionSchema = ActionData.defineSchema();
assert.ok(actionSchema.definitionId && actionSchema.requiredDefinitionIds && actionSchema.requiredItemIntents, "action data exposes canonical prerequisites");
assert.ok(actionSchema.actionMode && actionSchema.damageFormula, "action data exposes unified mode and smart damage authoring");
assert.deepEqual(ActionData.migrateData({ definitionId: "VEILRUNNER.ACTION.TEST", intents: ["action-provider", "invalid"] }), {
  definitionId: "veilrunner.action.test", intents: ["action-provider"]
});

const definition = { id: "world-1", system: { definitionId: "veilrunner.weapon.arc-pistol", intents: ["weapon", "equippable"] } };
const embeddedCopy = { id: "actor-1", parent: { documentName: "Actor" }, system: structuredClone(definition.system) };
assert.equal(getDefinitionId(embeddedCopy), "veilrunner.weapon.arc-pistol", "embedded copies preserve portable identity");
assert.equal(hasItemIntent(embeddedCopy, "weapon"), true);
assert.deepEqual(itemsWithIntent([definition, embeddedCopy], "weapon"), [definition, embeddedCopy]);

const audit = auditDefinitionIds([definition, { id: "world-2", system: { definitionId: "veilrunner.weapon.arc-pistol" } }, embeddedCopy, { id: "blank", system: {} }]);
assert.equal(audit.duplicates.length, 1, "definition-library duplicates are reported");
assert.deepEqual(audit.unassigned.map(item => item.id), ["blank"], "embedded copies are excluded from library audit");

globalThis.game.items = [definition];
assert.equal(await resolveDefinition("veilrunner.weapon.arc-pistol", { includePacks: false }), definition);
assert.equal(await resolveDefinition("veilrunner.weapon.arc-pistol", { actor: { items: [embeddedCopy] }, includePacks: false }), embeddedCopy, "actor state wins when requested");

const officialAction = { id: "official-action", _source: { _id: "official-action" }, name: "Official Test", type: "action", system: {} };
let migrationUpdates = [];
let migrationOptions = null;
globalThis.game.user = { isGM: true };
globalThis.game.packs = [{
  documentName: "Item", collection: "Veilrunner.actions-test", getDocuments: async () => [officialAction],
  documentClass: { updateDocuments: async (updates, options) => { migrationUpdates = updates; migrationOptions = options; } }
}];
assert.deepEqual(await migrateOfficialCompendiumDefinitions(), { migrated: 1, conflicts: [] });
assert.deepEqual(migrationUpdates, [{ _id: "official-action", "system.definitionId": "veilrunner.action.official-test", "system.intents": ["action-provider"] }], "pack migration uses Foundry batch updates with document IDs");
assert.deepEqual(migrationOptions, { pack: "Veilrunner.actions-test" }, "migration targets the compendium collection through Foundry's document API");
globalThis.game.packs = [];

registerActorActionProvider("identity-test", actor => actor?.enabled ? [{ id: "synthetic:test" }] : []);
assert.deepEqual(resolveActorActions({ enabled: true }), [{ id: "synthetic:test" }]);

console.log("item identity, intents, resolution, and duplicate audit checks passed");
