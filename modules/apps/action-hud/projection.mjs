import { isItemEquipped } from "../../rules/item-rules.mjs";
import { findPartyForHero, getPartyMembers } from "../../helpers/party.mjs";
import { discoverHudActions, availableDomains, hotbarMacroActions, searchHudActions } from "./discovery.mjs";
import { evaluateActionAvailability } from "./availability.mjs";
import { getCombatEconomy, currentMapPenalty } from "./economy.mjs";
import { getTargetIntelPresentation } from "./target-intel.mjs";
import { getHudPreferences } from "./preferences.mjs";
import { getPanState, panFidelity, qualitativeHealth } from "./pan.mjs";
import { visibleEffects } from "./visibility.mjs";
import { projectedResourceCosts, resolveHudActionConfiguration } from "./resolver.mjs";
import { getHudUndoHistory, getHudUndoRecord } from "./undo.mjs";

const number = value => Math.max(0, Number(value) || 0);
const pool = (resources, key) => resources?.[key] ?? (key === "shields" ? resources?.shield : null) ?? { value: 0, max: 0 };

function resourceView(resources, key, fidelity = "exact") {
  const source = pool(resources, key);
  if (fidelity === "exact") return { key, visible: Number(source.max) > 0, exact: true, value: number(source.value), max: number(source.max), percent: Number(source.max) ? Math.round(number(source.value) / number(source.max) * 100) : 0 };
  if (fidelity === "observable") return { key, visible: false, exact: false };
  const quality = qualitativeHealth(source);
  return { key, visible: Number(source.max) > 0, exact: false, state: quality.label, stateId: quality.id, percent: quality.percent, degraded: fidelity === "degraded" };
}

function partyProjection(actor) {
  const viewerPan = getPanState(actor);
  return getPartyMembers(findPartyForHero(actor) ?? null).filter(member => member.id !== actor.id).map(member => {
    const fidelity = panFidelity(actor, member);
    const resources = member.system?.resources ?? {};
    return {
      id: member.id, name: member.name, img: member.system?.portraitImage || member.system?.appearanceImage || member.img,
      fidelity, panState: viewerPan,
      resources: ["health", "armor", "shields", "barriers"].map(key => resourceView(resources, key, fidelity)),
      conditions: visibleEffects(member, { viewerActor: actor, panState: viewerPan })
    };
  });
}

function assetProjection(actor) {
  return (actor.system?.assetLinks ?? []).flatMap(link => {
    const asset = globalThis.fromUuidSync?.(link.actorUuid);
    if (!asset || asset.documentName !== "Actor") return [];
    return [{ uuid: asset.uuid, id: asset.id, kind: link.kind, name: asset.name, img: asset.img, actor: asset, actions: discoverHudActions(asset, { user: globalThis.game?.user }).map(action => ({ ...action, assetActorUuid: asset.uuid })) }];
  });
}

function orderedByIds(actions, ids) {
  const index = new Map(actions.map(action => [action.id, action]));
  return ids.map(id => index.get(id)).filter(Boolean);
}

function projectAction(actor, action, target, targetPresentation, pinned) {
  const availability = action?.valid === false
    ? { state: "unsatisfied", available: false, reason: action.errors?.[0] ?? "This configuration is invalid." }
    : evaluateActionAvailability({ actor, action, target, targetPresentation });
  return { ...action, pinned, availability, mapPenalty: action.attack ? currentMapPenalty(actor, action.traits) : null };
}

function previewFor(actor, action, selections = {}) {
  return projectedResourceCosts(actor, resolveHudActionConfiguration(actor, action, selections));
}

