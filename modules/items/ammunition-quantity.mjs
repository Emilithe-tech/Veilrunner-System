export function ammoPackQuantity(system = {}) {
  return Math.max(1, Math.trunc(Number(system.roundsPerPack) || 1));
}

export function ammunitionAcquisitionQuantity(item) {
  if (item?.type !== "ammunition" || item.actor || item.parent?.documentName === "Actor") return null;
  return ammoPackQuantity(item.system);
}
