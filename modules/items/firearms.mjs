import { isItemEquipped, alteredItemSystem } from "../rules/item-rules.mjs";
import { applyItemWear } from "./durability.mjs";
import { getDefinitionId } from "../data/item/identity.mjs";
import { registerActorActionProvider } from "../actions/action-sources.mjs";
import { evaluateActionAvailability } from "../apps/action-hud/availability.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const legacyRefs = item => new Set([item?.id, item?.uuid, item?.name].map(value => String(value ?? "").trim()).filter(Boolean));
const matchesLegacyRef = (values, item) => [...legacyRefs(item)].some(ref => (values ?? []).includes(ref));
const matchesDefinitionId = (values, item) => {
  const definitionId = getDefinitionId(item);
  return Boolean(definitionId && (values ?? []).includes(definitionId));
};

function compatibilityFor(host) {
  return host?.system?.firearm?.compatibility ?? host?.system?.compatibility ?? {};
}

function ammoProfile(ammo) {
  return {
    id: ammo?.id ?? "",
    uuid: ammo?.uuid ?? "",
    name: ammo?.name ?? ammo?.system?.ammoName ?? "",
    img: ammo?.img ?? ammo?.system?.ammoImg ?? "",
    caliber: ammo?.system?.caliber ?? ammo?.system?.ammoCaliber ?? "",
    ammoType: ammo?.system?.ammoType ?? "",
    definitionId: getDefinitionId(ammo) || String(ammo?.system?.ammoDefinitionId ?? "")
  };
}

export function isAmmoCompatible(host, ammo) {
  const profile = ammoProfile(ammo);
  const compatibility = compatibilityFor(host);
  if (matchesDefinitionId(compatibility.blockDefinitionIds, ammo)) return false;
  if (matchesDefinitionId(compatibility.allowDefinitionIds, ammo)) return true;
  // Legacy values remain only for old documents that cannot be safely converted.
  if (matchesLegacyRef(compatibility.block, ammo)) return false;
  if (matchesLegacyRef(compatibility.allow, ammo)) return true;
  if (compatibility.flexible) return true;
  const caliber = String(compatibility.caliber ?? "").trim();
  const types = Array.isArray(compatibility.ammoTypes) ? compatibility.ammoTypes.filter(Boolean) : [];
  if (caliber && profile.caliber !== caliber) return false;
  if (types.length && !types.includes(profile.ammoType)) return false;
  return Boolean(caliber || types.length);
}

export function isMagazineCompatible(weapon, magazine) {
  if (weapon?.type !== "weapon" || magazine?.type !== "magazine") return false;
  const compatibility = compatibilityFor(weapon);
  if (matchesDefinitionId(compatibility.blockDefinitionIds, magazine)) return false;
  if (matchesDefinitionId(compatibility.allowDefinitionIds, magazine)) return true;
  if (matchesLegacyRef(compatibility.block, magazine)) return false;
  if (matchesLegacyRef(compatibility.allow, magazine)) return true;
  if (compatibility.flexible) return !magazine.system?.rounds || isAmmoCompatible(weapon, magazine);
  if (compatibility.caliber && magazine.system?.compatibility?.caliber !== compatibility.caliber) return false;
  return !magazine.system?.rounds || isAmmoCompatible(weapon, magazine);
}

function firearms(actor) {
  return actor.items.filter(item => item.type === "weapon" && item.system?.weaponKind === "firearm"
    && isItemEquipped(actor, item));
}

export function firearmLoadedState(actor, weapon) {
  const mode = weapon.system?.firearm?.magazineMode ?? "none";
  if (mode === "none") return { mode, magazine: null, rounds: 1, capacity: 1, internal: {} };
  if (mode === "detachable") {
    const magazine = actor?.items?.get(weapon.system?.firearm?.loadedMagazineId);
    return { mode, magazine, rounds: Math.max(0, Number(magazine?.system?.rounds) || 0), capacity: Math.max(0, Number(magazine?.system?.capacity) || 0) };
  }
  const internal = weapon.system?.firearm?.internal ?? {};
  return { mode, magazine: null, rounds: Math.max(0, Number(internal.quantity) || 0), capacity: Math.max(0, Number(weapon.system?.firearm?.capacity) || 0), internal };
}

