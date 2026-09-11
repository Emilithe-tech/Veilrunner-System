import assert from "node:assert/strict";
import test from "node:test";
import { fitHeroViewport } from "../modules/sheets/hero-viewport.mjs";

const sheet = { width: 956, height: 1112 };

test("reference viewport preserves the original sheet size", () => {
  assert.equal(fitHeroViewport(sheet, { width: 3440, height: 1417 }).scale, 1);
});

test("height determines scale across common display sizes", () => {
  for (const [width, height] of [[1920, 1080], [1366, 768], [2560, 1440], [3840, 2160]]) {
    const result = fitHeroViewport(sheet, { width, height });
    assert.equal(result.scale, height / 1417);
    assert.equal(result.height, 1112);
    assert.ok(result.top + result.height * result.scale <= height);
  }
});

test("narrow windows fit the expanded sheet and clamp its position", () => {
  const result = fitHeroViewport({ width: 1536, height: 1112 }, { width: 800, height: 1417 }, { left: 2000, top: 2000 });
  assert.equal(result.scale, 800 / 1536);
  assert.equal(result.left, 0);
  assert.equal(result.top + result.height * result.scale, 1417);
});

test("resizing back restores baseline without accumulating scale", () => {
  const small = fitHeroViewport(sheet, { width: 1366, height: 768 });
  const restored = fitHeroViewport(small, { width: 3440, height: 1417 });
  assert.equal(restored.scale, 1);
  assert.equal(restored.width, sheet.width);
});

test("keeps visible user positions and tolerates an unavailable viewport", () => {
  const positioned = { ...sheet, left: 100, top: 50 };
  const result = fitHeroViewport(positioned, { width: 1920, height: 1080 });
  assert.equal(result.left, 100);
  assert.equal(result.top, 50);
  assert.equal(fitHeroViewport(positioned, { width: 0, height: 0 }), positioned);
});
