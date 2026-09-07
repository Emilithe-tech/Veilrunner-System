import { SPELL_MODIFIERS } from "./spell-modifiers.mjs";
import { resolveAtLevel } from "../rules/scaling.mjs";
import { actionProgression } from "../data/item/legacy-action-progression.mjs";
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
import { legacyActionDamageFormula, resolveActionDamageFormula, resolveSpellDamageFormula } from "../data/item/action-formula.mjs";
import { normalizeActionTiming, normalizeActionEconomy } from "./resolved-action.mjs";
import { resolveAction } from "./resolved-action.mjs";

const MAX_SPELL_MODIFIER_STACKS = 100;
const roundedCost = value => Number(Number(value).toFixed(2));

function attributeData(actor, path = "") {
  const normalized = String(path ?? "").replace(/^system\./, "");
  const value = normalized.split(".").filter(Boolean).reduce((current, key) => current?.[key], actor?.system);
  const key = normalized.split(".").filter(Boolean).at(-1) ?? "attribute";
  return { value: Number(value) || 0, label: key.charAt(0).toUpperCase() + key.slice(1) };
}

function costObject(source = {}) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, Math.max(0, number(value))]));
}

function costSummary(actionCount, costs, ammoCost = 0, reactions = 0) {
  return [reactions > 0 ? `${reactions} RP` : `${Math.max(0, number(actionCount))} AP`, ...Object.entries(costs).filter(([, value]) => number(value) > 0).map(([key, value]) => `${number(value)} ${key[0].toUpperCase()}${key.slice(1)}`), ...(ammoCost ? [`${ammoCost} Ammo`] : [])].join(" · ");
}

