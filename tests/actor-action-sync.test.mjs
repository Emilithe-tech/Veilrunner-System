import assert from "node:assert/strict";
import test from "node:test";

class Field { constructor(options = {}) { Object.assign(this, options); } }
class ArrayField extends Field { constructor(element, options = {}) { super(options); this.element = element; } }
globalThis.foundry = {
  data: { fields: { ArrayField, StringField: Field } },
  utils: { deepClone: value => structuredClone(value) }
};

const { actorActionSyncUpdate, isCanonicalActorAction, syncCanonicalActorAction } = await import("../modules/data/item/actor-action-sync.mjs");

const definitionId = "veilrunner.spell.arc-bolt";
const canonical = {
  id: "source", type: "spell", name: "Arc Bolt", img: "arc.webp", parent: null,
  system: { definitionId, maxLevel: 10, currentLevel: 1, favorite: false, baseSpellDamage: "2d6", spellDamagePerLevel: "1d6" },
  effects: [{ name: "Shocked" }],
  toObject() { return structuredClone({ name: this.name, img: this.img, system: this.system, effects: this.effects }); }
};

test("canonical action synchronization preserves actor progression and favorite state", () => {
  const owned = { id: "owned", type: "spell", name: "Old Arc Bolt", system: { definitionId, currentLevel: 4, favorite: true } };
  assert.equal(isCanonicalActorAction(canonical), true);
  assert.deepEqual(actorActionSyncUpdate(canonical, owned), {
    _id: "owned",
    name: "Arc Bolt",
    img: "arc.webp",
    system: { definitionId, maxLevel: 10, currentLevel: 4, favorite: true, baseSpellDamage: "2d6", spellDamagePerLevel: "1d6" },
    effects: [{ name: "Shocked" }]
  });
});

test("canonical action synchronization updates every matching actor copy", async () => {
  const calls = [];
  const matching = { id: "owned", type: "spell", system: { definitionId, currentLevel: 2, favorite: false } };
  const unrelated = { id: "other", type: "spell", system: { definitionId: "veilrunner.spell.other", currentLevel: 1 } };
  const actors = [
    { items: [matching, unrelated], updateEmbeddedDocuments: async (type, updates, options) => calls.push({ type, updates, options }) },
    { items: [unrelated], updateEmbeddedDocuments: async () => assert.fail("unrelated actor should not update") }
  ];
  assert.deepEqual(await syncCanonicalActorAction(canonical, { actors }), { actors: 1, items: 1 });
  assert.equal(calls[0].type, "Item");
  assert.equal(calls[0].updates[0]._id, "owned");
  assert.equal(calls[0].updates[0].system.currentLevel, 2);
  assert.equal(calls[0].options.veilrunnerCanonicalActionSync, true);
});

test("embedded and unassigned actions never become canonical broadcasters", () => {
  assert.equal(isCanonicalActorAction({ ...canonical, parent: { documentName: "Actor" } }), false);
  assert.equal(isCanonicalActorAction({ ...canonical, system: { ...canonical.system, definitionId: "" } }), false);
});
