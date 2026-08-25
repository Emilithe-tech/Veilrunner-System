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

export const SPELL_MODIFIERS = Object.freeze([
  Object.freeze({ id: "twinned", label: "Twinned Spell", manaMultiplier: 3, maxStacks: null, stackable: true, description: "The spell effect is doubled and may affect one additional target per stack." }),
  Object.freeze({ id: "long-distance", label: "Long Distance", manaMultiplier: 1, maxStacks: null, stackable: true, description: "Increase the spell distance by 10 m per stack." }),
  Object.freeze({ id: "increased-potency", label: "Increased Potency", manaMultiplier: 3, manaOperation: "multiply", maxStacks: null, stackable: true, description: "Double the spell potency per stack." }),
  Object.freeze({ id: "focused", label: "Focused Spell", manaMultiplier: 2, manaOperation: "multiply", maxStacks: 1, description: "Raise the minimum damage halfway toward its maximum." }),
  Object.freeze({ id: "extended", label: "Extended Spell", manaMultiplier: 2, maxStacks: null, stackable: true, description: "A summoning spell remains for 2 additional turns per stack." }),
  Object.freeze({ id: "quickened", label: "Quickened Spell", manaMultiplier: 2, maxStacks: null, stackable: true, description: "Reduce the Action cost by 1 for each stack." }),
  Object.freeze({ id: "subtle", label: "Subtle Spell", manaMultiplier: 2, maxStacks: 1, description: "Cast the spell while silenced." }),
  Object.freeze({ id: "delayed", label: "Delayed Spell", manaOperation: "discount", manaReduction: 0.25, maxStacks: null, stackable: true, description: "Reduce the Mana cost by 25% iteratively for each additional turn before the spell activates." }),
  Object.freeze({ id: "conservative", label: "Conservative Spell", manaOperation: "discount", manaReduction: 0.25, maxStacks: null, stackable: true, description: "Add 1 Action and reduce the Mana cost by 25% iteratively per stack." })
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
