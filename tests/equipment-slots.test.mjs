import test from "node:test";
import assert from "node:assert/strict";
import { migrateRingEquipment, weaponRequiredSlots, actorWeaponSlots } from "../modules/data/equipment-slots.mjs";

test("future dual two-handed flag releases the secondary hand only when explicitly enabled", () => {
  const item = { id: "heavy", type: "weapon", system: { handedness: "two" } };
  const required = ["mainHand", "offhand"];
  assert.deepEqual(actorWeaponSlots({}, item, required, "offhand"), required);
  const actor = { getFlag: (scope, key) => scope === "Veilrunner" && key === "dualWieldTwoHanded", system: {} };
  assert.deepEqual(actorWeaponSlots(actor, item, required, "mainHand"), ["mainHand"]);
  assert.deepEqual(actorWeaponSlots(actor, item, required, "offhand"), ["offhand"]);
  assert.deepEqual(actorWeaponSlots(actor, item, required, "auxiliary"), ["mainHand"]);
  actor.system.equipmentAssignments = [{ itemId: "heavy", slots: ["offhand"] }];
  assert.deepEqual(actorWeaponSlots(actor, item, required), ["offhand"]);
  assert.deepEqual(actorWeaponSlots(actor, { ...item, system: { handedness: "one" } }, ["mainHand"], "offhand"), ["mainHand"]);
});

test("one-handed weapon positions persist and two-handed weapons reserve both hands", () => {
  for (const slot of ["mainHand", "offhand", "auxiliary"]) {
    assert.deepEqual(weaponRequiredSlots({ handedness: "one", requiredSlots: [slot] }), [slot]);
  }
  assert.deepEqual(weaponRequiredSlots({ handedness: "two", requiredSlots: ["auxiliary"] }), ["mainHand", "offhand"]);
  assert.deepEqual(weaponRequiredSlots({ handedness: "one", requiredSlots: ["mainHand", "offhand"] }), ["mainHand"]);
});

test("a former right ring moves to an empty ring slot without becoming auxiliary", () => {
  const source = { equipment: { leftRing: "", rightRing: "ring-2", auxiliary: "focus" },
    equipmentAssignments: [{ itemId: "ring-2", slots: ["rightRing"] }] };
  migrateRingEquipment(source);
  assert.deepEqual(source.equipment, { leftRing: "ring-2", auxiliary: "focus" });
  assert.deepEqual(source.equipmentAssignments, [{ itemId: "ring-2", slots: ["leftRing"] }]);
  assert.deepEqual(migrateRingEquipment(structuredClone(source)), source);
});

test("an occupied ring wins over the retired slot in both storage representations", () => {
  const source = { equipment: { leftRing: "ring-1", rightRing: "ring-2" },
    equipmentAssignments: [{ itemId: "ring-1", slots: ["leftRing"] }, { itemId: "ring-2", slots: ["rightRing"] }] };
  migrateRingEquipment(source);
  assert.deepEqual(source.equipment, { leftRing: "ring-1", auxiliary: "" });
  assert.deepEqual(source.equipmentAssignments, [{ itemId: "ring-1", slots: ["leftRing"] }]);
});

test("assignment-only rings migrate and unrelated partial updates stay partial", () => {
  assert.deepEqual(migrateRingEquipment({ equipmentAssignments: [{ itemId: "ring", slots: ["rightRing"] }] }),
    { equipmentAssignments: [{ itemId: "ring", slots: ["leftRing"] }] });
  assert.deepEqual(migrateRingEquipment({ equipment: { mainHand: "weapon" } }), { equipment: { mainHand: "weapon" } });
});