function compatibleAmmunition(actor, host) {
  return actor.items.filter(item => item.type === "ammunition" && Number(item.system?.quantity) > 0 && isAmmoCompatible(host, item));
}

function compatibleMagazines(actor, weapon) {
  const loadedElsewhere = new Set(firearms(actor).map(item => item.system?.firearm?.loadedMagazineId).filter(Boolean));
  return actor.items.filter(item => item.type === "magazine" && !loadedElsewhere.has(item.id) && isMagazineCompatible(weapon, item));
}

function generatedAction(weapon, operation, data = {}) {
  const labels = { fire: "Fire", reload: "Reload", load: "Load Magazine", unload: "Unload" };
  const authoredModes = Array.from(weapon.system?.firearm?.fireModes ?? []).filter(mode => mode?.id && mode?.label);
  const modes = authoredModes.length ? authoredModes.map(mode => ({
    id: String(mode.id), label: String(mode.label), actions: Math.max(0, Number(mode.actions) || 0), ammoCost: Math.max(0, Number(mode.ammoCost) || 0),
    attackModifier: Number(mode.attackModifier) || 0, damageModifier: Number(mode.damageModifier) || 0,
    damageFormula: String(mode.damageFormula ?? ""), rangeModifier: Number(mode.rangeModifier) || 0, traits: Array.from(mode.traits ?? []).map(String)
  })) : [{ id: "single", label: "Single Shot", actions: Math.max(0, Number(weapon.system?.actions) || 1), ammoCost: 1, attackModifier: 0, damageModifier: 0, damageFormula: "", rangeModifier: 0, traits: [] }];
  const options = Array.from(weapon.system?.firearm?.options ?? []).filter(option => option?.id && option?.label).map(option => ({
    id: String(option.id), label: String(option.label), description: String(option.description ?? ""),
    actionAdjustment: Number(option.actionAdjustment) || 0, ammoAdjustment: Number(option.ammoAdjustment) || 0,
    attackModifier: Number(option.attackModifier) || 0, damageModifier: Number(option.damageModifier) || 0,
    traits: Array.from(option.traits ?? []).map(String)
  }));
  const baseDamage = String(weapon.system?.damage?.base ?? "").trim() || "1d6";
  return {
    id: `weapon:${weapon.id}:${operation}`,
    generated: true,
    weaponId: weapon.id,
    operation,
    range: Math.max(0, Number(weapon.system?.range) || 0),
    damageType: weapon.system?.damage?.type ?? "",
    img: weapon.img,
    name: `${labels[operation]} ${weapon.name}`,
    description: weapon.system?.description?.value ?? "",
    actionCount: operation === "fire" ? Math.max(0, Number(weapon.system?.actions) || 1) : 1,
    actionType: "standard",
    traits: weapon.system?.traits ?? [],
    type: weapon.system?.damage?.type ?? "",
    typeLabel: labels[operation],
    damageValue: operation === "fire" ? baseDamage : "",
    damageIcon: "",
    damageTooltip: data.status ?? "",
    traitsText: (weapon.system?.traits ?? []).join(" · "),
    cost: data.status ?? "",
    disabled: Boolean(data.disabled),
    disabledReason: data.disabledReason ?? "",
    summary: weapon.system?.summary ?? "",
    composer: operation === "fire" ? [{ key: "fireMode", label: "Fire Mode", type: "select", choices: modes.map(mode => mode.id), required: true, defaultValue: modes[0].id }] : [],
    weaponComposer: operation === "fire" ? {
      weaponName: weapon.name, weaponType: weapon.system?.weaponType ?? "", attackFormula: weapon.system?.attack?.formula ?? "1d10",
      damageFormula: baseDamage, damageMaximum: weapon.system?.damage?.max ?? baseDamage, damageModifier: Number(weapon.system?.damage?.modifier) || 0,
      damageType: weapon.system?.damage?.type ?? "", range: Math.max(0, Number(weapon.system?.range) || 0),
      ammoCurrent: Math.max(0, Number(data.rounds) || 0), ammoCapacity: Math.max(0, Number(data.capacity) || 0), modes, options
    } : null
  };
}

