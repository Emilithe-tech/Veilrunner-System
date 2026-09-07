/** Read old source data once at the model/provider boundary. Canonical values win. */
export function actionProgression(source = {}) {
  const canonical = source.progression?.toObject?.() ?? source.progression ?? {};
  const legacy = source.rankScaling ?? {};
  const scaling = Array.isArray(canonical.scaling) ? structuredClone(canonical.scaling) : [];
  if (!Object.hasOwn(canonical, "scaling") && legacy.enabled) {
    for (const [key, selector] of [["manaPerRank", "resourceCosts.mana"], ["staminaPerRank", "resourceCosts.stamina"], ["actionPerRank", "economy.actions"]]) {
      const value = Math.max(0, Number(legacy[key]) || 0);
      if (value) scaling.push({ id: `legacy-${key}`, kind: "perLevel", level: 2, interval: 1,
        selector, mode: "add", value: String(value), description: "Cost per additional level" });
    }
  }
  return { ...structuredClone(canonical),
    maxLevel: Math.max(1, Math.trunc(Number(canonical.maxLevel ?? source.maxLevel ?? (legacy.enabled ? legacy.max : 1)) || 1)), scaling };
}
