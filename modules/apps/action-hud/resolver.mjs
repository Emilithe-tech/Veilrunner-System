import { number } from "./constants.mjs";

function costObject(source = {}) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Math.max(0, number(value))]));
}

export function resolveHudActionConfiguration(actor, action, selections = {}) {
  const resolvedSelections = { ...(selections ?? {}) };
  const costs = costObject(action?.costs);
  const errors = [];
  const breakdown = [];
  let actionCount = Math.max(0, number(action?.actionCount, 1));
  let ammoCost = 0;
  let attackModifier = 0;
  let damageModifier = 0;
  let damageFormula = "";
  let range = number(action?.weaponComposer?.range);
  let resolvedWeaponMode = null;
  const selectedWeaponOptions = [];

  if (action?.weaponComposer) {
    const modes = action.weaponComposer.modes ?? [];
    const requestedMode = String(resolvedSelections.fireMode ?? "");
    resolvedWeaponMode = modes.find(mode => mode.id === requestedMode) ?? modes[0] ?? null;
    if (!resolvedWeaponMode) errors.push("This weapon has no available firing mode.");
    else {
      resolvedSelections.fireMode = resolvedWeaponMode.id;
      actionCount = Math.max(0, number(resolvedWeaponMode.actions, actionCount));
      ammoCost = Math.max(0, number(resolvedWeaponMode.ammoCost, 1));
      attackModifier += number(resolvedWeaponMode.attackModifier);
      damageModifier += number(resolvedWeaponMode.damageModifier);
      damageFormula = String(resolvedWeaponMode.damageFormula ?? "");
      range = Math.max(0, range + number(resolvedWeaponMode.rangeModifier));
      breakdown.push({ label: resolvedWeaponMode.label, value: `${actionCount} AP, ${ammoCost} ammo` });
    }
    for (const option of action.weaponComposer.options ?? []) {
      if (!resolvedSelections[`weaponOption:${option.id}`]) continue;
      selectedWeaponOptions.push(option);
      actionCount = Math.max(0, actionCount + number(option.actionAdjustment));
      ammoCost = Math.max(0, ammoCost + number(option.ammoAdjustment));
      attackModifier += number(option.attackModifier);
      damageModifier += number(option.damageModifier);
      breakdown.push({ label: option.label, value: option.description || "Enabled" });
    }
    if (ammoCost > number(action.weaponComposer.ammoCurrent)) errors.push("Insufficient ammunition for the selected firing mode.");
  }

  for (const field of action?.composer ?? []) {
    const value = resolvedSelections[field.key];
    if (field.required && (value === undefined || value === null || value === "")) errors.push(`${field.label || field.key} is required.`);
    if (field.choices?.length && value && !field.choices.includes(value)) errors.push(`${field.label || field.key} is no longer available.`);
  }

  if (action?.rankScaling?.enabled) {
    const rank = Number(resolvedSelections.rank ?? resolvedSelections.spellRank ?? action.rankScaling.min);
    const min = Math.max(1, number(action.rankScaling.min, 1));
    const max = Math.max(min, number(action.rankScaling.max, 20));
    if (!Number.isInteger(rank) || rank < min || rank > max) errors.push(`Rank must be between ${min} and ${max}.`);
    else {
      costs.mana = number(costs.mana) + (rank * number(action.rankScaling.manaPerRank));
      costs.stamina = number(costs.stamina) + (rank * number(action.rankScaling.staminaPerRank));
      actionCount += rank * number(action.rankScaling.actionPerRank);
      breakdown.push({ label: `Rank ${rank}`, value: `Mana +${rank * number(action.rankScaling.manaPerRank)}, Stamina +${rank * number(action.rankScaling.staminaPerRank)}` });
    }
  }

  for (const enhancement of action?.enhancements ?? []) {
    const key = `enhancement:${enhancement.id}`;
    const count = Number(resolvedSelections[key] ?? 0);
    const max = Math.max(0, number(enhancement.maxStacks, 1));
    if (!Number.isInteger(count) || count < 0 || count > max) { errors.push(`${enhancement.label || enhancement.id} must be between 0 and ${max}.`); continue; }
    if (!count) continue;
    for (const [resource, cost] of Object.entries(enhancement.costs ?? {})) costs[resource] = number(costs[resource]) + (number(cost) * count);
    actionCount += number(enhancement.actionAdjustment) * count;
    breakdown.push({ label: enhancement.label || enhancement.id, value: `×${count}` });
  }

  const augmentId = String(resolvedSelections.augment ?? "");
  if (augmentId) {
    const augment = action?.augments?.find(entry => entry.definitionId === augmentId);
    if (!augment) errors.push("The remembered augment is no longer available.");
    else {
      const rank = Number(resolvedSelections.augmentRank ?? augment.minRank);
      if (!Number.isInteger(rank) || rank < number(augment.minRank, 1) || rank > number(augment.maxRank, 20)) errors.push("The augment rank is no longer valid.");
      else breakdown.push({ label: augment.label || augment.definitionId, value: `Rank ${rank}` });
    }
  }

  const resources = actor?.system?.resources ?? {};
  for (const [key, cost] of Object.entries(costs)) if (cost > number(resources[key]?.value)) errors.push(`Insufficient ${key}.`);
  const weaponComposer = action?.weaponComposer ? {
    ...action.weaponComposer,
    modes: (action.weaponComposer.modes ?? []).map(mode => ({ ...mode, selected: mode.id === resolvedWeaponMode?.id })),
    options: (action.weaponComposer.options ?? []).map(option => ({ ...option, selected: selectedWeaponOptions.some(entry => entry.id === option.id) }))
  } : null;
  const traits = [...new Set([...(action?.traits ?? []), ...(resolvedWeaponMode?.traits ?? []), ...selectedWeaponOptions.flatMap(option => option.traits ?? [])])];
  return { ...action, traits, actionCount: Math.max(0, actionCount), ammoCost, attackModifier, damageModifier, damageFormula, range, resolvedWeaponMode, selectedWeaponOptions, weaponComposer, costs, composerSelections: resolvedSelections, resolvedSelections, breakdown, valid: !errors.length, errors };
}

export function projectedResourceCosts(actor, resolved) {
  const resources = actor?.system?.resources ?? {};
  return Object.entries(resolved?.costs ?? {}).filter(([, cost]) => number(cost) > 0).map(([key, cost]) => ({ key, before: Math.max(0, number(resources[key]?.value)), after: Math.max(0, number(resources[key]?.value) - number(cost)), cost: number(cost) }));
}