export function projectMovementTrack(economy) {
  const unitMeters = 2;
  const movementLimit = Math.max(unitMeters, number(economy?.movementLimit) || 8);
  const maximumMeters = movementLimit;
  const remainingMeters = Math.min(maximumMeters, Math.max(0, number(economy?.movement)));
  const maximumUnits = Math.ceil(maximumMeters / unitMeters);
  const remainingUnits = Math.ceil(remainingMeters / unitMeters);
  const unitsPerBox = maximumUnits > 18 ? 2 : 1;
  const usedUnits = Math.max(0, maximumUnits - remainingUnits);
  const color = maximumMeters <= 12 ? "blue" : maximumMeters <= 24 ? "orange" : "white";
  const boxes = Array.from({ length: Math.ceil(maximumUnits / unitsPerBox) }, (_, index) => {
    const firstUnit = index * unitsPerBox;
    const capacity = Math.min(unitsPerBox, maximumUnits - firstUnit);
    const used = Math.min(capacity, Math.max(0, usedUnits - firstUnit));
    const value = capacity - used;
    return {
      value,
      capacity,
      filled: value > 0,
      compressed: unitsPerBox > 1,
      color,
      meters: capacity * unitMeters
    };
  });
  return { boxes, maximumMeters, remainingMeters, unitsPerBox, unitMeters };
}

function economyProjection(actor) {
  const economy = getCombatEconomy(actor);
  if (!economy) return null;
  const undo = getHudUndoRecord(actor);
  const undoHistory = getHudUndoHistory(actor);
  const movementTrack = projectMovementTrack(economy);
  const undoEntries = undoHistory.map((record, index) => ({
    index,
    actionName: record.actionName || "Action",
    type: record.type === "movement" ? "movement" : "action",
    typeLabel: record.type === "movement" ? "Movement" : "Action",
    icon: record.type === "movement" ? "fa-solid fa-person-running" : "fa-solid fa-bolt"
  })).reverse();
  return {
    ...economy,
    movement: movementTrack.remainingMeters,
    movementTrack,
    undo: { available: Boolean(undo), actionName: undo?.actionName ?? "", count: undoHistory.length, entries: undoEntries },
    actionHexes: Array.from({ length: economy.limits.actions }, (_, index) => ({ filled: index < economy.actions })),
    reactionHexes: Array.from({ length: economy.limits.reactions }, (_, index) => ({ filled: index < economy.reactions }))
  };
}