export function resolveActionConfiguration(actor, action, selections = {}, context = {}) {
  action = action?.configurationSource ?? action;
  const resolvedSelections = { ...(selections ?? {}) };
  const errors = [];
  const breakdown = [];
  const progression = actionProgression(action);
  const purchasedLevel = Math.max(1, number(action?.currentLevel, progression.maxLevel));
  const spellLevelMin = 1;
  const spellLevelMax = Math.min(purchasedLevel, progression.maxLevel);
  const requestedSpellLevel = Number(resolvedSelections.spellLevel ?? resolvedSelections.rank ?? action?.currentLevel ?? 1);
  const spellLevel = Number.isInteger(requestedSpellLevel) ? requestedSpellLevel : 1;
  if (spellLevel < 1 || spellLevel > spellLevelMax || !Number.isInteger(requestedSpellLevel)) errors.push(`Level must be between 1 and ${spellLevelMax}.`);
  if (action?.isSpell) resolvedSelections.spellLevel = spellLevel;
  if (progression.maxLevel > 1) resolvedSelections.rank = spellLevel;
  const levelProjection = resolveAtLevel({ system: {
    definitionId: action?.definitionId, progression,
    resourceCosts: costObject(action?.costs ?? action?.resourceCosts),
    economy: { ...normalizeActionEconomy(action) }, targeting: { range: number(action?.range ?? action?.weaponComposer?.range) },
    damageFormula: action?.damageFormula ?? "", baseSpellDamage: action?.baseSpellDamage ?? "",
    spellDamagePerLevel: action?.spellDamagePerLevel ?? "", traits: [...(action?.traits ?? [])],
    effects: structuredClone(action?.effects ?? [])
  } }, { actor, level: spellLevel });
  const costs = costObject(levelProjection.system.resourceCosts);
  let actionCount = levelProjection.system.economy.actions;
  let ammoCost = 0;
  let attackModifier = 0;
  let damageModifier = 0;
  let damageFormula = "";
  let range = number(levelProjection.system.targeting.range);
  let resolvedWeaponMode = null;
  const selectedWeaponOptions = [];
  const selectedSpellModifiers = [];
  breakdown.push({ label: "Base Cost", value: costSummary(normalizeActionEconomy(action).actions, action?.costs ?? {}, 0, normalizeActionEconomy(action).reactions) });
  for (const change of levelProjection.applied) breakdown.push({ label: change.description || `Level ${spellLevel}`, value: `${change.before ?? 0} → ${change.after}` });
  if (levelProjection.invalid.length) errors.push("Level scaling contains an invalid field.");

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

  const baseSpellMana = number(costs.mana);
  const quickenedMax = Math.max(0, actionCount);
  if (action?.isSpell) {
    for (const modifier of SPELL_MODIFIERS) {
      const key = `spellModifier:${modifier.id}`;
      const enabledKey = `spellModifierEnabled:${modifier.id}`;
      const applicable = modifier.id !== "extended" || action.traits?.includes("summoning");
      const max = applicable ? (modifier.id === "quickened" ? quickenedMax : modifier.maxStacks ?? MAX_SPELL_MODIFIER_STACKS) : 0;
      const requestedCount = Number(resolvedSelections[key] ?? 0);
      const hasEnabledSelection = Object.hasOwn(resolvedSelections, enabledKey);
      const enabled = hasEnabledSelection
        ? ["1", "true", "on"].includes(String(resolvedSelections[enabledKey]).toLowerCase())
        : requestedCount > 0;
      const count = enabled ? Math.max(1, requestedCount || 1) : 0;
      resolvedSelections[enabledKey] = enabled ? "1" : "0";
      resolvedSelections[key] = count;
      if (!Number.isInteger(count) || count < 0 || count > max) {
        errors.push(`${modifier.label} must be between 0 and ${max}.`);
        continue;
      }
      if (!count) continue;
      const manaBeforeModifier = number(costs.mana);
      const multipliesCurrentMana = modifier.manaOperation === "multiply";
      const discountsCurrentMana = modifier.manaOperation === "discount";
      const manaAfterModifier = roundedCost(discountsCurrentMana
        ? manaBeforeModifier * ((1 - modifier.manaReduction) ** count)
        : multipliesCurrentMana
          ? manaBeforeModifier * (modifier.manaMultiplier ** count)
          : manaBeforeModifier + (baseSpellMana * modifier.manaMultiplier * count));
      const modifierManaCost = manaAfterModifier - manaBeforeModifier;
      selectedSpellModifiers.push({ ...modifier, count, manaCost: modifierManaCost });
      costs.mana = manaAfterModifier;
      if (modifier.id === "quickened") actionCount = Math.max(0, actionCount - count);
      if (modifier.id === "conservative") actionCount += count;
      if (modifier.id === "long-distance") range += 10 * count;
      const manaCalculation = discountsCurrentMana
        ? `Mana ${manaBeforeModifier} × 75%${count > 1 ? `^${count}` : ""} = ${manaAfterModifier}`
        : multipliesCurrentMana
          ? `Mana ${manaBeforeModifier} × ${modifier.manaMultiplier}${count > 1 ? `^${count}` : ""} = ${manaAfterModifier}`
          : `+${modifierManaCost} Mana (${count} × ${modifier.manaMultiplier} × ${baseSpellMana})`;
      const adjustment = modifier.id === "quickened" ? ` · −${count} AP`
        : modifier.id === "conservative" ? ` · +${count} AP`
          : modifier.id === "delayed" ? ` · ${count} turn${count === 1 ? "" : "s"} delayed`
            : "";
      breakdown.push({ label: modifier.label, value: `${manaCalculation}${adjustment}` });
    }
    const silenced = Array.from(actor?.effects ?? []).some(effect => {
      const id = String(effect?.statuses?.values?.().next?.().value ?? effect?.id ?? effect?.name ?? "").toLowerCase();
      return !effect?.disabled && ["silence", "silenced"].includes(id);
    });
    if (silenced && !selectedSpellModifiers.some(modifier => modifier.id === "subtle")) errors.push("This spell requires Subtle Spell while silenced.");
  }

  for (const enhancement of action?.enhancements ?? []) {
    const key = `enhancement:${enhancement.id}`;
    const count = Number(resolvedSelections[key] ?? 0);
    const max = Math.max(0, number(enhancement.maxStacks, 1));
    if (!Number.isInteger(count) || count < 0 || count > max) { errors.push(`${enhancement.label || enhancement.id} must be between 0 and ${max}.`); continue; }
    if (!count) continue;
    for (const [resource, cost] of Object.entries(enhancement.costs ?? {})) costs[resource] = number(costs[resource]) + (number(cost) * count);
    actionCount += number(enhancement.actionAdjustment) * count;
    const enhancementCosts = Object.entries(enhancement.costs ?? {}).filter(([, value]) => number(value) > 0).map(([resource, value]) => `+${number(value) * count} ${resource[0].toUpperCase()}${resource.slice(1)}`);
    const actionAdjustment = number(enhancement.actionAdjustment) * count;
    breakdown.push({ label: `${enhancement.label || enhancement.id}${count > 1 ? ` ×${count}` : ""}`, value: [...enhancementCosts, ...(actionAdjustment ? [`${actionAdjustment > 0 ? "+" : ""}${actionAdjustment} AP`] : [])].join(" · ") || "Enabled" });
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
  const hasSpellModifier = id => selectedSpellModifiers.find(modifier => modifier.id === id);
  if (action?.isSpell && (spellLevel < spellLevelMin || spellLevel > spellLevelMax)) errors.push(`Spell level must be between ${spellLevelMin} and ${spellLevelMax}.`);
  const potencyMultiplier = hasSpellModifier("increased-potency") ? 2 ** hasSpellModifier("increased-potency").count : 1;
  const attribute = attributeData(actor, action?.governingAttribute);
  const damageOptions = {
    level: action?.isSpell ? spellLevel : action?.currentLevel,
    attributeValue: attribute.value,
    attributeLabel: attribute.label,
    potencyMultiplier
  };
  let damageOutcome = action?.isSpell
    ? resolveSpellDamageFormula(levelProjection.system, damageOptions)
    : resolveActionDamageFormula(levelProjection.system.damageFormula || legacyActionDamageFormula(action), damageOptions);
  if (action?.weaponComposer) {
    // Preview the identical base, ammunition, rule dice, and option additions used by fire().
    // damageFormula remains the optional mode override consumed by execution.
    const modifier = number(action.weaponComposer.damageModifier) + number(action.weaponComposer.ammoDamageModifier) + damageModifier;
    const formula = [damageFormula || action.weaponComposer.damageFormula,
      ...(action.weaponComposer.extraDamageDice ?? []), modifier ? String(modifier) : ""].filter(Boolean).join(" + ");
    damageOutcome = resolveActionDamageFormula(formula, damageOptions);
  }
  if (hasSpellModifier("focused") && damageOutcome.available) {
    const naturalMinimum = damageOutcome.minimum;
    const focusedMinimum = Math.ceil(naturalMinimum + ((damageOutcome.maximum - naturalMinimum) / 2));
    const focusedAverage = (focusedMinimum + damageOutcome.maximum) / 2;
    damageOutcome = {
      ...damageOutcome,
      naturalMinimum,
      minimum: focusedMinimum,
      average: Number.isInteger(focusedAverage) ? focusedAverage : Number(focusedAverage.toFixed(1)),
      focused: true
    };
  }
  if (!action?.weaponComposer && damageOutcome.available) damageFormula = damageOutcome.focused
    ? `max(${damageOutcome.formula}, ${damageOutcome.minimum})`
    : damageOutcome.formula;
  const spellComposer = action?.isSpell ? {
    baseMana: baseSpellMana,
    level: { min: spellLevelMin, max: spellLevelMax, value: spellLevel },
    estimatedDamage: damageOutcome,
    modifiers: SPELL_MODIFIERS.filter(modifier => modifier.id !== "extended" || action.traits?.includes("summoning")).map(modifier => ({
      ...modifier,
      maxStacks: modifier.id === "quickened" ? quickenedMax : modifier.maxStacks ?? MAX_SPELL_MODIFIER_STACKS,
      count: selectedSpellModifiers.find(entry => entry.id === modifier.id)?.count ?? 0,
      enabled: Boolean(selectedSpellModifiers.find(entry => entry.id === modifier.id)?.count),
      costLabel: modifier.manaOperation === "discount"
        ? "−25% current Mana per stack"
        : modifier.manaOperation === "multiply"
          ? `×${modifier.manaMultiplier} current Mana per stack`
          : `+${modifier.manaMultiplier}× base Mana per stack`,
      manaCost: modifier.manaOperation === "multiply"
        ? baseSpellMana * (modifier.manaMultiplier - 1)
        : modifier.manaOperation === "discount" ? -(baseSpellMana * modifier.manaReduction) : baseSpellMana * modifier.manaMultiplier
    })),
    outcome: {
      effectMultiplier: hasSpellModifier("twinned") ? 1 + hasSpellModifier("twinned").count : 1,
      additionalTargets: hasSpellModifier("twinned")?.count ?? 0,
      rangeBonus: (hasSpellModifier("long-distance")?.count ?? 0) * 10,
      potencyMultiplier,
      ...(hasSpellModifier("focused") ? { focusedDamageFloor: damageOutcome.minimum } : {}),
      summonDurationBonus: (hasSpellModifier("extended")?.count ?? 0) * 2,
      ignoresSilence: Boolean(hasSpellModifier("subtle")),
      delayTurns: hasSpellModifier("delayed")?.count ?? 0,
      conservativeStacks: hasSpellModifier("conservative")?.count ?? 0
    }
  } : null;
  const traits = [...new Set([...(levelProjection.system.traits ?? []), ...(resolvedWeaponMode?.traits ?? []), ...selectedWeaponOptions.flatMap(option => option.traits ?? [])])];
  const timing = normalizeActionTiming(action);
  // Configuration owns the final AP cost. An authored economy object must not
  // override enhancements, rank scaling, or firing-mode adjustments afterwards.
  const economy = normalizeActionEconomy({ timing, economy: { ...levelProjection.system.economy, actions: Math.max(0, actionCount) } }, timing);
  breakdown.push({ label: "Final Cost", value: costSummary(economy.actions, costs, ammoCost, economy.reactions), final: true });
  const configured = { ...action, progression, currentLevel: spellLevel, maxLevel: progression.maxLevel, effects: levelProjection.system.effects, traits, timing, economy, actionCount: economy.actions, ammoCost, attackModifier, damageModifier, damageFormula, damageOutcome, range, resolvedWeaponMode, selectedWeaponOptions, selectedSpellModifiers, weaponComposer, spellComposer,
    costs, resourceCosts: costs, composerSelections: resolvedSelections, resolvedSelections, breakdown, configurationErrors: errors, configurationSource: action };
  const resolvedAction = context.resolveContract
    ? context.resolveContract(actor, configured, { ...context, selections: resolvedSelections, validationErrors: errors })
    : resolveAction({ actor, source: action?.source ?? action, action: configured, selections: resolvedSelections, validationErrors: errors, ...context });
  return { ...configured, resolvedAction, timing: resolvedAction.timing, economy: resolvedAction.economy,
    actionCount: resolvedAction.economy.actions, costs: resolvedAction.resourceCosts, resourceCosts: resolvedAction.resourceCosts,
    traits: resolvedAction.traits, range: resolvedAction.targeting.range,
    resolvedSelections: resolvedAction.selections, composerSelections: resolvedAction.selections,
    valid: resolvedAction.valid, errors: resolvedAction.errors };
}

export function projectedResourceCosts(actor, resolved) {
  const resources = actor?.system?.resources ?? {};
  return Object.entries(resolved?.resolvedAction?.resourceCosts ?? resolved?.costs ?? {}).filter(([, cost]) => number(cost) > 0).map(([key, cost]) => {
    const before = Math.max(0, number(resources[key]?.value));
    const resolvedCost = number(cost);
    return { key, before, after: Math.max(0, before - resolvedCost), cost: resolvedCost, affordable: resolvedCost <= before, shortfall: Math.max(0, resolvedCost - before) };
  });
}
