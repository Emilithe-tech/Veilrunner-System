import { resolveActorActions } from "../../data/item/identity.mjs";
import { isItemEquipped } from "../../rules/item-rules.mjs";
import { HUD_DOMAINS } from "./constants.mjs";

const providers = new Map();

export function registerHudActionProvider(id, provider) {
  if (!id || typeof provider !== "function") throw new TypeError("HUD action providers require an id and function.");
  providers.set(String(id), provider);
  return () => providers.delete(String(id));
}

function domainFor(source) {
  const category = String(source?.system?.domain ?? source?.system?.category ?? source?.category ?? "actions");
  if (["magic", "spell"].includes(category)) return "magic";
  if (["tech", "digital", "hacking"].includes(category)) return "digital";
  if (["consumables", "gadgets", "item-actions", "gear", "weapon"].includes(category) || source?.generated || source?.weaponId) return category === "weapon" ? "combat" : "gear";
  if (["vehicles", "pets", "spirits", "assets"].includes(category)) return "assets";
  if (category === "macros") return "macros";
  return "combat";
}

export function normalizeHudAction(source, { provider = "owned", actor = null } = {}) {
  const system = source?.system ?? source ?? {};
  const id = String(source?.hudId ?? source?.id ?? "");
  const traits = [...new Set([...(system.traits ?? []), ...(source?.traits ?? [])].map(String))];
  return {
    hudId: id,
    id,
    uuid: source?.uuid ?? "",
    provider,
    source,
    sourceType: source?.documentName === "Item" || source?.parent === actor ? "item" : source?.generated ? "generated" : source?.sourceType ?? "definition",
    name: String(source?.name ?? "Unnamed Action"),
    img: source?.img ?? "icons/svg/light.svg",
    domain: domainFor(source),
    category: String(system.category ?? source?.category ?? "actions"),
    actionType: String(system.actionType ?? source?.actionType ?? "standard"),
    actionCount: Math.max(0, Number(system.actions ?? source?.actionCount ?? 1) || 0),
    governingAttribute: String(system.governingAttribute ?? ""),
    traits,
    tags: [...new Set([...traits, ...(system.tags ?? []), String(system.damageType ?? source?.type ?? "")].filter(Boolean))],
    costs: { ...(system.resourceCosts ?? source?.costs ?? {}) },
    requiresTarget: Boolean(system.requiresTarget),
    requirements: system.requirements ?? [],
    composer: system.composer ?? source?.composer ?? [],
    enhancements: system.enhancements ?? [],
    augments: system.augments ?? [],
    rankScaling: system.rankScaling ?? null,
    generated: Boolean(source?.generated),
    weaponId: source?.weaponId ?? "",
    operation: source?.operation ?? "",
    slot: Number(source?.slot) || 0,
    weaponComposer: source?.weaponComposer ?? null,
    disabled: Boolean(source?.disabled),
    disabledReason: String(source?.disabledReason ?? ""),
    summary: String(system.summary ?? source?.description ?? ""),
    favorite: Boolean(system.favorite || system.featured),
    attack: system.selector === "attack" || traits.includes("attack") || source?.operation === "fire"
  };
}

function itemGrantedActions(actor) {
  const results = [];
  for (const item of Array.from(actor?.items ?? [])) {
    if (!isItemEquipped(actor, item)) continue;
    for (const definition of item.system?.hudActions ?? []) {
      results.push(normalizeHudAction({ ...definition, id: `item:${item.id}:${definition.id}`, name: definition.name || item.name, img: definition.img || item.img, category: definition.category || "item-actions", sourceType: "item-action", parentItemId: item.id }, { provider: "equipment", actor }));
    }
  }
  return results;
}

export function macroActions(user = globalThis.game?.user) {
  const hotbar = user?.hotbar ?? {};
  return Object.entries(hotbar).sort(([left], [right]) => Number(left) - Number(right)).flatMap(([slot, macroId]) => {
    const macro = globalThis.game?.macros?.get?.(macroId);
    return macro ? [normalizeHudAction({ id: `macro:${macro.id}`, name: macro.name, img: macro.img, category: "macros", sourceType: "macro", macroId: macro.id, slot, actionType: "free", actionCount: 0 }, { provider: "macros" })] : [];
  });
}

export function hotbarMacroActions(user = globalThis.game?.user) {
  return macroActions(user);
}

export function discoverHudActions(actor, context = {}) {
  const owned = Array.from(actor?.items ?? []).filter(item => ["action", "ability"].includes(item.type)).map(item => normalizeHudAction(item, { provider: "owned", actor }));
  const generated = resolveActorActions(actor).map(action => normalizeHudAction(action, { provider: "system", actor }));
  const supplied = [...providers].flatMap(([id, provider]) => (provider(actor, context) ?? []).map(action => normalizeHudAction(action, { provider: id, actor })));
  const macros = macroActions(context.user);
  const deduped = new Map([...owned, ...generated, ...itemGrantedActions(actor), ...supplied, ...macros].filter(action => action.id).map(action => [action.id, action]));
  return [...deduped.values()];
}

export function availableDomains(actions, assets = []) {
  return HUD_DOMAINS.filter(domain => domain === "assets" ? assets.length : actions.some(action => action.domain === domain));
}

export function searchHudActions(actions, { domain = "", query = "", traits = [], category = "" } = {}) {
  const needle = String(query).trim().toLowerCase();
  return actions.filter(action => !domain || action.domain === domain)
    .filter(action => !category || action.category === category)
    .filter(action => !(traits?.length) || traits.every(trait => action.traits.includes(trait)))
    .filter(action => !needle || [action.name, action.category, action.domain, action.governingAttribute, action.summary, ...action.tags].join(" ").toLowerCase().includes(needle));
}
