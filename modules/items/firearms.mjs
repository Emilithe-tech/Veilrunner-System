import { isItemEquipped, alteredItemSystem } from "../rules/item-rules.mjs";
import { applyItemWear } from "./durability.mjs";
import { getDefinitionId } from "../data/item/identity.mjs";
import { registerActorActionProvider } from "../actions/action-sources.mjs";
import { evaluateActionAvailability } from "../apps/action-hud/availability.mjs";
import { firearmDamageFormula } from "./firearm-damage.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const roundTransfers = new WeakSet();

async function withRoundTransfer(actor, operation) {
  if (roundTransfers.has(actor)) throw new Error("Another ammunition transfer is still in progress.");
  roundTransfers.add(actor);
  try { return await operation(); }
  finally { roundTransfers.delete(actor); }
}
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
  if (!["ammunition", "magazine"].includes(ammo?.type)) return false;
  const profile = ammoProfile(ammo);
  const compatibility = compatibilityFor(host);
  if (ammo.type === "magazine") ammo = { id: ammo.system?.ammoId, name: ammo.system?.ammoName, system: { definitionId: ammo.system?.ammoDefinitionId } };
  if (matchesDefinitionId(compatibility.blockDefinitionIds, ammo)) return false;
  if (matchesLegacyRef(compatibility.block, ammo)) return false;
  if (matchesDefinitionId(compatibility.allowDefinitionIds, ammo)) return true;
  // Legacy values remain only for old documents that cannot be safely converted.
  if (matchesLegacyRef(compatibility.allow, ammo)) return true;
  if (compatibility.flexible) return true;
  const caliber = String(compatibility.caliber ?? "").trim();
  const types = Array.isArray(compatibility.ammoTypes) ? compatibility.ammoTypes.filter(Boolean) : [];
  if (caliber && profile.caliber !== caliber) return false;
  if (types.length && !types.includes(profile.ammoType)) return false;
  return types.length > 0;
}

export function isMagazineCompatible(weapon, magazine) {
  if (Number(magazine?.system?.quantity) > 1) return false;
  if (weapon?.type !== "weapon" || weapon.system?.weaponKind !== "firearm" || magazine?.type !== "magazine") return false;
  const compatibility = compatibilityFor(weapon);
  if (matchesDefinitionId(compatibility.blockDefinitionIds, magazine)) return false;
  if (matchesLegacyRef(compatibility.block, magazine)) return false;
  const explicitlyAllowed = matchesDefinitionId(compatibility.allowDefinitionIds, magazine) || matchesLegacyRef(compatibility.allow, magazine);
  if (!compatibility.flexible && !explicitlyAllowed) {
    if (compatibility.caliber && magazine.system?.compatibility?.caliber !== compatibility.caliber) return false;
    const magazineTypes = compatibility.magazineTypes ?? [];
    if (!magazineTypes.length || !magazineTypes.includes(magazine.system?.magazineType)) return false;
    const ammoTypes = compatibility.ammoTypes ?? [];
    if (!ammoTypes.length || !(magazine.system?.compatibility?.ammoTypes ?? []).some(type => ammoTypes.includes(type))) return false;
  }
  return !magazine.system?.rounds || (isAmmoCompatible(weapon, magazine) && isAmmoCompatible(magazine, magazine));
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
  const loadedElsewhere = new Set(actor.items.filter(item => item.type === "weapon").map(item => item.system?.firearm?.loadedMagazineId).filter(Boolean));
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
  const profile = state.magazine?.system ?? state.internal ?? {};
  const ammoBase = profile.ammoDamage || ammo?.system?.damage?.base || "";
  const ammoDamageType = profile.ammoDamageType || ammo?.system?.damage?.type || "";
  const validDamage = state.mode === "none" || Boolean(firearmDamageFormula(ammoBase, system.damage?.max, { capped: true }));
  const compatible = state.mode === "none" || (state.magazine ? isMagazineCompatible(weapon, state.magazine)
    : isAmmoCompatible(weapon, { type: "ammunition", system: { ...state.internal, definitionId: state.internal?.ammoDefinitionId } }));
  const action = generatedAction({ id: weapon.id, name: weapon.name, img: weapon.img, system }, "fire", {
    status: `${state.rounds}/${state.capacity}`,
    rounds: state.rounds, capacity: state.capacity,
    disabled: Boolean(actor && (state.rounds <= 0 || !compatible || !validDamage)),
    disabledReason: state.mode === "detachable" && !state.magazine ? "No magazine loaded." : !compatible ? "The loaded ammunition or magazine is incompatible." : !validDamage ? "Configure ammunition base damage and a valid weapon damage maximum before firing." : "The weapon is empty."
  });
  action.weaponComposer.ammoDamageModifier = Number(profile.ammoDamage ? profile.ammoDamageModifier : ammo?.system?.damage?.modifier) || 0;
  if (state.mode !== "none") {
    action.weaponComposer.damageFormula = ammoBase;
    action.weaponComposer.capAmmoDamage = true;
    action.damageValue = ammoBase;
    action.damageType = ammoDamageType;
    action.weaponComposer.damageType = ammoDamageType;
  }
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
  return withRoundTransfer(actor, () => transferRounds(actor, target, ammo, capacity, current, pathPrefix));
}

