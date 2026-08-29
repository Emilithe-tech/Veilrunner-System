const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

function badge(entry) {
  const art = entry.img ? `<img src="${escape(entry.img)}" alt="" />` : `<i class="${escape(entry.icon || "fa-solid fa-circle")}" aria-hidden="true"></i>`;
  return `<button type="button" class="vr-cc-live-badge" data-inspect-title="${escape(entry.title)}" data-inspect-description="${escape(entry.description)}" aria-label="${escape(entry.title)}" title="${escape(`${entry.title}${entry.description ? `: ${entry.description}` : ""}`)}">${art}<span>${escape(entry.title)}</span></button>`;
}

function purchase(entry) {
  const art = entry.img
    ? `<img src="${escape(entry.img)}" alt="" />`
    : `<i class="${escape(entry.icon || "fa-solid fa-box-open")}" aria-hidden="true"></i>`;
  const description = entry.description || `${entry.grade || "No grade"} · ${entry.rarity || "No rarity"}`;
  return `<button type="button" class="vr-cc-live-purchase" style="--vr-item-rarity:${escape(entry.rarityColor || "#67e8f9")}" data-inspect-title="${escape(entry.title)}" data-inspect-description="${escape(description)}" aria-label="${escape(`${entry.title}, quantity ${entry.quantity || 1}`)}">
    <span class="vr-cc-live-purchase-details"><strong>${escape(entry.title)}</strong><span class="vr-cc-live-purchase-meta"><small><b>Grade</b>${escape(entry.grade || "—")}</small><small><b>Rarity</b>${escape(entry.rarity || "—")}</small></span></span>
    <span class="vr-cc-live-purchase-art">${art}</span>
    <span class="vr-cc-live-purchase-qty"><small>Qty</small><strong>${escape(entry.quantity || 1)}</strong></span>
  </button>`;
}

function attributeTable(groups) {
  return `<div class="vr-cc-live-attribute-table">${groups.map(group => `<section><h4>${escape(group.label)}</h4><div>${(group.rows ?? []).map(row => {
    const base = Number(row.base ?? row.value) || 0;
    const bonus = Number(row.bonus) || 0;
    const total = Number(row.value ?? (base + bonus)) || 0;
    const bonusMarkup = bonus ? `<b class="vr-cc-live-attribute-bonus">${escape(`${bonus > 0 ? "+" : ""}${bonus}`)}</b>` : "";
    return `<p><span>${escape(row.label)}</span><strong><span class="vr-cc-live-attribute-adjustment">${bonusMarkup}</span><em class="vr-cc-live-attribute-total">${escape(total)}</em></strong></p>`;
  }).join("")}</div></section>`).join("")}</div>`;
}

function identityCard(entry) {
  const art = entry.img
    ? `<img src="${escape(entry.img)}" alt="" />`
    : `<i class="${escape(entry.icon || "fa-regular fa-image")}" aria-hidden="true"></i>`;
  return `<button type="button" class="vr-cc-live-card vr-cc-live-full-art-card" data-inspect-title="${escape(entry.title)}" data-inspect-description="${escape(entry.description)}"><span class="vr-cc-live-card-art" aria-hidden="true">${art}</span><span class="vr-cc-live-card-name">${escape(entry.title)}</span></button>`;
}

