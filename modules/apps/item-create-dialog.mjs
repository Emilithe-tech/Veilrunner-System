/**
 * Ordered groups used by Foundry's Create Item type selector.
 *
 * Types which are added later and are not listed in the first two groups are
 * placed in Other automatically, so every registered Item type stays usable.
 */
export const ITEM_CREATE_TYPE_GROUPS = Object.freeze([
  Object.freeze({
    id: "physical",
    label: "VEILRUNNER.ItemTypeGroups.physical",
    types: Object.freeze([
      "ammunition", "armor", "consumable", "container", "equipment", "magazine", "shield", "treasure", "weapon"
    ])
  }),
  Object.freeze({
    id: "characterBuilding",
    label: "VEILRUNNER.ItemTypeGroups.characterBuilding",
    types: Object.freeze(["accessory", "background", "origin", "profession", "species"])
  }),
  Object.freeze({
    id: "other",
    label: "VEILRUNNER.ItemTypeGroups.other",
    types: Object.freeze(["ability", "action"])
  })
]);

/**
 * Group and alphabetize the type options which Foundry has allowed for a
 * particular Create Item dialog.
 *
 * @param {{value: string, label: string}[]} options
 * @param {string} [locale]
 * @returns {{id: string, label: string, options: {value: string, label: string}[]}[]}
 */
export function groupedItemTypeOptions(options, locale = "en") {
  const available = new Map(options.map(option => [String(option.value), option]));
  const assigned = new Set();
  const groups = [];

  for (const definition of ITEM_CREATE_TYPE_GROUPS) {
    let types = definition.types;
    if (definition.id === "other") {
      const listed = new Set(definition.types);
      types = [...definition.types, ...available.keys()].filter(type => listed.has(type) || !assigned.has(type));
    }

    const entries = [...new Set(types)]
      .filter(type => available.has(type) && !assigned.has(type))
      .map(type => available.get(type))
      .sort((left, right) => left.label.localeCompare(right.label, locale));

    for (const entry of entries) assigned.add(String(entry.value));
    if (entries.length) groups.push({ id: definition.id, label: definition.label, options: entries });
  }

  return groups;
}

/** Replace a native flat Item-type select with ordered optgroups. */
export function groupItemTypeSelect(select) {
  const selected = select.value;
  const optionElements = new Map([...select.options].map(option => [option.value, option]));
  const groups = groupedItemTypeOptions(
    [...optionElements].map(([value, option]) => ({ value, label: option.textContent.trim() })),
    game.i18n.lang
  );
  const document = select.ownerDocument;

  select.replaceChildren();
  for (const group of groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = game.i18n.localize(group.label);
    optgroup.dataset.veilrunnerItemTypeGroup = group.id;
    for (const entry of group.options) optgroup.append(optionElements.get(entry.value));
    select.append(optgroup);
  }

  if (optionElements.has(selected)) select.value = selected;
  select.dataset.veilrunnerGrouped = "true";
}

function isItemCreateTypeSelect(select) {
  const itemTypes = new Set(game.documentTypes?.Item ?? Object.keys(CONFIG.Item?.dataModels ?? {}));
  const values = [...select.options].map(option => option.value).filter(Boolean);
  return values.length > 0 && values.every(value => itemTypes.has(value));
}

/** Register the native Foundry v14 dialog enhancement. */
export function registerItemCreateDialogGroups() {
  Hooks.on("renderDialogV2", (_application, element) => {
    // DialogV2 wraps document-create.html in its own <form>. Browsers normalize
    // that invalid nested-form markup by dropping the inner #document-create
    // element, so locate the fields inside the dialog content instead.
    const content = element.querySelector?.(".dialog-content");
    const select = content?.querySelector('select[name="type"]');
    const name = content?.querySelector('input[name="name"]');
    if (!name || !select || select.dataset.veilrunnerGrouped === "true" || !isItemCreateTypeSelect(select)) return;
    groupItemTypeSelect(select);
  });
}
