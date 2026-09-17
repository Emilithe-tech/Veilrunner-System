import test from "node:test";
import assert from "node:assert/strict";
import { unscaleHeroRect } from "../modules/sheets/hero-viewport.mjs";

for (const scale of [0.5, 0.8, 1, 1.5]) {
  test(`animation bounds and travel stay in CSS units at scale ${scale}`, () => {
    const screen = { left: 120, top: 80, right: 420, bottom: 280, width: 300, height: 200 };
    const scaled = Object.fromEntries(Object.entries(screen).map(([key, value]) => [key, value * scale]));
    assert.deepEqual(unscaleHeroRect(scaled, scale), screen);
    const moved = unscaleHeroRect({ ...scaled, left: scaled.left + 40 * scale }, scale);
    assert.equal(moved.left - screen.left, 40);
  });
}
test("missing or invalid scale preserves bounds", () => {
  const rect = { left: 1, top: 2, right: 4, bottom: 6, width: 3, height: 4 };
  for (const scale of [undefined, 0, -1, NaN]) assert.deepEqual(unscaleHeroRect(rect, scale), rect);
});