/** The same firearm definition feeds owned HUD actions and source/owned Item sheets. */
export function firearmActionForItem(weapon, actor = weapon?.actor) {
  if (weapon?.type !== "weapon" || weapon.system?.weaponKind !== "firearm") return null;
  const state = firearmLoadedState(actor, weapon);
  const ammo = actor?.items?.get(state.magazine?.system?.ammoId ?? state.internal?.ammoId ?? "");
  const context = actor?.getItemRuleContext?.({
    selectors: ["attack", "firearm", `weapon:${weapon.id}`],
    options: ["action:fire", "attack", `weapon:${weapon.id}`, ...(weapon.system.traits ?? []).map(trait => `trait:${trait}`), ...(ammo?.system?.traits ?? []).map(trait => `ammo-trait:${trait}`)],
    activeItemIds: ammo ? [ammo.id] : []
  });
  const system = context ? alteredItemSystem(weapon, context.resolved) : weapon.system;
  const action = generatedAction({ id: weapon.id, name: weapon.name, img: weapon.img, system }, "fire", {
    rounds: state.rounds, capacity: state.capacity,
    disabled: Boolean(actor && state.rounds <= 0),
    disabledReason: state.mode === "detachable" && !state.magazine ? "No magazine loaded." : "The weapon is empty."
  });
  action.weaponComposer.ammoDamageModifier = Number(ammo?.system?.damage?.modifier) || 0;
  action.effectiveSystem = system;
  action.weaponComposer.extraDamageDice = (context?.resolved?.damageDice ?? [])
    .filter(rule => ["all", "damage", "firearm", `weapon:${weapon.id}`].includes(rule.selector))
    .map(rule => `${rule.diceNumber}d${rule.dieSize}`);
  return action;
}

export function firearmActionsForActor(actor) {
  const actions = [];
  for (const weapon of firearms(actor)) {
    const state = firearmLoadedState(actor, weapon);
    const status = `${state.rounds}/${state.capacity}`;
    actions.push(firearmActionForItem(weapon, actor));
    if (state.mode === "detachable") {
      if (!state.magazine) {
        actions.push(generatedAction(weapon, "load", {
          status: "Select a compatible magazine",
          disabled: !compatibleMagazines(actor, weapon).length,
          disabledReason: "No compatible unloaded magazines are available."
        }));
      } else {
        if (state.rounds < state.capacity) actions.push(generatedAction(weapon, "reload", {
          status,
          disabled: !compatibleAmmunition(actor, state.magazine).length,
          disabledReason: "No compatible ammunition is available."
        }));
        actions.push(generatedAction(weapon, "unload", { status: state.magazine.name }));
      }
    } else if (state.mode === "internal") {
      if (state.rounds < state.capacity) actions.push(generatedAction(weapon, "reload", {
        status,
        disabled: !compatibleAmmunition(actor, weapon).length,
        disabledReason: "No compatible ammunition is available."
      }));
      if (state.rounds > 0) actions.push(generatedAction(weapon, "unload", { status }));
    }
  }
  return actions;
}

