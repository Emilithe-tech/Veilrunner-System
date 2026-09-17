import assert from "node:assert/strict";
import test from "node:test";
import {
  microgridScale, microgridTokenUpdate, migrateSceneMicrogrid, registerMicrogridMigration
} from "../modules/canvas/microgrid.mjs";

const grid = { type: 1, distance: 5, units: "m", size: 100, style: "solidLines" };
const originalToken = { _id: "hero", actorId: "actor", width: 1, height: 1, depth: 1, x: 100, y: 200, flags: {} };

function merge(target, update) {
  for (const [key, value] of Object.entries(update)) {
    const parts = key.split(".");
    let parent = target;
    for (const part of parts.slice(0, -1)) parent = parent[part] ??= {};
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merge(parent[parts.at(-1)] ??= {}, value);
    } else parent[parts.at(-1)] = structuredClone(value);
  }
  return target;
}

test("subdivision preserves pixels per metre for old, new and non-integer calibrations", () => {
  for (const distance of [0.25, 1, 1.5, 2, 5]) {
    const source = { ...grid, distance, size: 137 };
    const prepared = microgridScale(source);
    assert.equal(prepared.distance, 0.25);
    assert.equal(prepared.size / prepared.distance, source.size / source.distance);
    assert.equal(source.size, 137);
    assert.equal(source.distance, distance);
  }
});

test("gridless, hex, non-metric and already finer grids remain untouched", () => {
  for (const change of [{ type: 0 }, { type: 2 }, { units: "ft" }, { distance: 0.1 }, { distance: Infinity }, { size: 0 }]) {
    assert.equal(microgridScale({ ...grid, ...change }), null);
  }
  assert.equal(microgridScale(null), null);
  assert.equal(microgridScale({ ...grid, units: " Metres " }).distance, 0.25);
});

test("existing standard humanoids become one metre while keeping their centre and original dimensions", () => {
  for (const type of ["hero", "npc"]) {
    const update = microgridTokenUpdate(originalToken, type, grid);
    assert.equal(update.width, 4);
    assert.equal(update.height, 4);
    assert.equal(update.depth, 4);
    assert.equal(update.x, 140);
    assert.equal(update.y, 240);
    const smallCell = microgridScale(grid).size;
    assert.equal(update.x + update.width * smallCell / 2, originalToken.x + originalToken.width * grid.size / 2);
    assert.equal(update.y + update.height * smallCell / 2, originalToken.y + originalToken.height * grid.size / 2);
    assert.deepEqual(update["flags.Veilrunner.microgridOriginal"], { width: 1, height: 1, depth: 1, x: 100, y: 200 });
  }
  assert.equal(originalToken.width, 1);
  assert.deepEqual(originalToken.flags, {});
});

test("odd pixel sizes preserve humanoid centres to within half a pixel", () => {
  const source = { ...grid, size: 137, distance: 2 };
  const update = microgridTokenUpdate(originalToken, "hero", source);
  const expectedCentre = originalToken.x + source.size / 2;
  assert.ok(Math.abs(update.x + update.width * microgridScale(source).size / 2 - expectedCentre) <= 0.5);
  assert.ok(Number.isInteger(update.x));
});

test("custom footprints, vehicles and missing actors preserve physical dimensions", () => {
  for (const [type, width, height] of [["hero", 2, 3], ["npc", 0.5, 0.5], ["vehicle", 1, 1], [undefined, 1, 1]]) {
    const token = { ...originalToken, width, height, depth: 2 };
    const update = microgridTokenUpdate(token, type, grid);
    assert.equal(update.width * 0.25, width * grid.distance);
    assert.equal(update.height * 0.25, height * grid.distance);
    assert.equal(update.depth * 0.25, 2 * grid.distance);
    assert.equal(update.x, undefined);
    assert.equal(update.y, undefined);
  }
});

