import test from "node:test";
import assert from "node:assert/strict";
import { progressionPresentation } from "../modules/sheets/progression-view.mjs";

test("levels retain at least two digits without truncation", () => {
  assert.equal(progressionPresentation({ level: 1 }).level, "01");
  assert.equal(progressionPresentation({ level: 12 }).level, "12");
  assert.equal(progressionPresentation({ level: 100 }).level, "100");
});

test("gains and spent points use the current progression rules", () => {
  const view = progressionPresentation({ level: 1, attributePoints: { total: 11, available: 4 } });
  assert.deepEqual(view.pools.map(pool => pool.gain), [11, 1, 10]);
  assert.equal(view.pools[0].spent, 7);
  assert.equal(view.levels[0].xp, "500");
  assert.equal(view.levels[1].xp, "1,050");
});

test("future plans preserve saved order, indices, and names without inventing purchases", () => {
  const plan = [{ level: 2, kind: "skill", name: "Athletics" }, { level: 1, kind: "talent", name: "Past" }, { level: 2, kind: "attribute", name: "Agility" }];
  const view = progressionPresentation({ level: 1 }, plan);
  assert.deepEqual(view.levels[0].items.map(item => [item.name, item.index]), [["Athletics", 0], ["Agility", 2]]);
  assert.deepEqual(view.levels[1].items, []);
  assert.equal(plan.length, 3);
});

test("sheet preview shows only the next three levels without removing later plans", () => {
  const plan = [{ level: 20, kind: "skill", name: "Future purchase" }];
  const view = progressionPresentation({ level: 4 }, plan);
  assert.deepEqual(view.levels.map(entry => entry.level), [5, 6, 7]);
  assert.deepEqual(plan, [{ level: 20, kind: "skill", name: "Future purchase" }]);
});