export function buildHudProjection(actor, state = {}) {
  const preferences = getHudPreferences(actor);
  const selectedTargetTokens = Array.isArray(state.targetTokens)
    ? state.targetTokens.filter(Boolean)
    : state.targetToken ? [state.targetToken] : [...(globalThis.game?.user?.targets ?? [])];
  const targetToken = selectedTargetTokens[0] ?? null;
  const target = targetToken?.actor ?? null;
  const targetPresentations = selectedTargetTokens.map(token => getTargetIntelPresentation(token, { viewerActor: actor }));
  const targetPresentation = {
    ...(targetPresentations[0] ?? getTargetIntelPresentation(null, { viewerActor: actor })),
    count: targetPresentations.length,
    multiple: targetPresentations.length > 1,
    selectedActors: targetPresentations.map((entry, index) => ({ name: entry.name, img: entry.img, primary: index === 0 }))
  };
  const assets = assetProjection(actor);
  const rawActions = discoverHudActions(actor, { user: globalThis.game?.user, targetToken, assets });
  const allActions = rawActions.map(action => projectAction(actor, action, target, targetPresentation, preferences.pins.includes(action.id)));
  const pins = orderedByIds(rawActions, preferences.pins);
  const recent = orderedByIds(rawActions, preferences.recent).filter(action => !preferences.pins.includes(action.id));
  const activeDomain = state.domain ?? preferences.filters.domain ?? "";
  const query = state.query ?? preferences.filters.query ?? "";
  const listed = searchHudActions(rawActions, { domain: activeDomain, query, traits: state.traits ?? preferences.filters.traits, category: state.category ?? "" });
  const actions = listed.map(action => projectAction(actor, action, target, targetPresentation, preferences.pins.includes(action.id)));
  const projectedPins = pins.map(action => projectAction(actor, action, target, targetPresentation, true));
  const projectedRecent = recent.map(action => projectAction(actor, action, target, targetPresentation, false));
  const equipped = Array.from(actor.items ?? []).filter(item => isItemEquipped(actor, item) && ["weapon", "shield", "equipment", "accessory", "consumable"].includes(item.type)).slice(0, 2);
  const context = rawActions.filter(action => action.generated && ["reload", "load", "unload"].includes(action.operation)).map(action => projectAction(actor, action, target, targetPresentation, false)).slice(0, 2);
  const currentTargetUuids = selectedTargetTokens.map(token => String(token?.document?.uuid ?? token?.uuid ?? "")).filter(Boolean).sort();
  const prepared = preferences.prepared.flatMap(entry => {
    if (entry.combatId && entry.combatId !== String(globalThis.game?.combat?.id ?? "")) return [];
    const source = rawActions.find(action => action.id === entry.actionId);
    if (!source) return [];
    const resolved = resolveHudActionConfiguration(actor, source, entry.selections);
    const projected = projectAction(actor, resolved, target, targetPresentation, preferences.pins.includes(source.id));
    const plannedTargetUuids = entry.targets.map(planned => planned.uuid).sort();
    const targetsMatch = plannedTargetUuids.length === currentTargetUuids.length && plannedTargetUuids.every((uuid, index) => uuid === currentTargetUuids[index]);
    return [{ ...projected, preparedId: entry.id, selections: entry.selections, plannedTargets: entry.targets, plannedTargetCount: entry.targets.length, plannedTargetNames: entry.targets.map(planned => planned.name).join(", "), selectedTargetCount: currentTargetUuids.length, targetsMatch }];
  });
  const composerAction = rawActions.find(action => action.id === state.composerActionId) ?? null;
  const resources = actor.system?.resources ?? {};
  const familyDefinitions = globalThis.game?.settings?.get?.(globalThis.game.system.id, "combatHudWeaponFamilies") ?? [];
  const weaponFilter = state.weaponFilter ?? "all";
  const weaponQuery = String(state.weaponQuery ?? "").trim().toLowerCase();
  const recentWeaponIds = preferences.recentWeapons ?? [];
  const weapons = Array.from(actor.items ?? []).filter(item => item.type === "weapon").map(item => ({ id: item.id, name: item.name, img: item.img, equipped: isItemEquipped(actor, item), favorite: Boolean(item.system?.favorite), traits: item.system?.traits ?? [], category: item.system?.weaponType ?? item.system?.category ?? "", recent: recentWeaponIds.includes(item.id) }));
  const matchesWeaponFilter = weapon => {
    if (weaponFilter === "all") return true;
    if (weaponFilter === "recent") return weapon.recent;
    if (weaponFilter === "favorites") return weapon.favorite;
    return Boolean(familyDefinitions.find(family => family.id === weaponFilter)?.categories?.includes(weapon.category));
  };
  const filteredWeapons = weapons.filter(matchesWeaponFilter)
    .filter(weapon => !weaponQuery || [weapon.name, weapon.category, ...weapon.traits].join(" ").toLowerCase().includes(weaponQuery));
  return {
    actor: { id: actor.id, uuid: actor.uuid, name: actor.name, img: actor.system?.portraitImage || actor.img, level: number(actor.system?.level) },
    resources: ["health", "armor", "shields", "barriers", "mana", "stamina"].map(key => resourceView(resources, key)),
    economy: economyProjection(actor),
    panState: getPanState(actor),
    party: partyProjection(actor),
    target: targetPresentation,
    targetTokens: selectedTargetTokens,
    actions,
    allActions,
    pinned: projectedPins,
    recent: projectedRecent,
    context,
    prepared,
    macros: hotbarMacroActions(globalThis.game?.user).map(action => projectAction(actor, action, target, targetPresentation, false)),
    equipped: equipped.map(item => ({ id: item.id, name: item.name, img: item.img, type: item.type })),
    weapons: filteredWeapons,
    weaponFamilies: familyDefinitions,
    weaponFilter,
    weaponQuery,
    assets,
    domains: availableDomains(rawActions, assets),
    activeDomain,
    query,
    preferences,
    composer: composerAction ? { action: projectAction(actor, resolveHudActionConfiguration(actor, composerAction, state.composerSelections ?? preferences.remembered?.[composerAction.id] ?? {}), target, targetPresentation, preferences.pins.includes(composerAction.id)), preview: previewFor(actor, composerAction, state.composerSelections ?? preferences.remembered?.[composerAction.id] ?? {}), selections: state.composerSelections ?? preferences.remembered?.[composerAction.id] ?? {} } : null,
    saves: ["fortitude", "willpower", "reflex"].map(key => ({ key, label: key[0].toUpperCase() + key.slice(1), value: number(actor.system?.saves?.[key]) }))
  };
}