async function transferRounds(actor, target, ammo, capacity, current, pathPrefix) {
  if (!actor.isOwner || actor.items.get(ammo.id) !== ammo || actor.items.get(target.id) !== target || !isAmmoCompatible(target, ammo)) return false;
  const state = target.type === "magazine" ? target.system : target.system.firearm.internal;
  const liveRounds = Number(target.type === "magazine" ? state.rounds : state.quantity) || 0;
  if (liveRounds !== current || (current > 0 && state.ammoId !== ammo.id)) return false;
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
    "system.ammoDamage": ammo.system?.damage?.base ?? "",
    "system.ammoDamageType": ammo.system?.damage?.type ?? "",
    "system.ammoDamageModifier": Number(ammo.system?.damage?.modifier) || 0,
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
    [`${pathPrefix}.ammoDamage`]: ammo.system?.damage?.base ?? "",
    [`${pathPrefix}.ammoDamageType`]: ammo.system?.damage?.type ?? "",
    [`${pathPrefix}.ammoDamageModifier`]: Number(ammo.system?.damage?.modifier) || 0,
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
  if (state.mode === "none" || (state.mode === "detachable" && !state.magazine)) return false;
  const host = state.magazine ?? weapon;
  const candidates = compatibleAmmunition(actor, host).filter(ammo => isAmmoCompatible(weapon, ammo) && (state.rounds <= 0 || ammo.id === (state.magazine?.system?.ammoId ?? state.internal?.ammoId)));
  const ammo = await chooseDocument(`Reload ${weapon.name}`, candidates);
  if (!ammo) return false;
  const latest = firearmLoadedState(actor, weapon);
  if (latest.mode !== state.mode || latest.magazine?.id !== state.magazine?.id || latest.rounds !== state.rounds) return false;
  if (!isAmmoCompatible(host, ammo) || !isAmmoCompatible(weapon, ammo)) return false;
  if (state.magazine) return loadRounds(actor, state.magazine, ammo, state.capacity, state.rounds);
  return loadRounds(actor, weapon, ammo, state.capacity, state.rounds, "system.firearm.internal");
}

async function unloadRounds(actor, weapon, state) {
  return withRoundTransfer(actor, () => returnRounds(actor, weapon, state));
}

async function returnRounds(actor, weapon, state) {
  const rounds = state.rounds;
  if (!rounds) return false;
  const sourceId = state.magazine?.system?.sourceAmmoId ?? state.internal?.sourceAmmoId;
  const source = actor.items.get(sourceId);
  if (source?.type !== "ammunition") throw new Error("The original ammo stack is missing. Restore it before unloading to preserve its definition and damage.");
  const updates = [];
  if (source?.type === "ammunition") updates.push({ _id: source.id, "system.quantity": Math.max(0, Number(source.system.quantity) || 0) + rounds });
  if (state.magazine) updates.push({ _id: state.magazine.id, "system.rounds": 0, "system.ammoId": "", "system.sourceAmmoId": "" });
  else updates.push({ _id: weapon.id, "system.firearm.internal.quantity": 0, "system.firearm.internal.ammoId": "", "system.firearm.internal.sourceAmmoId": "" });
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return true;
}

export async function executeMagazineAction(actor, magazineId, operation, { ammoId = "" } = {}) {
  if (!actor?.isOwner) throw new Error("You do not have permission to load this magazine.");
  const magazine = actor.items.get(magazineId);
  if (magazine?.type !== "magazine") return false;
  if (Number(magazine.system.quantity) > 1) throw new Error("Split this magazine stack into separate items before loading rounds.");
  if (actor.items.some(item => item.type === "weapon" && item.system?.firearm?.loadedMagazineId === magazineId)) {
    throw new Error("Remove the magazine from its firearm before changing its rounds.");
  }
  const current = Number(magazine.system.rounds) || 0;
  if (operation === "unload") return unloadRounds(actor, magazine, { magazine, rounds: current });
  if (operation !== "load") return false;
  const candidates = compatibleAmmunition(actor, magazine).filter(ammo => !current || ammo.id === magazine.system.ammoId);
  const ammo = ammoId ? candidates.find(entry => entry.id === ammoId) : await chooseDocument(`Load rounds into ${magazine.name}`, candidates);
  if (!ammo) return false;
  if (actor.items.some(item => item.type === "weapon" && item.system?.firearm?.loadedMagazineId === magazineId)) return false;
  const rounds = Number(magazine.system.rounds) || 0;
  if (!isAmmoCompatible(magazine, ammo) || (rounds > 0 && magazine.system.ammoId !== ammo.id)) return false;
  return loadRounds(actor, magazine, ammo, Number(magazine.system.capacity) || 0, rounds);
}