async function chooseDocument(title, documents) {
  if (!documents.length) return null;
  if (documents.length === 1) return documents[0];
  const options = documents.map(document => `<option value="${escape(document.id)}">${escape(document.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title }, modal: true, rejectClose: false,
    content: `<label>${escape(title)}<select name="documentId">${options}</select></label>`,
    ok: { label: game.i18n.localize("VEILRUNNER.Confirm"), callback: (event, button) => button.form.elements.documentId.value }
  });
  return documents.find(document => document.id === id) ?? null;
}

async function loadRounds(actor, target, ammo, capacity, current, pathPrefix = "system") {
  const count = Math.min(Math.max(0, capacity - current), Math.max(0, Number(ammo.system?.quantity) || 0));
  if (!count) return false;
  const profile = ammoProfile(ammo);
  const targetUpdate = { _id: target.id };
  if (target.type === "magazine") Object.assign(targetUpdate, {
    "system.rounds": current + count,
    "system.ammoId": ammo.id,
    "system.sourceAmmoId": ammo.id,
    "system.ammoName": profile.name,
    "system.ammoImg": profile.img,
    "system.ammoCaliber": profile.caliber,
    "system.ammoType": profile.ammoType,
    "system.ammoDefinitionId": profile.definitionId
  });
  else Object.assign(targetUpdate, {
    [`${pathPrefix}.quantity`]: current + count,
    [`${pathPrefix}.ammoId`]: ammo.id,
    [`${pathPrefix}.sourceAmmoId`]: ammo.id,
    [`${pathPrefix}.name`]: profile.name,
    [`${pathPrefix}.img`]: profile.img,
    [`${pathPrefix}.caliber`]: profile.caliber,
    [`${pathPrefix}.ammoType`]: profile.ammoType,
    [`${pathPrefix}.ammoDefinitionId`]: profile.definitionId
  });
  await actor.updateEmbeddedDocuments("Item", [
    { _id: ammo.id, "system.quantity": Math.max(0, Number(ammo.system.quantity) - count) },
    targetUpdate
  ]);
  return true;
}

async function reloadWeapon(actor, weapon) {
  const state = firearmLoadedState(actor, weapon);
  const host = state.magazine ?? weapon;
  const candidates = compatibleAmmunition(actor, host).filter(ammo => state.rounds <= 0 || ammo.id === (state.magazine?.system?.ammoId ?? state.internal?.ammoId));
  const ammo = await chooseDocument(`Reload ${weapon.name}`, candidates);
  if (!ammo) return false;
  if (state.magazine) return loadRounds(actor, state.magazine, ammo, state.capacity, state.rounds);
  return loadRounds(actor, weapon, ammo, state.capacity, state.rounds, "system.firearm.internal");
}

async function unloadRounds(actor, weapon, state) {
  const rounds = state.rounds;
  if (!rounds) return false;
  const sourceId = state.magazine?.system?.sourceAmmoId ?? state.internal?.sourceAmmoId;
  const source = actor.items.get(sourceId);
  const updates = [];
  if (source?.type === "ammunition") updates.push({ _id: source.id, "system.quantity": Math.max(0, Number(source.system.quantity) || 0) + rounds });
  if (state.magazine) updates.push({ _id: state.magazine.id, "system.rounds": 0, "system.ammoId": "", "system.sourceAmmoId": "" });
  else updates.push({ _id: weapon.id, "system.firearm.internal.quantity": 0, "system.firearm.internal.ammoId": "", "system.firearm.internal.sourceAmmoId": "" });
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  if (!source) {
    const profile = state.magazine ? ammoProfile(state.magazine) : state.internal;
    await actor.createEmbeddedDocuments("Item", [{
      name: profile.name || "Recovered Ammunition", type: "ammunition", img: profile.img || "icons/svg/item-bag.svg",
      system: { quantity: rounds, ammoType: profile.ammoType ?? "", caliber: profile.caliber ?? "" }
    }]);
  }
  return true;
}

async function fire(actor, weapon, { mapPenalty = 0, resolvedAction = null } = {}) {
  const state = firearmLoadedState(actor, weapon);
    const rawAmmoCost = Number(resolvedAction?.ammoCost);
    const ammoCost = Number.isFinite(rawAmmoCost) ? Math.max(0, rawAmmoCost) : 1;
  if (state.rounds < ammoCost) return ui.notifications.warn(`${weapon.name} does not have enough ammunition for that firing mode.`);
  const ammoId = state.magazine?.system?.ammoId ?? state.internal?.ammoId ?? "";
  const ammo = actor.items.get(ammoId);
  const context = actor.getItemRuleContext({
    selectors: ["attack", "firearm", `weapon:${weapon.id}`],
    options: ["action:fire", "attack", `weapon:${weapon.id}`, ...(weapon.system.traits ?? []).map(trait => `trait:${trait}`), ...(ammo?.system?.traits ?? []).map(trait => `ammo-trait:${trait}`)],
    activeItemIds: ammo ? [ammo.id] : [],
  });
  const resolved = context.resolved;
  const system = alteredItemSystem(weapon, resolved);
  const totalModifier = context.modifiers.total + Number(mapPenalty || 0) + (Number(resolvedAction?.attackModifier) || 0);
  const attackFormula = `${system.attack?.formula || "1d10"}${totalModifier ? ` + ${totalModifier}` : ""}`;
  const attack = await new Roll(attackFormula, context.rollData).evaluate();
  const extraDice = resolved.damageDice.filter(rule => ["all", "damage", "firearm", `weapon:${weapon.id}`].includes(rule.selector));
  const legacyDice = Math.max(0, Number(system.damage?.dice) || 0);
  const legacyDie = Math.max(2, Number(system.damage?.die) || 6);
  const baseDamage = String(resolvedAction?.damageFormula ?? "").trim() || String(system.damage?.base ?? "").trim() || `${legacyDice}d${legacyDie}`;
  const damageModifier = (Number(system.damage?.modifier) || 0) + (Number(ammo?.system?.damage?.modifier) || 0) + (Number(resolvedAction?.damageModifier) || 0);
  const damageFormula = [baseDamage, ...extraDice.map(rule => `${rule.diceNumber}d${rule.dieSize}`), damageModifier ? String(damageModifier) : ""].filter(Boolean).join(" + ");
  const damage = damageFormula ? await new Roll(damageFormula, context.rollData).evaluate() : null;
  if (state.magazine) await state.magazine.update({ "system.rounds": state.rounds - ammoCost });
  else if (state.mode === "internal") await weapon.update({ "system.firearm.internal.quantity": state.rounds - ammoCost });
  await applyItemWear(weapon, 1);
  await attack.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${escape(weapon.name)} — Fire${damage ? ` | Damage ${escape(damage.total)} (${escape(system.damage?.type ?? "")})` : ""}`
  });
  return true;
}

