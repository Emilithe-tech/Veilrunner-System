import assert from "node:assert/strict";
import fs from "node:fs";

const { ITEM_CREATE_TYPE_GROUPS, groupedItemTypeOptions } = await import("../modules/apps/item-create-dialog.mjs");
const dialogModule = fs.readFileSync(new URL("../modules/apps/item-create-dialog.mjs", import.meta.url), "utf8");
const localization = JSON.parse(fs.readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
const manifest = JSON.parse(fs.readFileSync(new URL("../system.json", import.meta.url), "utf8"));
const labels = localization.TYPES.Item;
const registeredTypes = Object.keys(manifest.documentTypes.Item);

const groups = groupedItemTypeOptions(
  registeredTypes.map(value => ({ value, label: labels[value] })),
  "en"
);

assert.deepEqual(groups.map(group => group.id), ["physical", "characterBuilding", "other"]);
assert.deepEqual(groups[0].options.map(option => option.label), [
  "Ammunition", "Armor", "Consumable", "Container", "Equipment", "Magazine", "Shield", "Treasure", "Weapon"
]);
assert.deepEqual(groups[1].options.map(option => option.label), [
  "Accessory", "Background", "Origin", "Profession", "Species"
]);
assert.deepEqual(groups[2].options.map(option => option.label), ["Ability", "Action"]);

const groupedTypes = groups.flatMap(group => group.options.map(option => option.value));
assert.deepEqual(new Set(groupedTypes), new Set(registeredTypes), "every registered Item type appears once");
assert.equal(groupedTypes.length, registeredTypes.length, "no Item type is duplicated");

for (const group of ITEM_CREATE_TYPE_GROUPS) {
  const key = group.label.split(".").reduce((value, part) => value?.[part], localization);
  assert.equal(typeof key, "string", `${group.label} is localized`);
}

const future = groupedItemTypeOptions([{ value: "future", label: "Future Type" }], "en");
assert.deepEqual(future, [{
  id: "other",
  label: "VEILRUNNER.ItemTypeGroups.other",
  options: [{ value: "future", label: "Future Type" }]
}], "unclassified future types remain available under Other");

assert.match(dialogModule, /\.dialog-content/);
assert.doesNotMatch(dialogModule, /querySelector\?\.\("form#document-create"\)/,
  "dialog detection does not depend on the browser-discarded nested form");

console.log("Create Item grouping checks passed");
