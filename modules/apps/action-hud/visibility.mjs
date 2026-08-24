import { EFFECT_DISCLOSURE, PAN_STATE, systemId } from "./constants.mjs";

function disclosure(effect) {
  return String(effect?.flags?.[systemId()]?.visibility?.disclosure
    ?? effect?.flags?.[systemId()]?.actionHud?.visibility?.disclosure
    ?? EFFECT_DISCLOSURE.HIDDEN);
}

function intelHas(intel, key) {
  return Boolean(intel?.[key] || intel?.modules?.includes?.(key));
}

export function canSeeEffect(effect, { actor = effect?.parent, viewer = globalThis.game?.user, viewerActor = null, panState = PAN_STATE.LOST, intel = {} } = {}) {
  if (!effect || effect.disabled) return false;
  if (viewer?.isGM || actor?.testUserPermission?.(viewer, "OWNER")) return true;
  const mode = disclosure(effect);
  if (mode === EFFECT_DISCLOSURE.OBSERVABLE) return true;
  if (mode === EFFECT_DISCLOSURE.SELF) return actor?.id === viewerActor?.id;
  if (mode === EFFECT_DISCLOSURE.PAN) return [PAN_STATE.STABLE, PAN_STATE.DEGRADED].includes(panState);
  if (mode === EFFECT_DISCLOSURE.BIOMONITOR) return intelHas(intel, "biomonitor");
  if (mode === EFFECT_DISCLOSURE.SYSTEM) return intelHas(intel, "conditions") || intelHas(intel, "system");
  if (mode === EFFECT_DISCLOSURE.MAGICAL) return intelHas(intel, "magical");
  if (mode === EFFECT_DISCLOSURE.DIGITAL) return intelHas(intel, "digital");
  return false;
}

export function visibleEffects(actor, options = {}) {
  return Array.from(actor?.effects ?? [])
    .filter(effect => canSeeEffect(effect, { actor, ...options }))
    .map(effect => ({ id: effect.id, name: effect.name, img: effect.img, disclosure: disclosure(effect), stacks: Number(effect.flags?.[systemId()]?.stacks ?? 1) || 1 }));
}

export function effectMatches(actor, reference) {
  const wanted = String(reference ?? "").trim().toLowerCase();
  if (!wanted) return null;
  return Array.from(actor?.effects ?? []).find(effect => !effect.disabled && [effect.id, effect.name, ...(effect.statuses ? [...effect.statuses] : [])]
    .some(value => String(value ?? "").trim().toLowerCase() === wanted)) ?? null;
}

