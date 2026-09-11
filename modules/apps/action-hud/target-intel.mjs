import { DEFAULT_INTEL_MODULES, PAN_STATE, systemId } from "./constants.mjs";
import { findPartyForHero } from "../../helpers/party.mjs";
import { getPanState, qualitativeHealth } from "./pan.mjs";
import { visibleEffects } from "./visibility.mjs";
import { sharesPanInformation } from "../../helpers/pan.mjs";

const safeKey = value => String(value ?? "unknown").replace(/[^A-Za-z0-9_-]/g, "_");
const tokenDocument = token => token?.document ?? token;
const tokenActor = token => token?.actor ?? tokenDocument(token)?.actor ?? null;

export function targetIntelKey(token) {
  const document = tokenDocument(token);
  return safeKey(document?.uuid ?? document?.id ?? tokenActor(token)?.uuid ?? tokenActor(token)?.id);
}

export function partyIntelKey(viewerActor) {
  const party = findPartyForHero(viewerActor) ?? null;
  return safeKey(party?.uuid ?? party?.id ?? party?.folder?.id ?? viewerActor?.uuid ?? viewerActor?.id);
}

export function getEncounterIntel(token, viewerActor, combat = globalThis.game?.combat) {
  if (!combat || !token || !viewerActor) return { modules: [] };
  const source = combat.flags?.[systemId()]?.actionHud?.intel?.[partyIntelKey(viewerActor)]?.[targetIntelKey(token)] ?? {};
  const modules = Array.isArray(source.modules) ? source.modules : Object.entries(source.modules ?? {}).filter(([, value]) => value).map(([key]) => key);
  return { ...source, modules: [...new Set(modules.map(String))] };
}

const known = (intel, module) => intel.modules.includes(module);

function projectPool(pool, exact, label = "", visible = true) {
  if (!visible) return { visible: false, exact: false, label };
  if (exact) return { visible: true, exact: true, value: Number(pool?.value ?? 0), max: Number(pool?.max ?? 0), label };
  const quality = qualitativeHealth(pool);
  return { visible: Boolean(label || quality.label), exact: false, state: quality.label, stateId: quality.id, label };
}

export function getTargetIntelPresentation(token, { user = globalThis.game?.user, viewerActor = null, combat = globalThis.game?.combat } = {}) {
  const actor = tokenActor(token);
  if (!actor) return { selected: false, label: "Nothing Selected", resources: {}, conditions: [], intel: { modules: [] } };
  const intel = getEncounterIntel(token, viewerActor, combat);
  const panState = getPanState(viewerActor, combat);
  const gm = Boolean(user?.isGM);
  const networked = sharesPanInformation(actor.system);
  const resources = actor.system?.resources ?? {};
  const exact = module => gm || (networked && panState === PAN_STATE.STABLE && known(intel, module));
  const identity = gm || known(intel, "identity") || !actor.flags?.[systemId()]?.hideIdentity;
  const conditions = visibleEffects(actor, { viewer: user, viewerActor, panState, intel: { ...intel, conditions: known(intel, "conditions") } });
  const modules = globalThis.game?.settings?.get?.(systemId(), "combatHudIntelModules") ?? DEFAULT_INTEL_MODULES;
  return {
    selected: true, actor, token, name: identity ? actor.name : "Unknown Target", img: actor.system?.portraitImage || actor.img, networked, panState,
    resources: {
      health: projectPool(resources.health, exact("biomonitor"), "HP", true),
      armor: projectPool(resources.armor, exact("armor"), "Armor", gm || known(intel, "armor")),
      shield: projectPool(resources.shields ?? resources.shield, exact("shield"), "Shield", gm || known(intel, "shield")),
      barriers: projectPool(resources.barriers, exact("system"), "Barrier", gm || known(intel, "system"))
    },
    defense: gm || known(intel, "defense") ? actor.system?.armorClass ?? actor.system?.defense ?? null : null,
    conditions, intel: { ...intel, known: intel.modules.length, total: modules.length }
  };
}

export async function grantTargetIntel(token, viewerActor, modules = [], { combat = globalThis.game?.combat } = {}) {
  if (!combat || !token || !viewerActor) return false;
  if (!globalThis.game?.user?.isGM && !combat.canUserModify?.(globalThis.game?.user, "update")) throw new Error("The current user may not update encounter intel.");
  const current = getEncounterIntel(token, viewerActor, combat);
  const next = [...new Set([...current.modules, ...(Array.isArray(modules) ? modules : [modules])].map(String).filter(Boolean))];
  await combat.update({ [`flags.${systemId()}.actionHud.intel.${partyIntelKey(viewerActor)}.${targetIntelKey(token)}`]: { modules: next } });
  return true;
}
