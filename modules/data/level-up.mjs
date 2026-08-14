import { xpForLevel } from "./xp.mjs";

/**
 * Apply a completed hero level-up only when the active user is permitted and
 * the actor still meets the XP requirement. The caller may add allocation
 * fields, but progression values always come from the current actor source.
 */
export async function applyHeroLevelUp(actor, update = {}) {
  if (actor?.type !== "hero") return false;
  if (!game.user.isGM && !actor.isOwner) {
    ui.notifications.warn("You do not have permission to level up this character.");
    return false;
  }

  const currentLevel = Math.max(1, Number(actor.system?.level) || 1);
  const availableXp = Math.max(0, Number(foundry.utils.getProperty(actor._source, "system.experience.value") ?? actor.system?.experience?.value) || 0);
  const requiredXp = xpForLevel(currentLevel);
  if (requiredXp <= 0 || availableXp < requiredXp) {
    ui.notifications.warn("This character does not have enough XP to level up.");
    return false;
  }

  const nextLevel = currentLevel + 1;
  if (Number(update["system.level"]) !== nextLevel) {
    ui.notifications.error("The requested level-up is invalid.");
    return false;
  }

  await actor.update({
    ...update,
    "system.level": nextLevel,
    "system.experience.value": availableXp - requiredXp,
    "system.experience.max": xpForLevel(nextLevel)
  });
  return true;
}
