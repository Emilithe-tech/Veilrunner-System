import assert from "node:assert/strict";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

// Optional integration with the installed grid classes, without starting Foundry
// or reading a world. Set VEILRUNNER_FOUNDRY_APP to its resources/app directory.
const appRoot = process.env.VEILRUNNER_FOUNDRY_APP;
test("microgrid scene integration with installed Foundry grid geometry", { skip: !appRoot }, async t => {
  const { default: BaseGrid } = await import(pathToFileURL(join(appRoot, "common/grid/base.mjs")));
  const { default: SquareGrid } = await import(pathToFileURL(join(appRoot, "common/grid/square.mjs")));
  function merge(target, updates) {
    for (const [key, value] of Object.entries(updates)) {
      const path = key.split(".");
      let obj = target;
      for (const part of path.slice(0, -1)) obj = obj[part] ??= {};
      if (value && typeof value === "object" && !Array.isArray(value)) merge(obj[path.at(-1)] ??= {}, value);
      else obj[path.at(-1)] = structuredClone(value);
    }
    return target;
  }
  class Rectangle {
    constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); }
  }
  // Only the core Scene lifecycle is stubbed; all grid geometry below comes
  // from the actual installed Foundry classes.
  globalThis.Scene = class {
    constructor(source) {
      this._source = structuredClone(source);
      this.updateSource({});
    }
    updateSource(update) {
      merge(this._source, update);
      Object.assign(this, structuredClone(this._source));
      this.prepareBaseData();
    }
    prepareBaseData() {
      if (!(this.grid instanceof BaseGrid)) this.grid = new SquareGrid(this.grid);
      this.dimensions = this.getDimensions();
    }
    getDimensions() {
      const bounds = this.grid.calculateDimensions(this.width, this.height, this.padding);
      return {
        width: bounds.width, height: bounds.height,
        sceneX: bounds.x - this.shiftX, sceneY: bounds.y - this.shiftY,
        size: this.grid.size, distance: this.grid.distance, distancePixels: this.grid.size / this.grid.distance
      };
    }
    async _preCreate() { return this.rejectCreation ? false : undefined; }
    _onUpdate() {}
  };
  globalThis.PIXI = { Rectangle };
  globalThis.foundry = {
    grid: { BaseGrid, SquareGrid },
    utils: { mergeObject: merge, deepClone: structuredClone }
  };
  globalThis.game = { actors: new Map([["actor", { type: "hero" }]]) };
  const { VeilrunnerScene } = await import("../modules/documents/scene.mjs");
  const source = {
    grid: { type: 1, units: "m", distance: 5, size: 100, style: "solidLines" },
    flags: { Veilrunner: { microgrid: 1 } },
    width: 1234, height: 987, padding: 0.1, shiftX: 17, shiftY: -9, tokens: []
  };

  await t.test("map bounds, padding, shifts and physical distances survive subdivision", () => {
    for (const size of [100, 137]) for (const distance of [1, 2, 5]) {
      const input = structuredClone(source);
      Object.assign(input.grid, { size, distance });
      const before = new Scene(input).dimensions;
      const scene = new VeilrunnerScene(input);
      assert.equal(scene.grid.distance, 0.25);
      assert.equal(scene.grid.size, size * 0.25 / distance);
      assert.equal(scene.dimensions.width, before.width);
      assert.equal(scene.dimensions.height, before.height);
      assert.equal(scene.dimensions.sceneX, before.sceneX);
      assert.equal(scene.dimensions.sceneY, before.sceneY);
      assert.equal(scene.dimensions.distancePixels, before.distancePixels);
      assert.equal(scene.dimensions.rect.width, before.width);
      assert.equal(scene.dimensions.sceneRect.x, before.sceneX);
      assert.equal(scene.dimensions.rows, Math.ceil(before.height / scene.grid.size));
      assert.deepEqual(scene._source.grid, input.grid);
      scene.prepareBaseData();
      assert.equal(scene.grid.size, size * 0.25 / distance);
    }
  });

  await t.test("unconverted scenes keep their original grid until token conversion commits", () => {
    const input = { ...structuredClone(source), flags: {} };
    const scene = new VeilrunnerScene(input);
    assert.equal(scene.useMicrogrid, false);
    assert.equal(scene.grid.size, 100);
    assert.equal(scene.grid.distance, 5);
  });

  await t.test("imported scenes convert embedded tokens and copied scenes remain stable", async () => {
    const input = { ...structuredClone(source), flags: {}, tokens: [
      { _id: "token", actorId: "actor", width: 1, height: 1, depth: 1, x: 100, y: 200, flags: {} }
    ] };
    const scene = new VeilrunnerScene(input);
    await scene._preCreate({}, {}, {});
    assert.equal(scene.useMicrogrid, true);
    assert.equal(scene._source.grid.distance, 5);
    assert.equal(scene._source.grid.style, "diamondPoints");
    assert.equal(scene._source.tokens[0].width, 4);
    assert.equal(scene._source.tokens[0].x, 140);
    const copied = new VeilrunnerScene(scene._source);
    await copied._preCreate({}, {}, {});
    assert.deepEqual(copied._source, scene._source);
  });

  await t.test("scene creation respects cancellation and empty-scene activation redraws", async () => {
    const scene = new VeilrunnerScene({ ...structuredClone(source), flags: {} });
    scene.rejectCreation = true;
    assert.equal(await scene._preCreate({}, {}, {}), false);
    assert.equal(scene.useMicrogrid, false);
    let draws = 0;
    globalThis.canvas = { scene, draw() { draws++; } };
    scene._onUpdate({ flags: { Veilrunner: { microgrid: 1 } } }, {}, "gm");
    assert.equal(draws, 1);
    // Core handles the redraw when the same update also changes tokens.
    scene._onUpdate({ flags: { Veilrunner: { microgrid: 1 } }, tokens: [{}] }, {}, "gm");
    assert.equal(draws, 1);
  });
});
