import test from "node:test";
import assert from "node:assert/strict";
import { progressionPresentation, progressionExperience, levelXpFromTotal } from "../modules/sheets/progression-view.mjs";

test("total XP edits convert to stored level XP without changing completed levels", () => {
  assert.equal(levelXpFromTotal(2, 775), 275);
  assert.equal(levelXpFromTotal(2, 500), 0);
  assert.equal(levelXpFromTotal(2, 1200), 700);
  assert.equal(levelXpFromTotal(2, 100), 0);
  assert.equal(levelXpFromTotal(2, "", 75), 75);
  assert.equal(levelXpFromTotal(2, "invalid", 75), 75);
  assert.equal(progressionExperience(2, 275, "total").minimum, 500);
});

test("XP modes show cumulative thresholds and the current level budget", () => {
  const level = progressionExperience(2, 0);
  const total = progressionExperience(2, 0, "total");
  assert.deepEqual([level.value, level.maximum, level.percent], [0, 550, 0]);
  assert.deepEqual([total.value, total.maximum], [500, 1050]);
  assert.equal(total.maximumLabel, "1,050");
  assert.equal(total.percent, 500 / 1050 * 100);
  assert.deepEqual([progressionExperience(2, 275).value, progressionExperience(2, 275).percent], [275, 50]);
  assert.equal(progressionExperience(2, 275, "total").value, 775);
});

test("XP display preserves overflow and supports levels beyond two digits", () => {
  const overflow = progressionExperience(2, 900, "total");
  assert.deepEqual([overflow.value, overflow.maximum, overflow.percent], [1400, 1050, 100]);
  const level = progressionExperience(1000, 0);
  const total = progressionExperience(1000, 0, "total");
  assert.equal(total.maximum - total.value, level.maximum);
  assert.equal(progressionExperience(1, -1).value, 0);
});

test("levels retain at least two digits without truncation", () => {
  assert.equal(progressionPresentation({ level: 1 }).level, "01");
  assert.equal(progressionPresentation({ level: 12 }).level, "12");
  assert.equal(progressionPresentation({ level: 100 }).level, "100");
  assert.deepEqual(progressionPresentation({ level: 8 }).levels.map(entry => entry.digits), ["09", "10", "11"]);
});

test("timeline fills actual XP intervals and implementation requires an earned next-level draft", () => {
  const plans = { 2: { state: {} }, 3: { state: {} } };
  const before = progressionPresentation({ level: 1, experience: { value: 450 } }, [], plans);
  assert.deepEqual(before.levels.map(entry => entry.columnPercent), [90, 0, 0]);
  assert.ok(before.levels.every(entry => !entry.canImplement));
  const ready = progressionPresentation({ level: 1, experience: { value: 775 } }, [], plans);
  assert.deepEqual(ready.levels.map(entry => entry.columnPercent), [100, 50, 0]);
  assert.deepEqual(ready.levels.map(entry => entry.canImplement), [true, false, false]);
  assert.equal(progressionPresentation({ level: 1, experience: { value: 775 } }).levels[0].canImplement, false);
});

test("planner columns reach their diamond halfway and their separator at the level threshold", () => {
  const view = xp => progressionPresentation({ level: 3, experience: { value: xp } }).levels.map(entry => entry.columnPercent);
  assert.deepEqual(view(0), [0, 0, 0]);
  assert.deepEqual(view(300), [50, 0, 0]);
  assert.deepEqual(view(600), [100, 0, 0]);
  assert.deepEqual(view(925), [100, 50, 0]);
  assert.deepEqual(view(1250), [100, 100, 0]);
  assert.deepEqual(view(1950), [100, 100, 100]);
});

test("gains and spent points use the current progression rules", () => {
  const view = progressionPresentation({ level: 1, attributePoints: { total: 11, available: 4 } });
  assert.deepEqual(view.pools.map(pool => pool.gain), [11, 1, 10, 0]);
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

test("expanded planner includes five future levels and milestones use reached-level rewards", () => {
  const view = progressionPresentation({ level: 4 }, [], {}, {}, 5);
  assert.deepEqual(view.levels.map(entry => entry.level), [5, 6, 7, 8, 9]);
  assert.deepEqual(view.milestones.map(entry => entry.level), [1, 2, 3, 4]);
  assert.deepEqual(view.milestones.map(entry => entry.current), [false, false, false, true]);
  assert.equal(view.milestones[0].starting, true);
  assert.deepEqual(view.milestones.at(-1).gains.map(entry => entry.gain),
    progressionPresentation({ level: 3 }).pools.map(entry => entry.gain));
  assert.ok(view.milestones.every(entry => !Object.hasOwn(entry, "date") && !Object.hasOwn(entry, "purchases")));
});

test("journey grows future levels without changing the three current-and-next diamonds", () => {
  const first = progressionPresentation({ level: 3 }, [], {}, {}, 6);
  const more = progressionPresentation({ level: 3 }, [], {}, {}, 12);
  assert.deepEqual(first.roadmap.map(entry => entry.level), [3, 4, 5]);
  assert.deepEqual(more.roadmap, first.roadmap);
  assert.deepEqual(first.journey.map(entry => entry.level), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(more.journey.slice(0, 9), first.journey);
  assert.equal(more.journey.at(-1).level, 15);
  assert.ok(first.journey.slice(0, 3).every(entry => entry.reached && !entry.future));
  assert.ok(first.journey.slice(3).every(entry => entry.future && !entry.reached));
});
