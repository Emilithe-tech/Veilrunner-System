import { HUD_WORKSPACES, systemId } from "./constants.mjs";

const FLAG = "actionHud.preferences";

function actorKey(actor) {
  return String(actor?.uuid ?? actor?.id ?? "actor").replace(/[^A-Za-z0-9_-]/g, "_");
}

function uniqueStrings(values, limit = 60) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value ?? "").trim()).filter(Boolean))].slice(0, limit);
}

function safeSelections(source = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return {};
  return Object.fromEntries(Object.entries(source).slice(0, 40).map(([key, value]) => [String(key).slice(0, 80), String(value ?? "").slice(0, 240)]));
}

function normalizePrepared(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, 12).flatMap((entry, index) => {
    const actionId = String(entry?.actionId ?? "").trim();
    if (!actionId) return [];
    const targets = (Array.isArray(entry.targets) ? entry.targets : []).slice(0, 20).flatMap(target => {
      const uuid = String(target?.uuid ?? "").trim();
      if (!uuid) return [];
      return [{ uuid, name: String(target?.name ?? "Target").slice(0, 120), img: String(target?.img ?? "").slice(0, 500) }];
    });
    return [{ id: String(entry.id ?? `${actionId}-${index}`).slice(0, 120), combatId: String(entry.combatId ?? "").slice(0, 120), actionId, selections: safeSelections(entry.selections), targets }];
  });
}

export function defaultHudPreferences() {
  return {
    pins: [],
    recent: [],
    recentWeapons: [],
    prepared: [],
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
    prepared: normalizePrepared(source.prepared),
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

/** Replace one actor's HUD preferences exactly, for mechanical history restoration. */
export async function replaceHudPreferences(actor, preferences = {}, user = globalThis.game?.user) {
  const normalized = normalizeHudPreferences(preferences);
  if (!actor || !user?.setFlag) return normalized;
  const all = globalThis.foundry?.utils?.deepClone?.(user.getFlag(systemId(), FLAG) ?? {}) ?? { ...(user.getFlag(systemId(), FLAG) ?? {}) };
  // setFlag merges nested objects. Explicit deletion keys are needed to remove
  // remembered choices that are absent from the restored preferences.
  const replacement = (before, after) => {
    const result = { ...after };
    for (const [key, value] of Object.entries(before ?? {})) {
      if (!Object.hasOwn(after, key)) result[`-=${key}`] = null;
      else if (value && after[key] && typeof value === "object" && typeof after[key] === "object" && !Array.isArray(value) && !Array.isArray(after[key])) {
        result[key] = replacement(value, after[key]);
      }
    }
    return result;
  };
  all[actorKey(actor)] = replacement(all[actorKey(actor)], normalized);
  await user.setFlag(systemId(), FLAG, all);
  return normalized;
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

export async function prepareHudAction(actor, actionId, selections = {}, targetTokens = [...(globalThis.game?.user?.targets ?? [])], user = globalThis.game?.user) {
  const current = getHudPreferences(actor, user);
  const combatId = String(globalThis.game?.combat?.id ?? "");
  const randomId = globalThis.foundry?.utils?.randomID?.(16) ?? `${Date.now()}-${current.prepared.length}`;
  const targets = targetTokens.map(token => {
    const document = token?.document ?? token;
    return { uuid: document?.uuid ?? token?.uuid ?? "", name: token?.actor?.name ?? document?.name ?? "Target", img: token?.actor?.system?.portraitImage || token?.actor?.img || document?.texture?.src || "" };
  }).filter(target => target.uuid);
  const entry = normalizePrepared([{ id: randomId, combatId, actionId, selections, targets }])[0];
  if (!entry) return current;
  return setHudPreferences(actor, { prepared: [...current.prepared.filter(prepared => prepared.combatId === combatId), entry].slice(-12) }, user);
}

export async function removePreparedHudAction(actor, preparedId, user = globalThis.game?.user) {
  const current = getHudPreferences(actor, user);
  return setHudPreferences(actor, { prepared: current.prepared.filter(entry => entry.id !== preparedId) }, user);
}