export async function executeFirearmAction(actor, weaponId, operation, options = {}) {
  if (!options.sharedExecution) {
    const action = firearmActionsForActor(actor).find(entry => entry.weaponId === weaponId && entry.operation === operation);
    if (!action) return ui.notifications.warn("That firearm action is not currently available.");
    const { executeHudAction } = await import("../apps/action-hud/execution.mjs");
    const selections = Object.fromEntries((action.composer ?? []).filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue]));
    const result = await executeHudAction(actor, action, { selections });
    return result.success;
  }
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to use this weapon.");
  const weapon = actor.items.get(weaponId);
  if (!weapon || weapon.type !== "weapon" || weapon.system?.weaponKind !== "firearm" || !isItemEquipped(actor, weapon)) {
    return ui.notifications.warn("That firearm is not currently equipped.");
  }
  const state = firearmLoadedState(actor, weapon);
  const validationAction = options.resolvedAction ?? generatedAction(weapon, operation, {
    rounds: state.rounds,
    capacity: state.capacity,
    disabled: operation === "fire" && state.rounds <= 0,
    disabledReason: state.mode === "detachable" && !state.magazine ? "No magazine loaded." : "The weapon is empty."
  });
  const resolvedSelections = options.resolvedAction?.resolvedSelections ?? options.selections ?? null;
  const availability = evaluateActionAvailability({ actor, action: validationAction, selections: resolvedSelections });
  if (!availability.available) return ui.notifications.warn(availability.reason);
  if (operation === "fire") return fire(actor, weapon, options);
  if (operation === "reload") return reloadWeapon(actor, weapon);
  if (operation === "load") {
    if (state.mode !== "detachable" || state.magazine) return false;
    const magazine = await chooseDocument(`Load ${weapon.name}`, compatibleMagazines(actor, weapon));
    if (!magazine) return false;
    return weapon.update({ "system.firearm.loadedMagazineId": magazine.id });
  }
  if (operation === "unload") {
    if (state.mode === "detachable") {
      if (!state.magazine) return false;
      return weapon.update({ "system.firearm.loadedMagazineId": "" });
    }
    return unloadRounds(actor, weapon, state);
  }
  return false;
}

registerActorActionProvider("firearms", firearmActionsForActor);
