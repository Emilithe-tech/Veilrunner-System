import test from "node:test";
import assert from "node:assert/strict";
import { panModeFor, panModeUpdate, sharesPanInformation } from "../modules/helpers/pan.mjs";
import { getPanState, panFidelity } from "../modules/apps/action-hud/pan.mjs";
import { PAN_STATE } from "../modules/apps/action-hud/constants.mjs";
import { canSeeEffect } from "../modules/apps/action-hud/visibility.mjs";

test("existing linked and unlinked heroes retain their PAN modes", () => {
  assert.equal(panModeFor({ networkLinked: true }), "on");
  assert.equal(panModeFor({ networkLinked: false }), "off");
  assert.equal(panModeFor({ networkLinked: false, panSilent: true }), "off");
  assert.equal(panModeUpdate("invalid"), null);
});

test("Silent receives PAN information while withholding its own", () => {
  const silent = { id: "silent", system: { networkLinked: true, panSilent: true } };
  const broadcasting = { id: "on", system: { networkLinked: true } };
  assert.equal(getPanState(silent, null), PAN_STATE.STABLE);
  assert.equal(sharesPanInformation(silent.system), false);
  assert.equal(panFidelity(silent, broadcasting, null), "exact");
  assert.equal(panFidelity(broadcasting, silent, null), "observable");
});

test("switching modes sets both connection and sharing state", () => {
  assert.deepEqual(panModeUpdate("silent"), { "system.networkLinked": true, "system.panSilent": true });
  assert.deepEqual(panModeUpdate("on"), { "system.networkLinked": true, "system.panSilent": false });
  assert.deepEqual(panModeUpdate("off"), { "system.networkLinked": false, "system.panSilent": false });
});

test("Silent withholds PAN effects while preserving observable effects", () => {
  const actor = { id: "silent", system: { panSilent: true }, testUserPermission: () => false };
  const options = { actor, viewer: { isGM: false }, viewerActor: { id: "viewer" }, panState: PAN_STATE.STABLE };
  const effect = { disabled: false, flags: { Veilrunner: { visibility: { disclosure: "pan-telemetry" } } } };
  assert.equal(canSeeEffect(effect, options), false);
  actor.system.panSilent = false;
  assert.equal(canSeeEffect(effect, options), true);
  actor.system.panSilent = true;
  effect.flags.Veilrunner.visibility.disclosure = "observable";
  assert.equal(canSeeEffect(effect, options), true);
});
