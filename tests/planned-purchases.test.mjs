import test from "node:test";
import assert from "node:assert/strict";
import { plannedPurchases } from "../modules/sheets/planned-purchases.mjs";
import { progressionPresentation } from "../modules/sheets/progression-view.mjs";

const catalog = {
  skills: [{ id: "physical", name: "Physical", practices: [
    { id: "athletics", name: "Athletics", spells: [{ id: "run", name: "Running" }, { id: "climb", name: "Climbing" }] }
  ] }],
  magic: [{ id: "arcane", name: "Arcane", practices: [
    { id: "illusion", name: "Illusion", spells: [{ id: "veil", name: "Veil" }] }
  ] }]
};
const hero = {
  level: 1, attributes: { physical: { agility: 2 } },
  talentTree: { branches: ["athletics"], leaves: [{ id: "run", rank: 1 }] },
  qualitiesTaken: [{ definitionId: "existing-perk", name: "Alert", tier: "Minor" }]
};
const level2 = {
  attributes: { physical: { agility: 3 } },
  talentTree: { branches: ["athletics"], leaves: [{ id: "run", rank: 2 }, { id: "climb", rank: 1 }] },
  qualitiesTaken: [...hero.qualitiesTaken, { definitionId: "new-perk", name: "Lucky", tier: "Moderate" }]
};

test("saved builds expose attribute, new skill, rank increase and perk purchases", () => {
  const plans = { 2: { state: level2 } };
  const original = structuredClone({ hero, plans });
  const items = plannedPurchases(hero, plans, catalog).get(2);
  assert.deepEqual(items.map(item => item.name), [
    "+1 Agility", "+ Running level 1 → 2", "+ Climbing (new)", "+ Lucky"
  ]);
  assert.equal(items[0].increase, "2 → 3");
  assert.equal(items[0].detail, "");
  assert.ok(items.every(item => item.plannedPurchase && item.planLevel === 2));
  assert.deepEqual({ hero, plans }, original);
});

test("later levels show only incremental purchases, in numeric level order", () => {
  const level3 = structuredClone(level2);
  level3.attributes.physical.agility = 4;
  level3.talentTree.leaves[0].rank = 3;
  const plans = { 3: { state: level3 }, 2: { state: level2 }, 1: { state: level3 } };
  const items = plannedPurchases(hero, plans, catalog).get(3);
  assert.deepEqual(items.map(item => item.name), ["+1 Agility", "+ Running level 2 → 3"]);
  assert.equal(plannedPurchases(hero, plans, catalog).has(1), false);
});

test("owned improvements and unchanged or decreased ranks do not become purchases", () => {
  const owned = { ...hero, attributes: { physical: { agility: 4 } }, talentTree: level2.talentTree, qualitiesTaken: level2.qualitiesTaken };
  assert.deepEqual(plannedPurchases(owned, { 2: { state: level2 } }, catalog).get(2), []);
});

test("talents and spells retain distinct categories and missing catalog entries remain explicit", () => {
  const state = { talentTree: { branches: ["illusion"], leaves: [{ id: "veil", rank: 2 }, { id: "missing", rank: 1 }] } };
  const items = plannedPurchases(hero, { 2: { state } }, catalog).get(2);
  assert.deepEqual(items.map(item => item.kind), ["talent", "spell", "skill"]);
  assert.equal(items[1].name, "+ Veil (new)");
  assert.equal(items[1].detail, "Level 2");
  assert.equal(items[2].name, "+ Unavailable skill or spell (new)");
  assert.equal(items[2].detail, "missing");
});

test("perk identity distinguishes identical names and supports manually authored perks", () => {
  const custom = { name: "Custom", tier: "Minor", description: "Authored rule" };
  const owned = { ...hero, qualitiesTaken: [...hero.qualitiesTaken, custom] };
  const state = { qualitiesTaken: [...owned.qualitiesTaken, { definitionId: "different-perk", name: "Alert" }, { name: "New custom", tier: "Minor" }] };
  assert.deepEqual(plannedPurchases(owned, { 2: { state } }).get(2).map(item => item.name), ["+ Alert", "+ New custom"]);
});

test("perk pool uses tier costs and milestone capacity rather than editable point fields", () => {
  const view = progressionPresentation({ level: 4, qualitiesTaken: [{ tier: "Moderate" }, { tier: "Major" }], perkPoints: { available: 999 } });
  const perk = view.pools.find(pool => pool.key === "perk");
  assert.deepEqual([perk.available, perk.spent, perk.total, perk.gain, perk.icon, perk.derived], [4, 6, 10, 3, "fa-medal", true]);
  assert.equal(progressionPresentation({ level: 9 }).pools.find(pool => pool.key === "perk").gain, 4);
});

test("saved drafts replace legacy preview rows for that level and retain the three-level limit", () => {
  const view = progressionPresentation(hero, [{ level: 2, kind: "skill", name: "Legacy" }], { 2: { state: level2 }, 9: { state: level2 } }, catalog);
  assert.equal(view.levels.length, 3);
  assert.ok(view.levels[0].items.every(item => item.plannedPurchase));
  assert.ok(!view.levels[0].items.some(item => item.name === "Legacy"));
  assert.equal(view.levels[0].items.find(item => item.kind === "perk").icon, "fa-medal");
});
