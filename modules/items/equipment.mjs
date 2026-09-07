import { EQUIPMENT_SLOTS } from "../data/item/physical.mjs";
import { itemHasCapability } from "../data/definitions/item-capabilities.mjs";
import { itemTypesWithCapability } from "../data/definitions/item-capabilities.mjs";
import { CanonicalDefinitionReader } from "../data/definitions/canonical-reader.mjs";
import { prepareActorOwnedSnapshot } from "../data/definitions/provenance.mjs";
import { equipmentBySlot, equippedSlotsForItem, itemRequiredSlots, resolveActorItemRules } from "../rules/item-rules.mjs";
import { evaluateActionAvailability } from "../apps/action-hud/availability.mjs";
import { spendActionEconomy } from "../apps/action-hud/economy.mjs";
import { captureHudUndoState, storeHudUndoState } from "../apps/action-hud/undo.mjs";

function systemFlagScope() {
  return game.system.id;
}

function grantFlag(document, key) {
  const scope = systemFlagScope();
  return document.getFlag?.(scope, key)
    ?? foundry.utils.getProperty(document, `flags.${scope}.${key}`)
    ?? foundry.utils.getProperty(document, `flags.veilrunner.${key}`);
}

export function equipmentAssignments(equipment = {}) {
  const byItem = new Map();
  for (const slot of EQUIPMENT_SLOTS) {
    const itemId = String(equipment?.[slot] ?? "");
    if (!itemId) continue;
    const slots = byItem.get(itemId) ?? [];
    slots.push(slot);
    byItem.set(itemId, slots);
  }
  return [...byItem].map(([itemId, slots]) => ({ itemId, slots }));
}

export function itemAcceptsEquipmentSlot(item, slot) {
  return itemHasCapability(item, "equippable") && EQUIPMENT_SLOTS.includes(slot) && itemRequiredSlots(item).includes(slot);
}

async function applyGrantRules(actor, sourceItem) {
  const resolved = resolveActorItemRules(actor, { options: ["item:equip"] });
  const grants = resolved.grants.filter(rule => rule.itemId === sourceItem.id);
  for (const grant of grants) {
    if (actor.items.some(item => grantFlag(item, "grantedBy") === `${sourceItem.id}:${grant.slug}`)) continue;
    let document;
    try {
      const reader = new CanonicalDefinitionReader(itemTypesWithCapability("actorOwned"));
      const records = await reader.records();
      const record = grant.definitionId ? records.find(entry => entry.definitionId === grant.definitionId)
        : records.find(entry => `Compendium.${entry.packCollection}.Item.${entry.documentId}` === grant.uuid);
      if (!record) throw new Error("The selected definition is unavailable.");
      document = await reader.resolve(record.definitionId);
    } catch (error) {
      ui.notifications.warn(`Could not resolve the canonical grant from ${sourceItem.name}.`);
      continue;
    }
    const data = prepareActorOwnedSnapshot(document, { sourceVersion: game.system.version, currentLevel: 1 });
    const flagPath = `flags.${systemFlagScope()}`;
    foundry.utils.setProperty(data, `${flagPath}.grantedBy`, `${sourceItem.id}:${grant.slug}`);
    foundry.utils.setProperty(data, `${flagPath}.grantDuration`, grant.duration);
    await actor.createEmbeddedDocuments("Item", [data]);
  }
}

function equipmentAction(actor, actionCount = 1, name = "Change Equipment") {
  return {
    id: `equipment:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    actionType: "standard",
    actionCount: Math.max(1, Math.floor(Number(actionCount) || 1)),
    costs: {},
    traits: []
  };
}

export function canSpendEquipmentActions(actor, actionCount = 1, { notify = true } = {}) {
  const availability = evaluateActionAvailability({ actor, action: equipmentAction(actor, actionCount) });
  if (!availability.available && notify) ui.notifications.warn(availability.reason || "This equipment change is unavailable.");
  return availability.available;
}

async function performEquipmentAction(actor, name, operation) {
  const action = equipmentAction(actor, 1, name);
  if (!canSpendEquipmentActions(actor, 1)) return false;
  const undoSnapshot = captureHudUndoState(actor, action);
  if (!await operation()) return false;
  if (!await spendActionEconomy(actor, action)) {
    ui.notifications.warn("The equipment changed, but its action point could not be spent.");
    return false;
  }
  try {
    await storeHudUndoState(actor, undoSnapshot);
  } catch (error) {
    console.warn("Veilrunner | The equipment changed, but its undo state could not be recorded", error);
  }
  return true;
}

export async function equipPhysicalItem(actor, item) {
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to equip this item.");
  if (!item || item.parent?.id !== actor.id) return ui.notifications.warn("That item is not owned by this actor.");
  if (!itemHasCapability(item, "equippable")) return ui.notifications.warn(`${item.name} cannot be equipped.`);
  const required = itemRequiredSlots(item);
  if (!required.length) return ui.notifications.warn(`${item.name} has no required equipment slots.`);
  const equipment = equipmentBySlot(actor);
  const conflicts = required
    .map(slot => ({ slot, itemId: equipment[slot] }))
    .filter(entry => entry.itemId && entry.itemId !== item.id);
  if (conflicts.length) {
    const labels = conflicts.map(({ slot, itemId }) => `${game.i18n.localize(`VEILRUNNER.Slot.${slot}`)} (${actor.items.get(itemId)?.name ?? "occupied"})`);
    return ui.notifications.warn(`${item.name} cannot be equipped: ${labels.join(", ")}.`);
  }

  const equippedSlots = equippedSlotsForItem(actor, item.id).sort();
  const expectedSlots = [...required].sort();
  if (equippedSlots.length === expectedSlots.length && equippedSlots.every((slot, index) => slot === expectedSlots[index])) return true;

  const updates = {};
  for (const slot of EQUIPMENT_SLOTS) {
    if (equipment[slot] === item.id && !required.includes(slot)) updates[`system.equipment.${slot}`] = "";
  }
  for (const slot of required) updates[`system.equipment.${slot}`] = item.id;
  const nextEquipment = { ...equipment };
  for (const [path, value] of Object.entries(updates)) nextEquipment[path.split(".").at(-1)] = value;
  updates["system.equipmentAssignments"] = equipmentAssignments(nextEquipment);
  return performEquipmentAction(actor, `Equip ${item.name}`, async () => {
    await actor.update(updates);
    await applyGrantRules(actor, item);
    return true;
  });
}

export async function unequipPhysicalItem(actor, itemOrSlot) {
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to unequip this item.");
  const item = typeof itemOrSlot === "string"
    ? actor.items.get(equipmentBySlot(actor)[itemOrSlot])
    : itemOrSlot;
  if (!item) return false;
  const occupiedSlots = equippedSlotsForItem(actor, item.id);
  if (!occupiedSlots.length) return false;
  const updates = {};
  const equipment = equipmentBySlot(actor);
  for (const slot of occupiedSlots) updates[`system.equipment.${slot}`] = "";
  const nextEquipment = { ...equipment };
  for (const path of Object.keys(updates)) nextEquipment[path.split(".").at(-1)] = "";
  updates["system.equipmentAssignments"] = equipmentAssignments(nextEquipment);
  return performEquipmentAction(actor, `Unequip ${item.name}`, async () => {
    await actor.update(updates);
    const granted = actor.items.filter(document => grantFlag(document, "grantedBy")?.startsWith(`${item.id}:`)
      && grantFlag(document, "grantDuration") === "while-equipped");
    if (granted.length) await actor.deleteEmbeddedDocuments("Item", granted.map(document => document.id));
    return true;
  });
}
