import { isItemEquipped, alteredItemSystem } from "../rules/item-rules.mjs";
import { applyItemWear } from "./durability.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const refs = item => new Set([item?.id, item?.uuid, item?.name].map(value => String(value ?? "").trim()).filter(Boolean));
const matchesRef = (values, item) => [...refs(item)].some(ref => (values ?? []).includes(ref));

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
    ammoType: ammo?.system?.ammoType ?? ""
  };
}

export function isAmmoCompatible(host, ammo) {
  const profile = ammoProfile(ammo);
  const compatibility = compatibilityFor(host);
  if (matchesRef(compatibility.block, ammo)) return false;
  if (matchesRef(compatibility.allow, ammo)) return true;
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
  if (matchesRef(compatibility.block, magazine)) return false;
  if (matchesRef(compatibility.allow, magazine)) return true;
  if (compatibility.flexible) return !magazine.system?.rounds || isAmmoCompatible(weapon, magazine);
  if (compatibility.caliber && magazine.system?.compatibility?.caliber !== compatibility.caliber) return false;
  return !magazine.system?.rounds || isAmmoCompatible(weapon, magazine);
}

function firearms(actor) {
  return actor.items.filter(item => item.type === "weapon" && item.system?.weaponKind === "firearm" && isItemEquipped(actor, item));
}

function loadedState(actor, weapon) {
  const mode = weapon.system?.firearm?.magazineMode ?? "none";
  if (mode === "none") return { mode, magazine: null, rounds: 1, capacity: 1, internal: {} };
  if (mode === "detachable") {
    const magazine = actor.items.get(weapon.system?.firearm?.loadedMagazineId);
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
  return {
    id: `weapon:${weapon.id}:${operation}`,
    generated: true,
    weaponId: weapon.id,
    operation,
    img: weapon.img,
    name: `${labels[operation]} ${weapon.name}`,
    description: weapon.system?.description?.value ?? "",
    actionCount: operation === "fire" ? Math.max(0, Number(weapon.system?.actions) || 1) : 1,
    type: weapon.system?.damage?.type ?? "",
    typeLabel: labels[operation],
    damageValue: operation === "fire" ? `${Math.max(0, Number(weapon.system?.damage?.dice) || 0)}d${Math.max(2, Number(weapon.system?.damage?.die) || 6)}` : "",
    damageIcon: "",
    damageTooltip: data.status ?? "",
    traitsText: (weapon.system?.traits ?? []).join(" · "),
    cost: data.status ?? "",
    disabled: Boolean(data.disabled),
    disabledReason: data.disabledReason ?? ""
  };
}

export function firearmActionsForActor(actor) {
  const actions = [];
  for (const weapon of firearms(actor)) {
    const state = loadedState(actor, weapon);
    const status = `${state.rounds}/${state.capacity}`;
    actions.push(generatedAction(weapon, "fire", {
      status,
      disabled: state.rounds <= 0,
      disabledReason: state.mode === "detachable" && !state.magazine ? "No magazine loaded." : "The weapon is empty."
    }));
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
    "system.ammoType": profile.ammoType
  });
  else Object.assign(targetUpdate, {
    [`${pathPrefix}.quantity`]: current + count,
    [`${pathPrefix}.ammoId`]: ammo.id,
    [`${pathPrefix}.sourceAmmoId`]: ammo.id,
    [`${pathPrefix}.name`]: profile.name,
    [`${pathPrefix}.img`]: profile.img,
    [`${pathPrefix}.caliber`]: profile.caliber,
    [`${pathPrefix}.ammoType`]: profile.ammoType
  });
  await actor.updateEmbeddedDocuments("Item", [
    { _id: ammo.id, "system.quantity": Math.max(0, Number(ammo.system.quantity) - count) },
    targetUpdate
  ]);
  return true;
}

async function reloadWeapon(actor, weapon) {
  const state = loadedState(actor, weapon);
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

async function fire(actor, weapon) {
  const state = loadedState(actor, weapon);
  if (state.rounds <= 0) return ui.notifications.warn(`${weapon.name} is empty.`);
  const ammoId = state.magazine?.system?.ammoId ?? state.internal?.ammoId ?? "";
  const ammo = actor.items.get(ammoId);
  const context = actor.getItemRuleContext({
    selectors: ["attack", "firearm", `weapon:${weapon.id}`],
    options: ["action:fire", "attack", `weapon:${weapon.id}`, ...(weapon.system.traits ?? []).map(trait => `trait:${trait}`), ...(ammo?.system?.traits ?? []).map(trait => `ammo-trait:${trait}`)],
    activeItemIds: ammo ? [ammo.id] : [],
  });
  const resolved = context.resolved;
  const system = alteredItemSystem(weapon, resolved);
  const attackFormula = `${system.attack?.formula || "1d10"}${context.modifiers.total ? ` + ${context.modifiers.total}` : ""}`;
  const attack = await new Roll(attackFormula, context.rollData).evaluate();
  const extraDice = resolved.damageDice.filter(rule => ["all", "damage", "firearm", `weapon:${weapon.id}`].includes(rule.selector));
  const legacyDice = Math.max(0, Number(system.damage?.dice) || 0);
  const legacyDie = Math.max(2, Number(system.damage?.die) || 6);
  const baseDamage = String(system.damage?.base ?? "").trim() || `${legacyDice}d${legacyDie}`;
  const damageModifier = (Number(system.damage?.modifier) || 0) + (Number(ammo?.system?.damage?.modifier) || 0);
  const damageFormula = [baseDamage, ...extraDice.map(rule => `${rule.diceNumber}d${rule.dieSize}`), damageModifier ? String(damageModifier) : ""].filter(Boolean).join(" + ");
  const damage = damageFormula ? await new Roll(damageFormula, context.rollData).evaluate() : null;
  if (state.magazine) await state.magazine.update({ "system.rounds": state.rounds - 1 });
  else if (state.mode === "internal") await weapon.update({ "system.firearm.internal.quantity": state.rounds - 1 });
  await applyItemWear(weapon, 1);
  await attack.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${escape(weapon.name)} — Fire${damage ? ` | Damage ${escape(damage.total)} (${escape(system.damage?.type ?? "")})` : ""}`
  });
  return true;
}

export async function executeFirearmAction(actor, weaponId, operation) {
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to use this weapon.");
  const weapon = actor.items.get(weaponId);
  if (!weapon || weapon.type !== "weapon" || weapon.system?.weaponKind !== "firearm" || !isItemEquipped(actor, weapon)) {
    return ui.notifications.warn("That firearm is not currently equipped.");
  }
  const state = loadedState(actor, weapon);
  if (operation === "fire") return fire(actor, weapon);
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
