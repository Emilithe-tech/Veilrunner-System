import { WEAPON_TYPE_GROUPS } from "../../../data/item/physical.mjs";

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const title = value => String(value ?? "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]+/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const money = value => Math.max(0, Number(value) || 0).toLocaleString();
const weight = value => `${Math.round((Math.max(0, Number(value) || 0) + Number.EPSILON) * 100) / 100} kg`;

export const STOREFRONT_CATEGORIES = Object.freeze([
  { key: "weapons", label: "Weapons", icon: "fa-solid fa-gun" },
  { key: "armor", label: "Armor", icon: "fa-solid fa-shield-halved" },
  { key: "tech", label: "Tech", icon: "fa-solid fa-microchip" },
  { key: "gear", label: "Gear", icon: "fa-solid fa-toolbox" },
  { key: "consumables", label: "Consumables", icon: "fa-solid fa-flask" }
]);

export const WEAPON_SUBTYPES = Object.freeze([
  ["all", "All"],
  ...WEAPON_TYPE_GROUPS.flatMap(group => group.types.map(type => [type, title(type)]))
]);
const WEAPON_SUBTYPE_LABELS = new Map(WEAPON_SUBTYPES);
const subtypeLabel = value => WEAPON_SUBTYPE_LABELS.get(value) ?? title(value);

function rarityBadge(record) {
  return `<span class="vr-store-rarity" style="--vr-item-rarity:${escape(record.rarityColor || "#e2e8f0")}" aria-label="Rarity: ${escape(record.rarityName || "Common")}"><i class="fa-solid fa-gem" aria-hidden="true"></i>${escape(record.rarityName || "Common")}</span>`;
}

function gradeBadge(record) {
  return `<span class="vr-store-grade" aria-label="Grade ${escape(record.grade || 1)}"><small>Grade</small><b>${escape(record.grade || 1)}</b></span>`;
}

function options(values, selected, label) {
  return `<option value="all" ${selected === "all" ? "selected" : ""}>Any ${escape(label)}</option>${values.map(value => `<option value="${escape(value)}" ${String(selected) === String(value) ? "selected" : ""}>${escape(label === "grade" ? `Grade ${value}` : title(value))}</option>`).join("")}`;
}

function categoryTabs(query) {
  return `<nav class="vr-store-categories" aria-label="Store categories">${STOREFRONT_CATEGORIES.map(category => `<button type="button" data-storefront-category="${category.key}" class="${query.category === category.key ? "active" : ""}" aria-pressed="${query.category === category.key}"><i class="${category.icon}" aria-hidden="true"></i><span>${category.label}</span></button>`).join("")}</nav>`;
}

function filters(query, facets) {
  return `<div class="vr-store-controls">
    <label class="vr-store-search"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><input data-storefront-search="true" name="storefront.query.search" value="${escape(query.search)}" placeholder="Search ${escape(query.category)}..." aria-label="Search store" /></label>
    <div class="vr-store-filter-grid">
      <label>Rarity<select name="storefront.query.rarity">${options(facets.rarities, query.rarity, "rarity")}</select></label>
      <label>Grade<select name="storefront.query.grade">${options(facets.grades, query.grade, "grade")}</select></label>
      <label>Price min<input type="number" min="0" name="storefront.query.priceMin" value="${escape(query.priceMin)}" placeholder="Any" /></label>
      <label>Price max<input type="number" min="0" name="storefront.query.priceMax" value="${escape(query.priceMax)}" placeholder="Any" /></label>
      <label>Weight min<input type="number" min="0" step="0.1" name="storefront.query.weightMin" value="${escape(query.weightMin)}" placeholder="Any" /></label>
      <label>Weight max<input type="number" min="0" step="0.1" name="storefront.query.weightMax" value="${escape(query.weightMax)}" placeholder="Any" /></label>
      <label>Sort<select name="storefront.query.sort"><option value="name" ${query.sort === "name" ? "selected" : ""}>Name</option><option value="price" ${query.sort === "price" ? "selected" : ""}>Price</option><option value="weight" ${query.sort === "weight" ? "selected" : ""}>Weight</option><option value="rarity" ${query.sort === "rarity" ? "selected" : ""}>Rarity</option><option value="grade" ${query.sort === "grade" ? "selected" : ""}>Grade</option></select></label>
      <label>Direction<select name="storefront.query.direction"><option value="asc" ${query.direction === "asc" ? "selected" : ""}>Low to High</option><option value="desc" ${query.direction === "desc" ? "selected" : ""}>High to Low</option></select></label>
    </div>
  </div>`;
}

function subtypeChips(query) {
  if (query.category !== "weapons") return "";
  const all = WEAPON_SUBTYPES[0];
  const groupMarkup = group => `<span class="vr-store-subtype-group"><b>${escape(title(group.key))}</b>${group.types.map(type => `<button type="button" data-storefront-subtype="${type}" class="${query.subtype === type ? "active" : ""}" aria-pressed="${query.subtype === type}">${escape(subtypeLabel(type))}</button>`).join("")}</span>`;
  const standardGroups = WEAPON_TYPE_GROUPS.filter(group => !group.key.endsWith("Firearms"));
  const firearmGroups = WEAPON_TYPE_GROUPS.filter(group => group.key.endsWith("Firearms"));
  return `<nav class="vr-store-subtypes" aria-label="Weapon subtype"><div class="vr-store-subtype-row standard" aria-label="Standard weapon groups"><button type="button" data-storefront-subtype="${all[0]}" class="${query.subtype === all[0] ? "active" : ""}" aria-pressed="${query.subtype === all[0]}">${all[1]}</button>${standardGroups.map(groupMarkup).join("")}</div><div class="vr-store-subtype-row firearms" aria-label="Firearm groups">${firearmGroups.map(groupMarkup).join("")}</div></nav>`;
}

function itemStats(record) {
  if (record.storeCategory !== "weapons") return "";
  return `<div class="vr-store-row-stats"><span><small>DMG</small><b>${escape(record.damage || "—")}</b></span><span><small>Range</small><b>${record.range ? `${escape(record.range)} m` : "—"}</b></span><span><small>Mag</small><b>${record.magazine || "—"}</b></span></div>`;
}

function itemRow(record, selected) {
  const traits = (record.traits ?? []).slice(0, 2);
  return `<article class="vr-store-item-row ${selected ? "selected" : ""}" style="--vr-item-rarity:${escape(record.rarityColor || "#e2e8f0")}" data-definition-id="${escape(record.definitionId)}">
    <button type="button" class="vr-store-row-select" data-storefront-select="${escape(record.definitionId)}" aria-label="Inspect ${escape(record.name)}"><img src="${escape(record.img || "icons/svg/item-bag.svg")}" alt="" /><span class="vr-store-row-identity"><strong>${escape(record.name)}</strong><small>${escape(subtypeLabel(record.subtype || record.type))}</small>${traits.length ? `<span class="vr-store-traits">${traits.map(trait => `<em>${escape(trait)}</em>`).join("")}</span>` : ""}</span></button>
    <div class="vr-store-row-badges">${rarityBadge(record)}${gradeBadge(record)}</div>${itemStats(record)}
    <div class="vr-store-row-commerce"><span><i class="fa-solid fa-coins" aria-hidden="true"></i><b>${money(record.price)}</b></span><span><i class="fa-solid fa-weight-hanging" aria-hidden="true"></i>${weight(record.weight)}</span></div>
    <div class="vr-store-row-actions"><button type="button" data-storefront-select="${escape(record.definitionId)}" class="vr-store-inspect">Inspect</button><button type="button" data-storefront-add="${escape(record.definitionId)}" class="vr-store-add"><i class="fa-solid fa-plus" aria-hidden="true"></i>Add</button></div>
  </article>`;
}

function pagination(page) {
  if (page.pageCount <= 1) return `<footer class="vr-store-pagination"><span>Showing ${page.total} item${page.total === 1 ? "" : "s"}</span></footer>`;
  const buttons = Array.from({ length: page.pageCount }, (_, index) => index + 1).map(number => `<button type="button" data-storefront-page="${number}" class="${page.currentPage === number ? "active" : ""}" aria-current="${page.currentPage === number ? "page" : "false"}">${number}</button>`).join("");
  return `<footer class="vr-store-pagination"><span>Showing ${(page.currentPage - 1) * page.pageSize + 1}–${Math.min(page.currentPage * page.pageSize, page.total)} of ${page.total}</span><nav><button type="button" data-storefront-page="${page.currentPage - 1}" ${page.currentPage === 1 ? "disabled" : ""} aria-label="Previous page"><i class="fa-solid fa-chevron-left"></i></button>${buttons}<button type="button" data-storefront-page="${page.currentPage + 1}" ${page.currentPage === page.pageCount ? "disabled" : ""} aria-label="Next page"><i class="fa-solid fa-chevron-right"></i></button></nav></footer>`;
}

export function renderStorefrontBrowser({ query, facets, page, selectedDefinitionId = "", loading = false }) {
  const body = loading ? `<div class="vr-cc-store-empty"><i class="fa-solid fa-spinner fa-spin"></i><h3>Loading storefront</h3></div>`
    : page.records.length ? page.records.map(record => itemRow(record, selectedDefinitionId === record.definitionId)).join("")
      : `<div class="vr-cc-store-empty"><i class="fa-solid fa-store"></i><h3>No matching items</h3><p>Adjust the active category, search, or filters.</p></div>`;
  return `<section class="vr-cc-storefront">${categoryTabs(query)}${filters(query, facets)}${subtypeChips(query)}<div class="vr-store-list" data-storefront-scroll>${body}</div>${pagination(page)}</section>`;
}

function summary(model) {
  return `<footer class="vr-store-summary"><div><span><i class="fa-solid fa-cart-shopping"></i> Cart <b>${model.itemCount}</b></span><small>${model.itemCount} item${model.itemCount === 1 ? "" : "s"}</small></div><dl><div><dt>Credits Remaining</dt><dd><i class="fa-solid fa-coins"></i>${money(model.remainingCredits)}</dd></div><div><dt>Total Carry Weight</dt><dd>${weight(model.projectedWeight)} / ${weight(model.carryCapacity)}</dd></div></dl><button type="button" data-action="storefront-show-cart">View Cart <i class="fa-solid fa-arrow-right"></i></button></footer>`;
}

function details(model) {
  const record = model.selectedRecord;
  if (!record) return `<div class="vr-store-detail-empty"><i class="fa-solid fa-circle-info"></i><p>Select an item to inspect its details.</p></div>`;
  const fields = [
    ["Price", `${money(record.price)} ${record.currency}`], ["Weight", weight(record.weight)], ["Damage", record.damage],
    ["Range", record.range ? `${record.range} m` : ""], ["Magazine", record.magazine || ""], ["Fire Modes", record.fireModes?.join(", ")],
    ["Reload", record.reload], ["Traits", record.traits?.join(", ")], ["Actions", record.actions], ["Build Compatibility", record.buildCompatibility?.join(", ")]
  ].filter(([, value]) => value !== "" && value !== null && value !== undefined);
  const affordable = record.price <= model.remainingCredits;
  const carryable = model.projectedWeight + record.weight <= model.carryCapacity;
  return `<div class="vr-store-detail"><header><div><h2>${escape(record.name)}</h2><span>${escape(subtypeLabel(record.subtype || record.type))}</span></div><div>${rarityBadge(record)}${gradeBadge(record)}</div></header><img class="vr-store-detail-image" src="${escape(record.img || "icons/svg/item-bag.svg")}" alt="" /><div class="vr-store-compatibility"><span class="unknown"><i class="fa-solid fa-circle-question"></i>Proficiency Unknown</span><span class="${affordable ? "positive" : "negative"}"><i class="fa-solid fa-coins"></i>${affordable ? "Affordable" : "Unaffordable"}</span><span class="${carryable ? "positive" : "negative"}"><i class="fa-solid fa-weight-hanging"></i>${carryable ? "Carryable" : "Over Capacity"}</span></div>${record.description ? `<p>${escape(record.description)}</p>` : ""}<dl>${fields.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl><button type="button" class="vr-store-detail-add" data-storefront-add="${escape(record.definitionId)}"><i class="fa-solid fa-plus"></i>Add to Cart</button></div>`;
}

function cart(model) {
  const lines = model.cartLines.map(line => {
    const record = model.recordById.get(line.definitionId);
    return `<article class="vr-store-cart-line"><img src="${escape(record?.img || "icons/svg/item-bag.svg")}" alt="" /><div><strong>${escape(record?.name || line.definitionId)}</strong><small>${money(record?.price)} credits · ${weight(record?.weight)}</small></div><div class="vr-store-cart-quantity"><button type="button" data-storefront-adjust="${escape(line.definitionId)}" data-direction="-1" aria-label="Decrease quantity">−</button><input type="number" min="1" step="1" data-storefront-quantity="${escape(line.definitionId)}" value="${line.quantity}" aria-label="Quantity for ${escape(record?.name || line.definitionId)}" /><button type="button" data-storefront-adjust="${escape(line.definitionId)}" data-direction="1" aria-label="Increase quantity">+</button></div><button type="button" data-storefront-remove="${escape(line.definitionId)}" class="vr-store-cart-remove" aria-label="Remove ${escape(record?.name || line.definitionId)}"><i class="fa-solid fa-trash"></i></button></article>`;
  }).join("");
  return `<div class="vr-store-cart"><header><div><span>Cart</span><h2>${model.itemCount} item${model.itemCount === 1 ? "" : "s"}</h2></div>${model.itemCount ? `<button type="button" data-action="storefront-clear-cart"><i class="fa-solid fa-trash-can"></i>Clear Cart</button>` : ""}</header><div class="vr-store-cart-lines">${lines || `<div class="vr-store-detail-empty"><i class="fa-solid fa-cart-shopping"></i><p>Add catalog items to build a starting loadout.</p></div>`}</div><dl class="vr-store-cart-totals"><div><dt>Total Cost</dt><dd>${money(model.cartTotal)} credits</dd></div><div><dt>Credits Remaining</dt><dd>${money(model.remainingCredits)}</dd></div><div><dt>Total Carry Weight</dt><dd>${weight(model.projectedWeight)} / ${weight(model.carryCapacity)}</dd></div></dl><footer class="vr-store-cart-checkout"><button type="button" data-action="storefront-purchase-cart" ${model.itemCount ? "" : "disabled"}><i class="fa-solid fa-cart-shopping"></i>Purchase</button></footer></div>`;
}

export function renderStorefrontContext(model) {
  const mode = model.mode === "cart" ? "cart" : "details";
  return `<aside class="vr-cc-info vr-cc-details-pane vr-cc-store-right"><nav class="vr-store-context-tabs"><button type="button" data-action="storefront-show-details" class="${mode === "details" ? "active" : ""}">Details</button><button type="button" data-action="storefront-show-cart" class="${mode === "cart" ? "active" : ""}">Cart <b>${model.itemCount}</b></button></nav><div class="vr-store-context-body">${mode === "cart" ? cart(model) : details(model)}</div>${summary(model)}</aside>`;
}
