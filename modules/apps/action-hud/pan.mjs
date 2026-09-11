import { DEFAULT_HEALTH_BANDS, PAN_STATE, clamp, number, systemId } from "./constants.mjs";
import { combatantForActor } from "./economy.mjs";
import { sharesPanInformation } from "../../helpers/pan.mjs";

export function getPanState(actor, combat = globalThis.game?.combat) {
  if (!actor?.system?.networkLinked) return PAN_STATE.LOST;
  const combatant = combatantForActor(actor, combat);
  const stored = combatant?.flags?.[systemId()]?.actionHud?.pan?.state
    ?? combat?.flags?.[systemId()]?.actionHud?.pan?.[combatant?.id]?.state
    ?? PAN_STATE.STABLE;
  return Object.values(PAN_STATE).includes(stored) ? stored : PAN_STATE.STABLE;
}

export function panFidelity(viewerActor, subjectActor, combat = globalThis.game?.combat) {
  const viewer = getPanState(viewerActor, combat);
  if (!sharesPanInformation(subjectActor?.system) || viewer === PAN_STATE.LOST) return "observable";
  if (viewer === PAN_STATE.JAMMED) return "observable";
  if (viewer === PAN_STATE.DEGRADED) return "degraded";
  return "exact";
}

export function healthPercent(pool) {
  const max = Math.max(0, number(pool?.max));
  return max ? clamp(Math.round(number(pool?.value) / max * 100), 0, 100) : 0;
}

export function healthBands() {
  const configured = globalThis.game?.settings?.get?.(systemId(), "combatHudHealthBands");
  const source = Array.isArray(configured) && configured.length ? configured : DEFAULT_HEALTH_BANDS;
  return source
    .map(entry => ({ id: String(entry.id ?? ""), label: String(entry.label ?? entry.id ?? ""), min: clamp(entry.min, 0, 100) }))
    .filter(entry => entry.id && entry.label)
    .sort((left, right) => right.min - left.min);
}

export function qualitativeHealth(pool, bands = healthBands()) {
  const percent = healthPercent(pool);
  const band = bands.find(entry => percent >= entry.min) ?? bands.at(-1);
  return { id: band?.id ?? "", label: band?.label ?? "", percent };
}

export async function setCombatantPanState(combatant, state) {
  if (!combatant?.update || !Object.values(PAN_STATE).includes(state)) return false;
  if (!globalThis.game?.user?.isGM && !combatant.testUserPermission?.(globalThis.game.user, "OWNER")) {
    globalThis.ui?.notifications?.warn?.("You do not have permission to change this PAN state.");
    return false;
  }
  await combatant.update({ [`flags.${systemId()}.actionHud.pan.state`]: state });
  return true;
}