export function firearmLoadingInCombat(actor) {
  const combat = globalThis.game?.combat;
  return Boolean(combat?.started && Array.from(combat.combatants ?? []).some(entry => entry.actor?.id === actor?.id));
}

export async function splitMagazineStack(actor, magazineId) {
  if (!actor?.isOwner) throw new Error("You do not have permission to split this magazine stack.");
  return withRoundTransfer(actor, async () => {
    const magazine = actor.items.get(magazineId);
    const quantity = Number(magazine?.system?.quantity);
    if (magazine?.type !== "magazine" || !Number.isSafeInteger(quantity) || quantity <= 1) return false;
    const source = magazine.toObject();
    delete source._id;
    delete source.folder;
    delete source.sort;
    source.system.quantity = 1;
    source.system.rounds = 0;
    for (const key of ["ammoId", "sourceAmmoId", "ammoName", "ammoImg", "ammoCaliber", "ammoType", "ammoDefinitionId", "ammoDamage", "ammoDamageType"]) source.system[key] = "";
    source.system.ammoDamageModifier = 0;
    const created = await actor.createEmbeddedDocuments("Item", Array.from({ length: quantity - 1 }, () => structuredClone(source)));
    try {
      if (created.length !== quantity - 1) throw new Error("Not all magazines could be created.");
      await magazine.update({ "system.quantity": 1 });
    } catch (error) {
      await actor.deleteEmbeddedDocuments("Item", created.map(item => item.id));
      throw error;
    }
    return true;
  });
}

export async function setLoadedMagazine(actor, weaponId, magazineId = "") {
  if (!actor?.isOwner) throw new Error("You do not have permission to load this firearm.");
  if (firearmLoadingInCombat(actor)) throw new Error("Use the equipped firearm's Loadout or Action HUD during combat so action costs are applied.");
  return withRoundTransfer(actor, async () => {
    const weapon = actor.items.get(weaponId);
    if (weapon?.type !== "weapon" || weapon.system?.weaponKind !== "firearm" || weapon.system?.firearm?.magazineMode !== "detachable") return false;
    if (!magazineId) {
      if (!weapon.system.firearm.loadedMagazineId) return false;
      await weapon.update({ "system.firearm.loadedMagazineId": "" });
      return true;
    }
    if (weapon.system.firearm.loadedMagazineId) throw new Error("Remove the current magazine first.");
    const magazine = compatibleMagazines(actor, weapon).find(entry => entry.id === magazineId);
    if (!magazine) throw new Error("This magazine is incompatible or already installed in another firearm.");
    await weapon.update({ "system.firearm.loadedMagazineId": magazine.id });
    return true;
  });
}

async function fire(actor, weapon, { mapPenalty = 0, resolvedAction = null } = {}) {
  const state = firearmLoadedState(actor, weapon);
  const currentAction = firearmActionForItem(weapon, actor);
  if (currentAction.disabled) return ui.notifications.warn(currentAction.disabledReason);
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
  const ammoModifier = currentAction.weaponComposer.ammoDamageModifier;
  const ammoBase = [currentAction.weaponComposer.damageFormula, ammoModifier ? String(ammoModifier) : ""].filter(Boolean).join(" + ");
  const baseDamage = firearmDamageFormula(state.mode !== "none" ? ammoBase : String(resolvedAction?.damageFormula ?? "").trim() || currentAction.weaponComposer.damageFormula || `${legacyDice}d${legacyDie}`, system.damage?.max, { capped: state.mode !== "none" });
  if (!baseDamage) return ui.notifications.warn("Configure ammunition base damage and a valid weapon damage maximum before firing.");
  const damageModifier = (Number(system.damage?.modifier) || 0) + (state.mode === "none" ? ammoModifier : 0) + (Number(resolvedAction?.damageModifier) || 0);
  const damageFormula = [baseDamage, ...extraDice.map(rule => `${rule.diceNumber}d${rule.dieSize}`), damageModifier ? String(damageModifier) : ""].filter(Boolean).join(" + ");
  const damage = damageFormula ? await new Roll(damageFormula, context.rollData).evaluate() : null;
  if (state.magazine) await state.magazine.update({ "system.rounds": state.rounds - ammoCost });
  else if (state.mode === "internal") await weapon.update({ "system.firearm.internal.quantity": state.rounds - ammoCost });
  await applyItemWear(weapon, 1);
  await attack.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${escape(weapon.name)} — Fire${damage ? ` | Damage ${escape(damage.total)} (${escape(currentAction.damageType ?? "")})` : ""}`
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
    if (!magazine || !compatibleMagazines(actor, weapon).some(entry => entry.id === magazine.id)) return false;
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
