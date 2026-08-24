import { HUD_WORKSPACES, systemId } from "./constants.mjs";

const FLAG = "actionHud.preferences";

function actorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "actor").replace(/[^A-Za-z0-9_-]/g, "_");
}

function uniqueStrings(values, limit = 60) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? "").trim()).filter(Boolean))].slice(0, limit);
}

export function defaultHudPreferences() {
  return {
    pins: [],
    recent: [],
    recentWeapons: [],
    remembered: {},
    filters: { domain: "", query: "", weaponFamily: "", weaponCategory: "", traits: [] },
    workspace: HUD_WORKSPACES.NORMAL,
    selectedAssetUuid: "",
    reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
    reduceGlitch: false
  };
}

export function normalizeHudPreferences(source = {}) {
  const defaults = defaultHudPreferences();
  const filters = source.filters && typeof source.filters === "object" ? source.filters : {};
  return {
    ...defaults,
    ...source,
    pins: uniqueStrings(source.pins, 24),
    recent: uniqueStrings(source.recent, 24),
    recentWeapons: uniqueStrings(source.recentWeapons, 12),
    remembered: source.remembered && typeof source.remembered === "object" ? source.remembered : {},
    filters: {
      ...defaults.filters,
      ...filters,
      traits: uniqueStrings(filters.traits, 20)
    },
    selectedAssetUuid: String(source.selectedAssetUuid ?? ""),
    reducedMotion: Boolean(source.reducedMotion),
    reduceGlitch: Boolean(source.reduceGlitch)
  };
}

export function getHudPreferences(actor, user = globalThis.game?.user) {
  const all = user?.getFlag?.(systemId(), FLAG) ?? {};
  return normalizeHudPreferences(all?.[actorKey(actor)] ?? {});
}

export async function setHudPreferences(actor, changes = {}, user = globalThis.game?.user) {
  if (!actor || !user?.setFlag) return normalizeHudPreferences(changes);
  const all = globalThis.foundry?.utils?.deepClone?.(user.getFlag(systemId(), FLAG) ?? {}) ?? { ...(user.getFlag(systemId(), FLAG) ?? {}) };
  const key = actorKey(actor);
  const current = normalizeHudPreferences(all[key]);
  const merge = globalThis.foundry?.utils?.mergeObject;
  all[key] = normalizeHudPreferences(merge ? merge(current, changes, { inplace: false, recursive: true }) : { ...current, ...changes });
  await user.setFlag(systemId(), FLAG, all);
  return all[key];
}

export async function recordRecentAction(actor, actionId, selections = null, user = globalThis.game?.user) {
  if (!actor || !actionId) return;
  const current = getHudPreferences(actor, user);
  const id = String(actionId);
  const changes = { recent: [id, ...current.recent.filter(entry => entry !== id)].slice(0, 12) };
  if (selections && typeof selections === "object") changes.remembered = { ...current.remembered, [id]: selections };
  return setHudPreferences(actor, changes, user);
}

export async function togglePinnedAction(actor, actionId, user = globalThis.game?.user) {
  const current = getHudPreferences(actor, user);
  const id = String(actionId ?? "");
  const pins = current.pins.includes(id) ? current.pins.filter(entry => entry !== id) : [...current.pins, id].slice(0, 12);
  return setHudPreferences(actor, { pins }, user);
}
