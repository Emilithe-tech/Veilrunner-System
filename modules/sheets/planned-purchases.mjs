import { qualitySelectionId } from "../apps/chargen/quality-rules.mjs";

const list = value => Array.isArray(value) ? value : [];
const number = value => Math.max(0, Number(value) || 0);
const title = value => String(value).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, letter => letter.toUpperCase());
// Manually authored perks have no canonical identity; compare their complete
// authored snapshot separately, without resolving a definition by its name.
const perkKey = entry => qualitySelectionId(entry) || `custom:${JSON.stringify([
  entry.name, entry.tier, entry.pillar, entry.description, entry.mechanics, entry.requirements, entry.tags
])}`;

/** Compare saved future builds by stable tree/quality identity, never by display name. */
export function plannedPurchases(system, plans = {}, catalog = {}) {
  const attributes = structuredClone(system.characterGeneration?.attributeBase ?? system.attributes ?? {});
  const branches = new Set(list(system.talentTree?.branches));
  const ranks = new Map(list(system.talentTree?.leaves).map(entry => [entry.id, number(entry.rank)]));
  const perks = new Set(list(system.qualitiesTaken).map(perkKey));
  const records = new Map();
  for (const page of ["skills", "magic"]) {
    for (const school of list(catalog[page])) {
      records.set(`school:${school.id}`, { name: school.name, kind: "talent" });
      for (const practice of list(school.practices)) {
        records.set(practice.id, { name: practice.name, kind: "talent" });
        for (const leaf of list(practice.spells)) records.set(leaf.id, { name: leaf.name, kind: page === "skills" ? "skill" : "spell" });
      }
    }
  }
  records.set("root:magic", { name: "Magic Access", kind: "talent" });
  const result = new Map();
  const levels = Object.entries(plans ?? {}).filter(([level, plan]) =>
    Number.isInteger(Number(level)) && Number(level) > Number(system.level ?? 1) && plan?.state
  ).sort(([a], [b]) => Number(a) - Number(b));
  for (const [level, { state }] of levels) {
    const items = [];
    for (const [group, values] of Object.entries(state.attributes ?? {})) {
      if (!values || typeof values !== "object") continue;
      attributes[group] ??= {};
      for (const [key, value] of Object.entries(values)) {
        const from = number(attributes[group][key]);
        const to = number(value);
        if (to > from) items.push({ kind: "attribute", name: `+${to - from} ${title(key)}`, increase: `${from} → ${to}`, detail: "" });
        attributes[group][key] = Math.max(from, to);
      }
    }
    for (const id of list(state.talentTree?.branches)) {
      if (!branches.has(id)) {
        const record = records.get(id);
        items.push({ kind: "talent", name: `+ ${record?.name ?? "Unavailable talent"}`, detail: record ? "" : String(id) });
        branches.add(id);
      }
    }
    for (const entry of list(state.talentTree?.leaves)) {
      const from = ranks.get(entry.id) ?? 0;
      const to = number(entry.rank);
      if (to > from) {
        const record = records.get(entry.id);
        const name = record?.name ?? "Unavailable skill or spell";
        items.push({
          kind: record?.kind ?? "skill",
          name: from === 0 ? `+ ${name} (new)` : `+ ${name} level ${from} → ${to}`,
          detail: record ? (from === 0 && to > 1 ? `Level ${to}` : "") : String(entry.id)
        });
        ranks.set(entry.id, to);
      }
    }
    for (const entry of list(state.qualitiesTaken)) {
      const id = perkKey(entry);
      if (!id || perks.has(id)) continue;
      items.push({ kind: "perk", name: `+ ${entry.name || "Perk"}`, detail: entry.tier ?? "" });
      perks.add(id);
    }
    result.set(Number(level), items.map(item => ({ ...item, plannedPurchase: true, planLevel: Number(level) })));
  }
  return result;
}
