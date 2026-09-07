import { canObserveEffect, effectDisclosure } from "../../rules/effect-boundary.mjs";
import { PAN_STATE, systemId } from "./constants.mjs";

export function canSeeEffect(effect, { actor = effect?.parent, viewer = globalThis.game?.user, viewerActor = null, panState = PAN_STATE.LOST, intel = {} } = {}) {
  return canObserveEffect(effect, {
    systemId: systemId(),
    isGM: Boolean(viewer?.isGM),
    isOwner: Boolean(actor?.testUserPermission?.(viewer, "OWNER")),
    isSelf: actor?.id === viewerActor?.id,
    panState,
    intel
  });
}

export function visibleEffects(actor, options = {}) {
  return Array.from(actor?.effects ?? [])
    .filter(effect => canSeeEffect(effect, { actor, ...options }))
    .map(effect => ({ id: effect.id, name: effect.name, img: effect.img, disclosure: effectDisclosure(effect, { systemId: systemId() }), stacks: Number(effect.flags?.[systemId()]?.stacks ?? 1) || 1 }));
}

export function effectMatches(actor, reference) {
  const wanted = String(reference ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return Array.from(actor?.effects ?? []).find(effect => !effect.disabled && [effect.id, effect.name, ...(effect.statuses ? [...effect.statuses] : [])]
    .some(value => String(value ?? "").trim().toLowerCase() === wanted)) ?? null;
}
