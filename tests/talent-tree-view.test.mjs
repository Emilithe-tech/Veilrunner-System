import assert from "node:assert/strict";
import { magicTreeAccess, purchasedTalentTreePage, schoolAccessBranchId, searchTalentTree, talentTreeRecords } from "../modules/apps/chargen/talent-tree-view.mjs";

const schools = [{ id: "elemental", name: "Elemental", practices: [
  { id: "pyromancy", name: "Pyromancy", spells: [{ id: "firebolt", name: "Firebolt", description: "A focused flame projectile", traits: ["fire", "damage"] }, { id: "flame-wall", name: "Flame Wall", traits: ["fire", "area"] }] },
  { id: "geomancy", name: "Geomancy", spells: [{ id: "stone", name: "Stone Shape", traits: ["earth"] }] }
] }];

const records = talentTreeRecords(schools);
assert.deepEqual(searchTalentTree(records, "projectile").map(record => record.id), ["firebolt"]);
assert.deepEqual(searchTalentTree(records, "pyromancy").map(record => record.id), ["pyromancy", "firebolt", "flame-wall"]);
assert.deepEqual(searchTalentTree(records, "fire", 1).map(record => record.id), ["firebolt"]);

const purchased = purchasedTalentTreePage(schools, { branches: ["pyromancy"], leaves: [{ id: "firebolt", rank: 2 }, { id: "stone", rank: 0 }] });
assert.deepEqual(purchased.map(school => school.id), ["elemental"]);
assert.deepEqual(purchased[0].practices.map(practice => practice.id), ["pyromancy"]);
assert.deepEqual(purchased[0].practices[0].spells.map(spell => spell.id), ["firebolt"]);
assert.equal(schools[0].practices[0].spells.length, 2, "filtering must not mutate the catalog");

assert.equal(schoolAccessBranchId("Elemental"), "school:elemental");
assert.deepEqual(magicTreeAccess("Magic", "Elemental Adept", "Flame Adept"), { rootUnlocked: true, schoolId: "elemental" });
assert.deepEqual(magicTreeAccess("Magic", "Amplifier", "Synergist"), { rootUnlocked: true, schoolId: "intrinsic" });
assert.deepEqual(magicTreeAccess("Magic", "Cleric", "Priest"), { rootUnlocked: true, schoolId: "creation" });
assert.deepEqual(magicTreeAccess("Magic", "Conjurer", "Illusionist"), { rootUnlocked: true, schoolId: "spirit" });
assert.deepEqual(magicTreeAccess("Magic", "Druid", "Cultivator"), { rootUnlocked: true, schoolId: "primal" });
assert.deepEqual(magicTreeAccess("Magic", "Magus", "Blood Mage"), { rootUnlocked: true, schoolId: "intrinsic" });
assert.deepEqual(magicTreeAccess("Magic", "Magus", "Sorcerer"), { rootUnlocked: true, schoolId: "elemental" });
assert.deepEqual(magicTreeAccess("Magic", "Magus", "Wizard"), { rootUnlocked: true, schoolId: "arcane" });
assert.deepEqual(magicTreeAccess("Armament", "Elemental Adept", "Flame Adept"), { rootUnlocked: false, schoolId: "" });

const grantedSchools = {
  "Amplifier:Synergist": "intrinsic", "Amplifier:Augmenter": "intrinsic",
  "Cleric:Priest": "creation", "Cleric:Adjudicator": "creation",
  "Conjurer:Summoner": "spirit", "Conjurer:Illusionist": "spirit",
  "Druid:Shapeshifter": "primal", "Druid:Cultivator": "primal",
  "Elemental Adept:Geo Adept": "elemental", "Elemental Adept:Aqueous Adept": "elemental", "Elemental Adept:Air Adept": "elemental",
  "Elemental Adept:Flame Adept": "elemental", "Elemental Adept:Versatile Adept": "elemental", "Elemental Adept:Steel Adept": "elemental",
  "Magus:Blood Mage": "intrinsic", "Magus:Sorcerer": "elemental", "Magus:Thaumaturge": "arcane", "Magus:Wizard": "arcane"
};
for (const [path, schoolId] of Object.entries(grantedSchools)) {
  const [profession, discipline] = path.split(":");
  assert.equal(magicTreeAccess("Magic", profession, discipline).schoolId, schoolId, `${discipline} must advertise its granted School`);
}

const schoolOnly = purchasedTalentTreePage(schools, { branches: [schoolAccessBranchId("elemental")], leaves: [] });
assert.deepEqual(schoolOnly.map(school => school.id), ["elemental"], "purchased-only view retains purchased School access before a Practice is purchased");
assert.deepEqual(schoolOnly[0].practices, []);

console.log("talent tree search and purchased-only view checks passed");
