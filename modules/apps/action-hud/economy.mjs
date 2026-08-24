import { number, systemId } from "./constants.mjs";

const whole = value => Math.max(0, Math.floor(number(value)));

export function combatantForActor(actor, combat = globalThis.game?.combat) {
  return Array.from(combat?.combatants ?? []).find(combatant => combatant.actor?.id === actor?.id) ?? null;
}

export function actionLimits(actor) {
  const agility = whole(actor?.system?.attributes?.physical?.agility);
  const reaction = whole(actor?.system?.attributes?.physical?.reaction);
  return { actions: 2 + Math.floor(agility / 10), reactions: Math.floor(reaction / 10) };
}

export function economyCycleKey(combat = globalThis.game?.combat) {
  if (!combat) return "outside-combat";
  return `${combat.id}:${whole(combat.round)}:${combat.combatant?.id ?? "none"}`;
}

export function getCombatEconomy(actor, combat = globalThis.game?.combat) {
  const combatant = combatantForActor(actor, combat);
  if (!combatant) return null;
  const stored = combatant.flags?.[systemId()]?.actionHud?.economy ?? {};
  const limits = actionLimits(actor);
  return { combatant, key: String(stored.key ?? ""), actions: whole(stored.actions ?? limits.actions), reactions: whole(stored.reactions ?? limits.reactions), movement: stored.movement ?? null, attacks: whole(stored.attacks), limits };
}

function canUpdate(combatant) {
  return Boolean(globalThis.game?.user?.isGM || combatant?.isOwner || combatant?.testUserPermission?.(globalThis.game?.user, "OWNER"));
}

export async function resetCombatEconomy(combatant, combat = combatant?.combat ?? globalThis.game?.combat) {
  if (!combatant?.actor || !canUpdate(combatant)) return null;
  const limits = actionLimits(combatant.actor);
  const economy = { key: economyCycleKey(combat), actions: limits.actions, reactions: limits.reactions, movement: null, attacks: 0 };
  await combatant.update({ [`flags.${systemId()}.actionHud.economy`]: economy });
  return economy;
}

export async function ensureCombatEconomy(actor, combat = globalThis.game?.combat) {
  const economy = getCombatEconomy(actor, combat);
  if (!economy) return null;
  const active = globalThis.game?.veilrunner?.getActivePhaseCombatants?.() ?? [combat?.combatant].filter(Boolean);
  const activeIds = new Set(active.map(entry => entry.id));
  if (economy.key === economyCycleKey(combat) || !activeIds.has(economy.combatant.id)) return economy;
  await resetCombatEconomy(economy.combatant, combat);
  return getCombatEconomy(actor, combat);
}

export async function spendActionEconomy(actor, action, combat = globalThis.game?.combat) {
  const economy = await ensureCombatEconomy(actor, combat);
  if (!economy) return true;
  if (!canUpdate(economy.combatant)) return false;
  const system = action?.system ?? action ?? {};
  const type = system.actionType ?? action?.actionType ?? "standard";
  const reaction = type === "reaction";
  const cost = ["free", "passive"].includes(type) ? 0 : reaction ? 1 : whole(system.actions ?? action?.actionCount ?? 1);
  const pool = reaction ? "reactions" : "actions";
  if (cost > economy[pool]) return false;
  const next = { key: economy.key || economyCycleKey(combat), actions: economy.actions, reactions: economy.reactions, movement: economy.movement, attacks: economy.attacks };
  next[pool] = Math.max(0, next[pool] - cost);
  await economy.combatant.update({ [`flags.${systemId()}.actionHud.economy`]: next });
  return true;
}

export function currentMapPenalty(actor, traits = [], combat = globalThis.game?.combat) {
  const economy = getCombatEconomy(actor, combat);
  if (!economy) return 0;
  const registry = globalThis.game?.settings?.get?.(systemId(), "actionTraits") ?? [];
  const adjustment = (traits ?? []).reduce((total, trait) => total + number(registry.find(entry => entry.id === trait)?.attackPenaltyAdjustment), 0);
  return economy.attacks ? (economy.attacks * -5) + adjustment : 0;
}

/** Advance MAP exactly once after the shared executor confirms a successful attack. */
export async function recordSuccessfulAttack(actor, combat = globalThis.game?.combat) {
  const economy = await ensureCombatEconomy(actor, combat);
  if (!economy || !canUpdate(economy.combatant)) return false;
  await economy.combatant.update({ [`flags.${systemId()}.actionHud.economy`]: { key: economy.key || economyCycleKey(combat), actions: economy.actions, reactions: economy.reactions, movement: economy.movement, attacks: economy.attacks + 1 } });
  return true;
}
