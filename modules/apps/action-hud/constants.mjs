export const HUD_DOMAINS = Object.freeze(["combat", "magic", "digital", "gear", "assets", "macros"]);

export const HUD_WORKSPACES = Object.freeze({
  NORMAL: "normal",
  LIBRARY: "library",
  WEAPONS: "weapons",
  COMPOSER: "composer",
  ASSET: "asset",
  SAVES: "saves"
});

export const REQUIREMENT_STATE = Object.freeze({
  SATISFIED: "satisfied",
  UNSATISFIED: "unsatisfied",
  UNKNOWN: "unknown-to-player"
});

export const PAN_STATE = Object.freeze({
  STABLE: "stable",
  DEGRADED: "degraded",
  JAMMED: "jammed",
  LOST: "link-lost"
});

export const EFFECT_DISCLOSURE = Object.freeze({
  OBSERVABLE: "observable",
  SELF: "self-known",
  PAN: "pan-telemetry",
  BIOMONITOR: "biomonitor",
  SYSTEM: "system-telemetry",
  MAGICAL: "magical-detection",
  DIGITAL: "digital-detection",
  HIDDEN: "hidden"
});

export const DEFAULT_HEALTH_BANDS = Object.freeze([
  Object.freeze({ id: "uninjured", label: "Uninjured", min: 100 }),
  Object.freeze({ id: "wounded", label: "Wounded", min: 61 }),
  Object.freeze({ id: "bloodied", label: "Bloodied", min: 26 }),
  Object.freeze({ id: "critical", label: "Critical", min: 1 }),
  Object.freeze({ id: "down", label: "Down", min: 0 })
]);

export const DEFAULT_INTEL_MODULES = Object.freeze([
  Object.freeze({ id: "identity", label: "Identity" }),
  Object.freeze({ id: "biomonitor", label: "Biomonitor / HP" }),
  Object.freeze({ id: "shield", label: "Shield Telemetry" }),
  Object.freeze({ id: "armor", label: "Armor Telemetry" }),
  Object.freeze({ id: "defense", label: "Defensive Profile" }),
  Object.freeze({ id: "conditions", label: "Subsystem Status" })
]);

export const DEFAULT_WEAPON_FAMILIES = Object.freeze([
  Object.freeze({ id: "melee", label: "Melee", categories: [] }),
  Object.freeze({ id: "ranged", label: "Ranged", categories: [] }),
  Object.freeze({ id: "heavy", label: "Heavy", categories: [] }),
  Object.freeze({ id: "special", label: "Special", categories: [] })
]);

export function systemId() {
  return globalThis.game?.system?.id ?? "Veilrunner";
}

export function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, number(value, min)));
}