test("prototype dimensions produce the same physical size on differently calibrated maps", () => {
  const token = { ...originalToken, width: 2, height: 3, depth: 2 };
  for (const distance of [1, 2, 5]) {
    const update = microgridTokenUpdate(token, "creature", { ...grid, distance }, { fromPrototype: true });
    assert.equal(update.width, 8);
    assert.equal(update.height, 12);
    assert.equal(update.depth, 8);
    assert.equal(update.x, undefined);
    assert.equal(update.y, undefined);
    assert.equal(update["flags.Veilrunner.microgridOriginal"], undefined);
  }
});

test("converted and copied tokens do not grow again", () => {
  const token = merge(structuredClone(originalToken), microgridTokenUpdate(originalToken, "hero", grid));
  assert.equal(microgridTokenUpdate(token, "hero", grid), null);
  assert.equal(microgridTokenUpdate(token, "hero", { ...grid, distance: 1 }, { fromPrototype: true }), null);
});

function sceneFixture({ sourceGrid = grid, actorType = "hero", failUpdate = false, failRegions = false } = {}) {
  const source = { grid: structuredClone(sourceGrid), flags: {}, tokens: [structuredClone(originalToken)] };
  const calls = [];
  return {
    _source: source, flags: source.flags, name: "Test scene", calls,
    tokens: [{ id: "hero", _source: source.tokens[0], actor: { type: actorType } }],
    async clearMovementHistories() { calls.push("clear"); },
    async update(update) {
      calls.push(structuredClone(update));
      if (failUpdate) throw new Error("update failed");
      for (const token of update.tokens ?? []) merge(source.tokens.find(entry => entry._id === token._id), token);
      const { tokens, ...sceneUpdate } = update;
      merge(source, sceneUpdate);
    },
    async updateRegionShapeConstraints() { calls.push("constraints"); },
    async updateTokenRegions() {
      calls.push("regions");
      if (failRegions) { failRegions = false; throw new Error("regions failed"); }
    },
    async setFlag(scope, key, value) {
      calls.push("complete");
      merge(source, { [`flags.${scope}.${key}`]: value });
    }
  };
}

globalThis.ui = { notifications: { error() {} } };

test("existing scene conversion atomically activates the grid and footprints and is idempotent", async () => {
  const scene = sceneFixture();
  await migrateSceneMicrogrid(scene);
  assert.equal(scene.calls[0], "clear");
  assert.equal(scene.calls[1]["flags.Veilrunner.microgrid"], 1);
  assert.equal(scene.calls[1].tokens[0].width, 4);
  assert.deepEqual(scene.calls.slice(2), ["constraints", "regions", "complete"]);
  assert.deepEqual(scene._source.grid, { ...grid, style: "diamondPoints" });
  assert.deepEqual(scene.flags.Veilrunner.microgridOriginalGrid, grid);
  const count = scene.calls.length;
  await migrateSceneMicrogrid(scene);
  assert.equal(scene.calls.length, count);
});

test("a rejected conversion leaves activation and completion flags unset", async t => {
  t.mock.method(console, "error", () => {});
  const scene = sceneFixture({ failUpdate: true });
  await migrateSceneMicrogrid(scene);
  assert.equal(scene.flags.Veilrunner, undefined);
  assert.deepEqual(scene._source.tokens[0], originalToken);
  assert.equal(scene.calls.includes("complete"), false);
});

test("region finalization retries without multiplying already converted tokens", async t => {
  t.mock.method(console, "error", () => {});
  const scene = sceneFixture({ failRegions: true });
  await migrateSceneMicrogrid(scene);
  assert.equal(scene.flags.Veilrunner.microgrid, 1);
  assert.equal(scene.flags.Veilrunner.microgridMigration, undefined);
  await migrateSceneMicrogrid(scene);
  assert.equal(scene.flags.Veilrunner.microgridMigration, 1);
  assert.equal(scene._source.tokens[0].width, 4);
  assert.equal(scene.calls.filter(call => typeof call === "object").length, 1);
});

