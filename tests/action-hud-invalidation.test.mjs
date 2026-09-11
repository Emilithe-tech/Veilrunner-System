import assert from "node:assert/strict";
import test from "node:test";
import { hudRefreshPartsForActor } from "../modules/apps/action-hud/invalidation.mjs";

test("HUD actor changes refresh its dependent views", () => {
  assert.deepEqual(hudRefreshPartsForActor({ actorId: "hero", hudActorId: "hero" }), ["self", "workspace", "economy", "party"]);
});

test("target and party changes refresh only their affected HUD views", () => {
  assert.deepEqual(hudRefreshPartsForActor({ actorId: "target", hudActorId: "hero", targetActorIds: ["target"], partyActorIds: ["friend"] }), ["target", "workspace"]);
  assert.deepEqual(hudRefreshPartsForActor({ actorId: "friend", hudActorId: "hero", targetActorIds: ["target"], partyActorIds: ["friend"] }), ["party"]);
});

test("unrelated actor changes do not invalidate the HUD", () => {
  assert.deepEqual(hudRefreshPartsForActor({ actorId: "npc", hudActorId: "hero", targetActorIds: ["target"], partyActorIds: ["friend"] }), []);
});
