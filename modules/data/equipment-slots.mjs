/** Future trait integration point. No trait names or definitions are inferred. */
export function canDualWieldTwoHandedWeapons(actor) {
  return actor?.getFlag?.("Veilrunner", "dualWieldTwoHanded") === true;
}

export function actorWeaponSlots(actor, item, required, slot) {
  if (item?.type !== "weapon" || item.system?.handedness !== "two"
    || !canDualWieldTwoHandedWeapons(actor)) return required;
  if (["mainHand", "offhand"].includes(slot)) return [slot];
  const system = actor?.system ?? {};
  if (system.equipment?.mainHand === item.id) return ["mainHand"];
  if (system.equipment?.offhand === item.id) return ["offhand"];
  const assigned = system.equipmentAssignments?.find(entry => entry.itemId === item.id)?.slots ?? [];
  return [assigned.includes("mainHand") ? "mainHand" : assigned.includes("offhand") ? "offhand" : "mainHand"];
}

/** Slot compatibility for old rings and explicitly assigned weapon positions. */
export function migrateRingEquipment(source) {
  const equipment = source.equipment;
  const assignments = Array.isArray(source.equipmentAssignments) ? source.equipmentAssignments : [];
  const ring = equipment?.leftRing || assignments.find(entry => entry.slots?.includes("leftRing"))?.itemId;
  const oldRing = equipment?.rightRing || assignments.find(entry => entry.slots?.includes("rightRing"))?.itemId;
  const retainedRing = ring || oldRing;
  if (equipment && Object.hasOwn(equipment, "rightRing")) {
    if (!ring && oldRing) equipment.leftRing = oldRing;
    // A former ring must never become an auxiliary weapon.
    if (!Object.hasOwn(equipment, "auxiliary")) equipment.auxiliary = "";
    delete equipment.rightRing;
  }
  if (Array.isArray(source.equipmentAssignments)) {
    source.equipmentAssignments = assignments.map(entry => ({
      ...entry,
      slots: [...new Set((entry.slots ?? []).flatMap(slot => slot === "rightRing"
        ? entry.itemId === retainedRing ? ["leftRing"] : [] : [slot]))]
    })).filter(entry => entry.slots.length);
  }
  return source;
}

export function weaponRequiredSlots(system) {
  if (system.handedness === "two") return ["mainHand", "offhand"];
  const raw = system.requiredSlots;
  const slots = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? Object.values(raw) : [raw];
  // One-handed weapons have one assigned position; two-handed weapons reserve both hands.
  const selected = slots.filter(slot => ["mainHand", "offhand", "auxiliary"].includes(slot));
  return selected.length === 1 ? selected : ["mainHand"];
}
