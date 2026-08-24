import { equipPhysicalItem, unequipPhysicalItem } from "../../items/equipment.mjs";
import { equipmentBySlot, itemRequiredSlots } from "../../rules/item-rules.mjs";

export async function switchEquippedWeapon(actor, weapon) {
  if (!actor?.isOwner || weapon?.parent?.id !== actor.id || weapon.type !== "weapon") return false;
  const equipment = equipmentBySlot(actor);
  const conflicts = [...new Set(itemRequiredSlots(weapon).map(slot => equipment[slot]).filter(id => id && id !== weapon.id))]
    .map(id => actor.items.get(id)).filter(Boolean);
  for (const conflict of conflicts) await unequipPhysicalItem(actor, conflict);
  return equipPhysicalItem(actor, weapon);
}

export async function chooseWeapon(actor, weapons = Array.from(actor?.items ?? []).filter(item => item.type === "weapon")) {
  if (!weapons.length) return null;
  if (weapons.length === 1) return weapons[0];
  const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
  const options = weapons.map(weapon => `<option value="${escape(weapon.id)}">${escape(weapon.name)}</option>`).join("");
  const id = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Switch Equipped Weapon" }, modal: true, rejectClose: false,
    content: `<label>Weapon <select name="weaponId">${options}</select></label>`,
    ok: { label: "Equip", callback: (event, button) => button.form.elements.weaponId.value }
  });
  return weapons.find(weapon => weapon.id === id) ?? null;
}

