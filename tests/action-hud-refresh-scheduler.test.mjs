import assert from "node:assert/strict";
import test from "node:test";
import { createHudRefreshScheduler } from "../modules/apps/action-hud/refresh-scheduler.mjs";

function fakeTimers() {
  let callback = null;
  return {
    setTimeout: next => { callback = next; return 1; },
    clearTimeout: () => { callback = null; },
    flush: () => callback?.()
  };
}

test("HUD refresh scheduler merges partial invalidations in one debounce frame", () => {
  const timers = fakeTimers();
  const refreshes = [];
  const refresh = createHudRefreshScheduler(parts => refreshes.push(parts), { setTimeoutFn: timers.setTimeout, clearTimeoutFn: timers.clearTimeout });
  refresh(["economy"]);
  refresh(["target"]);
  timers.flush();
  assert.deepEqual(refreshes, [["economy", "target"]]);
});

test("HUD full refresh supersedes pending partial invalidations", () => {
  const timers = fakeTimers();
  const refreshes = [];
  const refresh = createHudRefreshScheduler(parts => refreshes.push(parts), { setTimeoutFn: timers.setTimeout, clearTimeoutFn: timers.clearTimeout });
  refresh(["economy"]);
  refresh();
  refresh(["target"]);
  timers.flush();
  assert.deepEqual(refreshes, [null]);
});
