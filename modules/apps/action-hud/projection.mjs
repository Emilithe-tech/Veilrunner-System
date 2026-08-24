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

export function buildHudProjection(actor, state = {}) {
  const preferences = getHudPreferences(actor);
  const targetToken = state.targetToken ?? [...(globalThis.game?.user?.targets ?? [])][0] ?? null;
  const target = targetToken?.actor ?? null;
  const targetPresentation = getTargetIntelPresentation(targetToken, { viewerActor: actor });
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
    economy: getCombatEconomy(actor),
    panState: getPanState(actor),
    party: partyProjection(actor),
    target: targetPresentation,
    actions,
    allActions,
    pinned: projectedPins,
    recent: projectedRecent,
    context,
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
