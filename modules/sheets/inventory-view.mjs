import { itemHasCapability } from "../data/definitions/item-capabilities.mjs";

const NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Select inventory from the supplied owned snapshots without resolving definitions. */
export function selectInventoryItems(items = []) {
  return Array.from(items).filter(item => itemHasCapability(item, "inventory"));
}

export const INVENTORY_SORT_KEYS = Object.freeze([
  "type-name",
  "name-asc",
  "name-desc",
  "weight-desc",
  "quantity-desc",
  "manual"
]);

function compareName(left, right) {
  return NAME_COLLATOR.compare(String(left?.name ?? ""), String(right?.name ?? ""));
}

function compareType(left, right) {
  return (Number(left?.groupOrder) || 0) - (Number(right?.groupOrder) || 0)
    || (Number(left?.subtypeOrder) || 0) - (Number(right?.subtypeOrder) || 0)
    || NAME_COLLATOR.compare(String(left?.subtypeLabel ?? ""), String(right?.subtypeLabel ?? ""))
    || compareName(left, right);
}

function inventoryStackKey(item) {
  if (item?.stackKey) return String(item.stackKey);
  return [
    item?.type,
    item?.name,
    item?.category,
    item?.inventoryFilterKey,
    item?.grade,
    item?.rarity?.slug,
    item?.equipmentSlot,
    item?.isJunkMarked ? "junk-marked" : "category-item",
    item?.equipped ? "equipped" : "carried"
  ].map(value => String(value ?? "").trim().toLowerCase()).join("|");
}

/** Collapse equivalent prepared entries into one non-destructive display stack. */
export function stackInventoryItems(items) {
  const stacks = new Map();
  for (const item of items) {
    const key = item?.type === "magazine" ? Symbol(item.id) : inventoryStackKey(item);
    const quantity = Math.max(0, Number(item?.quantity ?? 1) || 0);
    const current = stacks.get(key);
    if (!current) {
      stacks.set(key, {
        ...item,
        quantity,
        stackSize: 1,
        itemIds: item?.id ? [item.id] : []
      });
      continue;
    }
    current.quantity += quantity;
    current.stackSize += 1;
    if (item?.id) current.itemIds.push(item.id);
    current.documentSort = Math.min(Number(current.documentSort) || 0, Number(item?.documentSort) || 0);
  }
  return [...stacks.values()];
}

/** Return a stable sorted copy of the prepared inventory items. */
export function sortInventoryItems(items, sort = "type-name") {
  const activeSort = INVENTORY_SORT_KEYS.includes(sort) ? sort : "type-name";
  return [...items].sort((left, right) => {
    switch (activeSort) {
      case "name-asc": return compareName(left, right) || compareType(left, right);
      case "name-desc": return compareName(right, left) || compareType(left, right);
      case "weight-desc": return (Number(right.weight) || 0) - (Number(left.weight) || 0) || compareName(left, right);
      case "quantity-desc": return (Number(right.quantity) || 0) - (Number(left.quantity) || 0) || compareName(left, right);
      case "manual": return (Number(left.documentSort) || 0) - (Number(right.documentSort) || 0) || compareName(left, right);
      default: return compareType(left, right);
    }
  });
}

/** Group prepared inventory items into populated families and subtypes only. */
export function groupInventoryItems(items, collapsedKeys = new Set()) {
  const collapsed = collapsedKeys instanceof Set ? collapsedKeys : new Set(collapsedKeys ?? []);
  const groupRecords = new Map();

  for (const item of items) {
    const groupKey = String(item.groupKey || item.category || "other");
    let group = groupRecords.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        collapseKey: `group:${groupKey}`,
        label: item.groupLabel || item.typeLabel || groupKey,
        icon: item.groupIcon || "fa-solid fa-box",
        order: Number(item.groupOrder) || 0,
        count: 0,
        subtypeRecords: new Map()
      };
      groupRecords.set(groupKey, group);
    }

    const subtypeKey = String(item.subtypeKey || item.inventoryFilterKey || item.type || "items");
    let subtype = group.subtypeRecords.get(subtypeKey);
    if (!subtype) {
      subtype = {
        key: subtypeKey,
        collapseKey: `subtype:${groupKey}:${subtypeKey}`,
        label: item.subtypeLabel || item.typeLabel || subtypeKey,
        order: Number(item.subtypeOrder) || 0,
        items: []
      };
      group.subtypeRecords.set(subtypeKey, subtype);
    }
    group.count += Math.max(0, Number(item.quantity ?? 1) || 0);
    subtype.items.push(item);
  }

  return [...groupRecords.values()]
    .sort((left, right) => left.order - right.order || NAME_COLLATOR.compare(left.label, right.label))
    .map(group => ({
      key: group.key,
      collapseKey: group.collapseKey,
      label: group.label,
      icon: group.icon,
      count: group.count,
      collapsed: collapsed.has(group.collapseKey),
      subtypes: [...group.subtypeRecords.values()]
        .sort((left, right) => left.order - right.order || NAME_COLLATOR.compare(left.label, right.label))
        .map(subtype => ({
          ...subtype,
          count: subtype.items.reduce((total, item) => total + Math.max(0, Number(item.quantity ?? 1) || 0), 0),
          entryCount: subtype.items.length,
          collapsed: collapsed.has(subtype.collapseKey)
        }))
    }));
}
