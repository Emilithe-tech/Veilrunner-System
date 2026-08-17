/** Calculate durability after a number of item uses without mutating a document. */
export function nextDurabilityState(durability = {}, uses = 1) {
  const max = Math.max(0, Math.trunc(Number(durability.max) || 0));
  const value = Math.max(0, Math.min(max, Math.trunc(Number(durability.value) || 0)));
  const wearRate = Math.max(1, Math.trunc(Number(durability.wearRate) || 1));
  const wearAmount = Math.max(0, Math.trunc(Number(durability.wearAmount) || 0));
  const addedUses = Math.max(0, Math.trunc(Number(uses) || 0));
  const totalProgress = Math.max(0, Math.trunc(Number(durability.wearProgress) || 0)) + addedUses;
  const wearEvents = Math.floor(totalProgress / wearRate);
  return {
    value: Math.max(0, value - (wearEvents * wearAmount)),
    max,
    wearRate,
    wearAmount,
    wearProgress: totalProgress % wearRate
  };
}

/** Apply configured wear to an owned physical Item. */
export async function applyItemWear(item, uses = 1) {
  const durability = item?.system?.durability;
  if (!item?.update || !durability || Number(durability.max) <= 0 || Number(uses) <= 0) return false;
  const next = nextDurabilityState(durability, uses);
  await item.update({
    "system.durability.value": next.value,
    "system.durability.wearRate": next.wearRate,
    "system.durability.wearAmount": next.wearAmount,
    "system.durability.wearProgress": next.wearProgress
  });
  return true;
}