/** A compact, data-only summary. It intentionally has no actor writes. */
export function renderLiveBuild({ name, nameValue = name, portrait, portraitCrop = {}, level, personaAxes, personaValues, sections, credits, collapsed = new Set(), editableIdentity = false }) {
  const sectionMarkup = sections.map(section => {
    const isCollapsed = collapsed.has(section.key);
    const entries = section.entries ?? [];
    const displayLimit = Math.max(1, Number(section.limit) || entries.length || 1);
    const visible = isCollapsed ? [] : entries.slice(0, displayLimit);
    const remainder = Math.max(0, entries.length - visible.length);
    return `<section class="vr-cc-live-section ${isCollapsed ? "collapsed" : ""}" data-live-section="${escape(section.key)}">
      <button type="button" class="vr-cc-live-section-heading" data-action="toggle-live-section" data-live-section="${escape(section.key)}" aria-expanded="${!isCollapsed}"><span>${escape(section.label)}</span><i class="fa-solid fa-chevron-${isCollapsed ? "right" : "down"}" aria-hidden="true"></i></button>
      ${isCollapsed ? "" : section.presentation === "attributes" ? attributeTable(section.groups ?? []) : `<div class="vr-cc-live-badges ${section.presentation === "cards" ? "vr-cc-live-cards" : ""} ${section.presentation === "purchases" ? "vr-cc-live-purchases" : ""} ${section.compactBadges ? "vr-cc-live-icon-badges" : ""}">${visible.length ? visible.map(entry => section.presentation === "cards" ? identityCard(entry) : section.presentation === "purchases" ? purchase(entry) : badge(entry)).join("") : '<span class="vr-cc-live-empty">None selected</span>'}${remainder ? `<span class="vr-cc-live-more" title="${escape(`${remainder} more selected`)}">+${remainder}</span>` : ""}</div>`}
    </section>`;
  }).join("");
  const crop = {
    x: Number.isFinite(Number(portraitCrop.x)) ? Number(portraitCrop.x) : 50,
    y: Number.isFinite(Number(portraitCrop.y)) ? Number(portraitCrop.y) : 50,
    zoom: Number.isFinite(Number(portraitCrop.zoom)) ? Number(portraitCrop.zoom) : 1,
    rotation: Number.isFinite(Number(portraitCrop.rotation)) ? Number(portraitCrop.rotation) : 0,
    flipX: Boolean(portraitCrop.flipX)
  };
  const portraitStyle = `--portrait-x:${crop.x}%;--portrait-y:${crop.y}%;--portrait-zoom:${crop.zoom};--portrait-rotation:${crop.rotation}deg;--portrait-flip-x:${crop.flipX ? -1 : 1}`;
  const portraitMarkup = editableIdentity
    ? `<button type="button" class="vr-cc-live-portrait" data-action="pick-portrait" style="${portraitStyle}" title="Choose and edit Hero portrait" aria-label="Choose and edit Hero portrait"><img src="${escape(portrait)}" alt="" /></button>`
    : `<span class="vr-cc-live-portrait" style="${portraitStyle}"><img src="${escape(portrait)}" alt="${escape(name)} portrait" /></span>`;
  const nameMarkup = editableIdentity
    ? `<input class="vr-cc-live-hero-name" data-live-hero-name name="name" value="${escape(nameValue)}" placeholder="Hero name" aria-label="Hero name" />`
    : `<h2>${escape(name)}</h2>`;
  return `<header class="vr-cc-live-header">${portraitMarkup}<div class="vr-cc-live-hero-identity"><span class="vr-cc-live-hero-level">Level ${escape(level || 1)}</span>${nameMarkup}</div></header>
    <div class="vr-cc-live-scroll">
      <section class="vr-cc-live-section vr-cc-live-persona"><h3>Persona Index</h3>${personaAxes.map((axis, axisIndex) => { const value = Number(personaValues?.[axis.key]) || 0; const left = Math.floor(Math.max(0, -value) / 10); const right = Math.floor(Math.max(0, value) / 10); const position = ((value + 100) / 2).toFixed(1); return `<div class="vr-cc-live-axis vr-cc-live-axis-${axisIndex}" data-persona-axis="${escape(axis.key)}"><div class="vr-cc-live-pips" style="--vr-persona-position:${position}%" aria-label="${escape(`${axis.left} to ${axis.right}: ${value}`)}"><span class="left">${Array.from({ length: 10 }, (_, index) => `<i class="${index >= 10 - left ? "active" : ""}"></i>`).join("")}</span><b></b><span class="right">${Array.from({ length: 10 }, (_, index) => `<i class="${index < right ? "active" : ""}"></i>`).join("")}</span><em aria-hidden="true"></em></div><div class="vr-cc-live-axis-labels"><span>${escape(axis.left)}</span><strong>${value > 0 ? "+" : ""}${value}</strong><span>${escape(axis.right)}</span></div></div>`; }).join("")}</section>
      ${sectionMarkup}
    </div><footer class="vr-cc-live-credits"><span>Credits${credits.remaining !== undefined ? " Remaining" : ""}</span><strong>${escape(credits.value)}</strong><i class="fa-solid fa-coins" aria-hidden="true"></i></footer>`;
}