test("unsupported scenes require no writes or movement-history changes", async () => {
  const scene = sceneFixture({ sourceGrid: { ...grid, type: 0 } });
  await migrateSceneMicrogrid(scene);
  assert.deepEqual(scene.calls, []);
});

test("only the elected GM performs startup conversion", async () => {
  const hooks = {};
  globalThis.Hooks = { once: (key, fn) => hooks[key] = fn, on: (key, fn) => hooks[key] = fn };
  const scene = sceneFixture();
  globalThis.game = { user: { id: "player", isGM: false }, users: { activeGM: { id: "gm" } }, scenes: [scene] };
  registerMicrogridMigration();
  await hooks.ready();
  assert.equal(scene.calls.length, 0);
  game.user = { id: "other-gm", isGM: true };
  await hooks.ready();
  assert.equal(scene.calls.length, 0);
  game.user.id = "gm";
  await hooks.ready();
  assert.equal(scene.flags.Veilrunner.microgridMigration, 1);
});

// Document seams: these test sizing before placement and source persistence,
// not Foundry rendering, permissions, networking or browser lifecycle timing.
class TokenBase {
  constructor(source, options = {}) {
    this._source = merge({ width: 1, height: 1, depth: 1, flags: {} }, structuredClone(source));
    this.flags = this._source.flags;
    this.parent = options.parent;
  }
  updateSource(update) { merge(this._source, update); }
  async _preCreate() { return this.rejectCreation ? false : undefined; }
}
globalThis.foundry = {
  documents: { TokenDocument: TokenBase }, data: { fields: {} }, abstract: { TypeDataModel: class {} }
};
globalThis.Actor = class {
  async getTokenDocument(data, options) {
    return new TokenBase(merge(structuredClone(this.prototype), data), options);
  }
};
const { VeilrunnerToken } = await import("../modules/documents/token.mjs");
const { VeilrunnerActor } = await import("../modules/documents/actor.mjs");

test("actor drops have their final dimensions before Foundry computes the drop position", async () => {
  const actor = new VeilrunnerActor();
  actor.type = "hero";
  actor.prototype = structuredClone(originalToken);
  const parent = { useMicrogrid: true, _source: { grid } };
  const token = await actor.getTokenDocument({}, { parent });
  assert.equal(token._source.width, 4);
  assert.equal(token._source.flags.Veilrunner.microgrid, 1);
  assert.equal(actor.prototype.width, 1);
  const placed = new VeilrunnerToken(token._source, { parent });
  await placed._preCreate(token._source, {}, {});
  assert.equal(placed._source.width, 4);
  const ordinary = await actor.getTokenDocument({}, { parent: { useMicrogrid: false } });
  assert.equal(ordinary._source.width, 1);
});

test("direct token creation keeps explicitly supplied native grid dimensions", async () => {
  const data = { width: 8, height: 12, depth: 0 };
  const token = new VeilrunnerToken(data, { parent: { useMicrogrid: true } });
  await token._preCreate(data, {}, {});
  assert.equal(token._source.width, 8);
  assert.equal(token._source.height, 12);
  assert.equal(token._source.depth, 0);
  assert.equal(token.flags.Veilrunner.microgrid, 1);
});

test("direct creation defaults to one metre and respects core cancellation", async () => {
  const token = new VeilrunnerToken({}, { parent: { useMicrogrid: true } });
  await token._preCreate({}, {}, {});
  assert.equal(token._source.width, 4);
  assert.equal(token._source.height, 4);
  assert.equal(token._source.depth, 4);
  const rejected = new VeilrunnerToken({}, { parent: { useMicrogrid: true } });
  rejected.rejectCreation = true;
  assert.equal(await rejected._preCreate({}, {}, {}), false);
  assert.equal(rejected._source.width, 1);
});
