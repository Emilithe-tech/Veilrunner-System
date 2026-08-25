import assert from "node:assert/strict";

globalThis.game = { system: { id: "Veilrunner" } };
globalThis.foundry = {
  utils: { deepClone: value => structuredClone(value) },
  data: { operators: { ForcedReplacement: { create: value => ({ forcedReplacement: value }) } } }
};

const { findTalentTreePack, syncActorTalentTreeItems, talentTreeDefinitionId, talentTreeItemSource, validateTalentTreeItemSources } = await import("../modules/apps/chargen/talent-tree-items.mjs");

assert.equal(talentTreeDefinitionId("magic", "Fire Ball"), "veilrunner.spell.fire-ball");
assert.equal(talentTreeDefinitionId("skills", "Long Arms"), "veilrunner.skill.long-arms");

const spells = { documentName: "Item", title: "Spells", collection: "world.spells" };
const skills = { documentName: "Item", metadata: { label: "Skills" }, collection: "world.skills" };
assert.equal(findTalentTreePack("magic", [skills, spells]), spells);
assert.equal(findTalentTreePack("skills", [spells, skills]), skills);

const source = talentTreeItemSource({
  page: "magic",
  school: { name: "Elemental" },
  practice: { name: "Pyromancy" },
  leaf: { id: "fire-ball", name: "Fire Ball", category: "magic", actions: 2, maxRank: 5, traits: ["pyro"], requires: [{ id: "firebolt", level: 5 }] }
});
assert.equal(source.type, "spell");
assert.equal(source.system.definitionId, "veilrunner.spell.fire-ball");
assert.deepEqual(source.system.intents, ["action-provider", "chargen-selectable"]);
assert.equal(source.system.tree.page, "magic");
assert.deepEqual(source.system.tree.requires, ["firebolt:5"]);
assert.equal(source.flags.Veilrunner.treeNodeId, "fire-ball");

const skillSource = talentTreeItemSource({
  page: "skills",
  school: { name: "Combat" },
  practice: { name: "Firearms" },
  leaf: { id: "long-arms", name: "Long Arms", maxRank: 10 }
});
assert.equal(skillSource.type, "skill");
assert.equal(skillSource.system.definitionId, "veilrunner.skill.long-arms");
assert.equal(skillSource.system.tree.page, "skills");

const reactionSource = talentTreeItemSource({
  page: "skills", school: { name: "Combat" }, practice: { name: "Defense" },
  leaf: { id: "counter", name: "Counter", type: "reaction", maxRank: 5 }
});
assert.equal(reactionSource.type, "skill");
assert.equal(reactionSource.system.activationKind, "action");
assert.equal(reactionSource.system.actionType, "reaction");
assert.equal(reactionSource.system.category, "actions", "reaction activation does not erase the Skill's authored category");

const abilitySource = talentTreeItemSource({
  page: "magic", school: { name: "Primal" }, practice: { name: "Beastmancy" },
  leaf: { id: "shapeshift", name: "Shapeshift", type: "ability", maxRank: 5 }
});
assert.equal(abilitySource.type, "spell");
assert.equal(abilitySource.system.activationKind, "ability");
assert.equal(abilitySource.system.actionType, "free");

globalThis.fromUuid = async uuid => uuid === "Compendium.world.spells.fireball" ? { documentName: "Item", type: "spell", uuid } : null;
assert.deepEqual(await validateTalentTreeItemSources({ leaves: [{ id: "fire-ball", rank: 1 }] }, {
  magic: [{ id: "elemental", practices: [{ id: "pyromancy", spells: [{ id: "fire-ball", sourceUuid: "Compendium.world.spells.fireball" }] }] }],
  skills: []
}), { valid: true, errors: [] });
assert.equal((await validateTalentTreeItemSources({ leaves: [{ id: "missing", rank: 1 }] }, { magic: [], skills: [] })).valid, false);

const sourceDocument = {
  documentName: "Item", type: "spell", uuid: "Compendium.world.spells.fireball",
  system: { definitionId: "veilrunner.spell.fire-ball", currentLevel: 1, maxLevel: 5 },
  toObject: () => ({ name: "Fire Ball", type: "spell", system: { definitionId: "veilrunner.spell.fire-ball", currentLevel: 1, maxLevel: 5 } })
};
globalThis.fromUuid = async () => sourceDocument;
let actorUpdates = [];
const actor = {
  items: [{ id: "legacy", type: "action", system: { currentLevel: 1, definitionId: "" }, flags: { Veilrunner: { treeNodeId: "fire-ball" } } }],
  async createEmbeddedDocuments() { throw new Error("legacy Item should be converted in place"); },
  async updateEmbeddedDocuments(_type, updates) { actorUpdates = updates; return updates; }
};
const actorMigration = await syncActorTalentTreeItems(actor, { leaves: [{ id: "fire-ball", rank: 3 }] }, {
  magic: [{ practices: [{ spells: [{ id: "fire-ball", sourceUuid: sourceDocument.uuid }] }] }], skills: []
});
assert.equal(actorMigration.valid, true);
assert.equal(actorUpdates[0].type, "spell");
assert.equal(actorUpdates[0].system.forcedReplacement.currentLevel, 3, "type changes force-replace the system model while preserving purchased rank");
assert.equal(actorUpdates[0]["flags.core.sourceId"], sourceDocument.uuid);

console.log("talent-tree compendium Item checks passed");
