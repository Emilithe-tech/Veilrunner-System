import { EQUIPMENT_SLOTS } from "../data/item/physical.mjs";
import { equipmentBySlot, equippedSlotsForItem, itemRequiredSlots, resolveActorItemRules } from "../rules/item-rules.mjs";

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
  return EQUIPMENT_SLOTS.includes(slot) && itemRequiredSlots(item).includes(slot);
}

async function applyGrantRules(actor, sourceItem) {
  const resolved = resolveActorItemRules(actor, { options: ["item:equip"] });
  const grants = resolved.grants.filter(rule => rule.itemId === sourceItem.id);
  for (const grant of grants) {
    if (actor.items.some(item => grantFlag(item, "grantedBy") === `${sourceItem.id}:${grant.slug}`)) continue;
    const document = await fromUuid(grant.uuid);
    if (!document || document.documentName !== "Item") {
      ui.notifications.warn(`Could not grant ${grant.uuid} from ${sourceItem.name}.`);
      continue;
    }
    const data = document.toObject();
    delete data._id;
    const flagPath = `flags.${systemFlagScope()}`;
    foundry.utils.setProperty(data, `${flagPath}.grantedBy`, `${sourceItem.id}:${grant.slug}`);
    foundry.utils.setProperty(data, `${flagPath}.grantDuration`, grant.duration);
    await actor.createEmbeddedDocuments("Item", [data]);
  }
}

export async function equipPhysicalItem(actor, item) {
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to equip this item.");
  if (!item || item.parent?.id !== actor.id) return ui.notifications.warn("That item is not owned by this actor.");
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

  const updates = {};
  for (const slot of EQUIPMENT_SLOTS) {
    if (equipment[slot] === item.id && !required.includes(slot)) updates[`system.equipment.${slot}`] = "";
  }
  for (const slot of required) updates[`system.equipment.${slot}`] = item.id;
  const nextEquipment = { ...equipment };
  for (const [path, value] of Object.entries(updates)) nextEquipment[path.split(".").at(-1)] = value;
  updates["system.equipmentAssignments"] = equipmentAssignments(nextEquipment);
  await actor.update(updates);
  await applyGrantRules(actor, item);
  return true;
}

export async function unequipPhysicalItem(actor, itemOrSlot) {
  if (!actor?.isOwner) return ui.notifications.warn("You do not have permission to unequip this item.");
  const item = typeof itemOrSlot === "string"
    ? actor.items.get(equipmentBySlot(actor)[itemOrSlot])
    : itemOrSlot;
  if (!item) return false;
  const updates = {};
  const equipment = equipmentBySlot(actor);
  for (const slot of equippedSlotsForItem(actor, item.id)) updates[`system.equipment.${slot}`] = "";
  const nextEquipment = { ...equipment };
  for (const path of Object.keys(updates)) nextEquipment[path.split(".").at(-1)] = "";
  updates["system.equipmentAssignments"] = equipmentAssignments(nextEquipment);
  await actor.update(updates);
  const granted = actor.items.filter(document => grantFlag(document, "grantedBy")?.startsWith(`${item.id}:`)
    && grantFlag(document, "grantDuration") === "while-equipped");
  if (granted.length) await actor.deleteEmbeddedDocuments("Item", granted.map(document => document.id));
  return true;
}
