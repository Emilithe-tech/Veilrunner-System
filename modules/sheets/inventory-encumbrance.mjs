export const INVENTORY_NEAR_ENCUMBERED_RATIO = 0.8;

/** Build the display state for the inventory carry-weight meter. */
export function inventoryEncumbranceData(weightKg, capacityKg) {
  const weight = Math.max(0, Number(weightKg) || 0);
  const capacity = Math.max(0, Number(capacityKg) || 0);
  const ratio = capacity > 0 ? weight / capacity : weight > 0 ? Number.POSITIVE_INFINITY : 0;
  const state = ratio >= 1
    ? "encumbered"
    : ratio >= INVENTORY_NEAR_ENCUMBERED_RATIO ? "near" : "good";

  return {
    state,
    label: {
      good: "VEILRUNNER.Encumbrance.Good",
      near: "VEILRUNNER.Encumbrance.Near",
      encumbered: "VEILRUNNER.Encumbrance.Encumbered"
    }[state],
    percent: Math.min(100, Number.isFinite(ratio) ? ratio * 100 : 100)
  };
}
