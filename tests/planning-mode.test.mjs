import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PLANNING_STEPS, normalizePlanningLevel, planningState, planningValidation, saveLevelPlan } from "../modules/apps/chargen/planning-mode.mjs";
import { renderChargenHeader } from "../modules/apps/chargen/shell.mjs";
import { renderReviewStatus } from "../modules/apps/chargen/review-view.mjs";

test("planning validation renders chargen navigation and review status", () => {
  globalThis.foundry = { utils: { escapeHTML: value => String(value).replaceAll("<", "&lt;") } };
  const steps = PLANNING_STEPS.map(key => ({ key, label: key, icon: "" }));
  const validation = planningValidation(8);
  assert.match(renderChargenHeader(steps, 0, validation, [{ label: "Planning", keys: PLANNING_STEPS }]), /attributes/);
  assert.match(renderReviewStatus(validation), /Level 8 draft/);
});

test("planner supports future levels beyond the sheet preview", () => {
  assert.equal(normalizePlanningLevel(4), 5);
  assert.equal(normalizePlanningLevel(4, 2), 5);
  assert.equal(normalizePlanningLevel(4, 25), 25);
  assert.deepEqual(PLANNING_STEPS, ["attributes", "talents", "review"]);
});
test("reopening a level restores an independent draft", () => {
  const base = { attributes: { agility: 2 } };
  const plans = { 8: { state: { attributes: { agility: 4 } } } };
  const reopened = planningState(base, plans, 8);
  assert.equal(reopened.attributes.agility, 4);
  assert.equal(reopened.startingLevel, 8);
  reopened.attributes.agility = 6;
  assert.equal(plans[8].state.attributes.agility, 4);
  assert.equal(planningState(base, plans, 9).attributes.agility, 2);
});
test("saving only writes the selected plan flag, without applying the hero build", async () => {
  const writes = [];
  const actor = { isOwner: true, system: { level: 2 }, setFlag: async (...args) => writes.push(args), update: () => assert.fail("Must not update hero"), createEmbeddedDocuments: () => assert.fail("Must not grant items") };
  const state = { startingLevel: 7, attributes: { agility: 5 } };
  await saveLevelPlan(actor, 7, state);
  state.attributes.agility = 9;
  assert.deepEqual(writes, [["Veilrunner", "levelPlans.7", { state: { startingLevel: 7, attributes: { agility: 5 } } }]]);
  assert.equal(actor.system.level, 2);
  await assert.rejects(saveLevelPlan(actor, 2, state));
  await assert.rejects(saveLevelPlan({ ...actor, isOwner: false }, 7, state));
});
test("sheet planner entry points use chargen planning, not the old inline editor", () => {
  const template = fs.readFileSync(new URL("../templates/actor/hero/parts/progression.hbs", import.meta.url), "utf8");
  assert.equal((template.match(/data-action="openLevelPlanner"/g) ?? []).length, 2);
  assert.ok(!template.includes('data-action="toggleProgressionPlanner"'));
  const sheet = fs.readFileSync(new URL("../modules/sheets/hero-sheet.mjs", import.meta.url), "utf8");
  assert.match(sheet, /openCharacterCreation\(this.actor, \{ mode: "planning", planningLevel: level/);
});
