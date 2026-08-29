const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

const targetAttributes = ({ key = "", pane = "" } = {}) => `data-review-target="${escape(key)}"${pane ? ` data-review-pane="${escape(pane)}"` : ""}`;
const editButton = target => target ? `<button type="button" class="vr-cc-review-edit" ${targetAttributes(target)}>EDIT <i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i></button>` : "";
const statusBadge = (text, tone = "complete") => text ? `<span class="vr-cc-review-badge ${tone}">${escape(text)}</span>` : "";
const empty = text => `<p class="vr-cc-review-empty">${escape(text)}</p>`;

function reviewCard({ title, target, badges = [], className = "", content }) {
  return `<article class="vr-cc-review-section ${className}"><header><h2>${escape(title)}</h2><div>${badges.join("")}${editButton(target)}</div></header>${content}</article>`;
}

function persona(model) {
  return `<section class="vr-cc-review-persona"><header><span>Persona Index</span><strong>Current Alignment</strong></header>${model.axes.map((axis, index) => {
    const value = Math.max(-100, Math.min(100, Number(model.values?.[axis.key]) || 0));
    const left = Math.floor(Math.max(0, -value) / 10);
    const right = Math.floor(Math.max(0, value) / 10);
    return `<div class="vr-cc-review-axis axis-${index}"><div class="vr-cc-review-axis-labels"><span>${escape(axis.left)}</span><strong>${value > 0 ? "+" : ""}${value}</strong><span>${escape(axis.right)}</span></div><div class="vr-cc-review-pips" style="--vr-persona-position:${(value + 100) / 2}%"><span>${Array.from({ length: 10 }, (_, pip) => `<i class="${pip >= 10 - left ? "active" : ""}"></i>`).join("")}</span><b></b><span>${Array.from({ length: 10 }, (_, pip) => `<i class="${pip < right ? "active" : ""}"></i>`).join("")}</span><em></em></div></div>`;
  }).join("")}</section>`;
}

function identityHero(model) {
  const identity = model.identity;
  const path = [identity.archetype, identity.profession, identity.discipline].filter(Boolean).join(" / ") || "Not selected";
  const crop = identity.portraitCrop ?? {};
  return `<article class="vr-cc-review-identity"><div class="vr-cc-review-portrait"><img src="${escape(identity.portrait)}" alt="${escape(identity.name)} portrait" style="--portrait-x:${Number(crop.x) || 50}%;--portrait-y:${Number(crop.y) || 50}%;--portrait-zoom:${Number(crop.zoom) || 1};--portrait-rotation:${Number(crop.rotation) || 0}deg;--portrait-flip-x:${crop.flipX ? -1 : 1}" /></div><section class="vr-cc-review-dossier"><span>Character Dossier</span><h1>${escape(identity.name || "Your Character")}</h1><dl><div><dt>Level</dt><dd>Level ${escape(identity.level)}</dd></div><div><dt>Species</dt><dd>${escape(identity.species || "Not selected")}</dd></div><div><dt>Home Planet</dt><dd>${escape(identity.origin || "Not selected")}</dd></div><div><dt>Background</dt><dd>${escape(identity.background || "Not selected")}</dd></div><div class="path"><dt>Path</dt><dd>${escape(path)}</dd></div></dl></section>${persona(model.persona)}</article>`;
}

function attributesCard(model) {
  const badge = model.remaining > 0 ? statusBadge(`${model.remaining} point${model.remaining === 1 ? "" : "s"} banked`, "info") : statusBadge("Allocated", "complete");
  return reviewCard({ title: "Attributes", target: { key: "attributes" }, badges: [badge], className: "attributes", content: `<div class="vr-cc-review-attribute-groups">${model.groups.map(group => `<section><h3>${escape(group.label)}</h3><div>${group.entries.map(entry => { const base = Number(entry.base ?? entry.value) || 0; const bonus = Number(entry.bonus) || 0; const total = Number(entry.value ?? (base + bonus)) || 0; return `<p><span>${escape(entry.abbreviation)}</span><strong><b>${escape(bonus)}</b> + ${escape(base)} <em>| ${escape(total)}</em></strong></p>`; }).join("")}</div></section>`).join("")}</div>` });
}

function talentsCard(model) {
  const badges = [model.talentRemaining > 0 ? statusBadge(`${model.talentRemaining} Talent Point${model.talentRemaining === 1 ? "" : "s"} banked`, "info") : "", model.skillRemaining > 0 ? statusBadge(`${model.skillRemaining} Skill Point${model.skillRemaining === 1 ? "" : "s"} banked`, "info") : ""].filter(Boolean);
  const list = (entries, fallback) => entries.length ? `<ul>${entries.map(entry => `<li><strong>${escape(entry.name)}</strong>${entry.detail ? `<small>${escape(entry.detail)}</small>` : ""}</li>`).join("")}</ul>` : empty(fallback);
  return reviewCard({ title: "Talents & Skills", target: { key: "talents" }, badges, className: "talents", content: `<div class="vr-cc-review-split"><section><h3>Talents</h3>${list(model.talents, "No Talents selected.")}</section><section><h3>Skills</h3>${list(model.skills, "No Skills selected.")}</section></div>` });
}

function qualitiesCard(model) {
  const badges = [statusBadge(model.valid ? "Valid" : "Required attention", model.valid ? "complete" : "error")];
  const chips = entries => entries.length ? `<div class="vr-cc-review-chips">${entries.map(entry => `<span>${escape(entry.name)}</span>`).join("")}</div>` : empty("None selected.");
  return reviewCard({ title: "Perks & Flaws", target: { key: "qualitiesFlaws" }, badges, content: `<div class="vr-cc-review-split"><section><h3>Perks</h3>${chips(model.perks)}</section><section><h3>Flaws</h3>${chips(model.flaws)}</section></div>` });
}

function languagesCard(model) {
  const badges = [statusBadge("Optional", "info")];
  const languages = model.languages.length ? `<div class="vr-cc-review-chips">${model.languages.map(name => `<span>${escape(name)}</span>`).join("")}</div>` : empty("No language selected. You can add one later.");
  const contacts = model.contacts.length ? `<ul>${model.contacts.map(contact => `<li><strong>${escape(contact.name || contact.role || "Contact")}</strong><small>${escape([contact.role, contact.disposition].filter(Boolean).join(" · ") || "No relationship details")}</small></li>`).join("")}</ul>` : empty("No contacts added. You can add them later.");
  return reviewCard({ title: "Languages & Contacts", target: model.editable !== false ? { key: "identity", pane: "languages" } : null, badges, content: `<div class="vr-cc-review-split"><section><h3>Languages</h3>${languages}</section><section><h3>Contacts</h3>${contacts}</section></div>` });
}

function purchasesCard(model) {
  const badge = statusBadge(`${model.remainingCredits.toLocaleString()}¢ Credits Remaining`, "info");
  const rows = model.entries.length ? `<div class="vr-cc-review-purchases">${model.entries.map(entry => `<div>${entry.img ? `<img src="${escape(entry.img)}" alt="" />` : `<i class="fa-solid fa-box" aria-hidden="true"></i>`}<p><strong>${escape(entry.name)}</strong><small>${escape([entry.grade, entry.rarity].filter(Boolean).join(" · ") || "Starting equipment")}</small></p><span>×${entry.quantity}</span><b>${Number(entry.total).toLocaleString()}¢</b></div>`).join("")}</div>` : empty("No starting purchases selected.");
  return reviewCard({ title: "Starting Loadout / Purchases", target: model.editable !== false ? { key: "credits" } : null, badges: [badge], className: "purchases", content: rows });
}

function biographyCard(model) {
  const badge = statusBadge(model.text ? "Complete" : "Incomplete", model.text ? "complete" : "attention");
  return reviewCard({ title: "About Your Character", target: model.editable !== false ? { key: "identity", pane: "biography" } : null, badges: [badge], className: "biography", content: model.text ? `<blockquote>${escape(model.text)}</blockquote>` : `<div class="vr-cc-review-biography-empty"><i class="fa-solid fa-book-open"></i><div><strong>No biography entered.</strong><p>Tell the story of who your character is, what drives them, and what they seek.</p></div></div>` });
}

export function renderReviewPage(model) {
  const readiness = model.validation.readiness;
  const bannerTone = readiness.state === "not-ready" ? readiness.severity : readiness.state;
  const bannerLabel = readiness.state === "unspent" ? "READY — UNSPENT RESOURCES" : readiness.label.toUpperCase();
  const bannerDetail = readiness.state === "not-ready"
    ? `Your character build has ${model.validation.blockingIssues.length} required item${model.validation.blockingIssues.length === 1 ? "" : "s"} to resolve.${model.validation.unspentResources.length ? " Banked resources remain valid." : ""}`
    : readiness.state === "unspent" ? "Your character build is valid. Banked resources may remain unspent." : "Your character build is valid and ready to create.";
  const firstIssue = model.validation.blockingIssues[0];
  return `<section class="vr-cc-review-workspace"><header class="vr-cc-review-heading"><span>Final Review</span><h1>Review Character Build</h1><p>Check your character, resolve outstanding items, and create the character.</p></header><section class="vr-cc-review-banner ${escape(bannerTone)}"><i class="fa-solid ${readiness.state === "not-ready" ? "fa-triangle-exclamation" : readiness.state === "unspent" ? "fa-circle-info" : "fa-circle-check"}"></i><div><strong>${escape(bannerLabel)}${readiness.state === "not-ready" ? ` — ${model.validation.blockingIssues.length} required action${model.validation.blockingIssues.length === 1 ? "" : "s"} remaining` : ""}</strong><p>${escape(bannerDetail)}</p></div></section>${identityHero(model)}<div class="vr-cc-review-grid">${attributesCard(model.attributes)}${talentsCard(model.talentsSkills)}${qualitiesCard(model.qualities)}${languagesCard(model.languagesContacts)}${purchasesCard(model.purchases)}${biographyCard(model.biography)}</div><footer class="vr-cc-review-actions">${firstIssue ? `<button type="button" class="vr-cc-btn vr-cc-review-resolve" ${targetAttributes(firstIssue)}><i class="fa-solid fa-location-arrow"></i><span>Resolve Required Items</span></button>` : ""}<button type="button" class="vr-cc-btn primary vr-cc-review-create" data-action="confirm" ${model.validation.valid ? "" : "disabled"}><i class="fa-solid fa-user-check"></i><span>${escape(model.actionLabel)}</span></button></footer></section>`;
}

function statusItems(items, emptyText = "None") {
  return items.length ? items.map(item => `<button type="button" class="${escape(item.severity || "")}" ${targetAttributes(item)}><span>${escape(item.label)}</span>${item.detail ? `<small>${escape(item.detail)}</small>` : ""}<i class="fa-solid fa-chevron-right"></i></button>`).join("") : `<p class="vr-cc-review-status-empty">${escape(emptyText)}</p>`;
}

export function renderReviewStatus(validation) {
  const readiness = validation.readiness;
  const allowed = new Set(validation.allowedTargets ?? ["level", "species", "origin", "background", "profession", "attributes", "talents", "qualitiesFlaws", "credits", "identity"]);
  const quick = new Map();
  for (const item of [...validation.blockingIssues, ...validation.incompleteSections, ...validation.unspentResources]) if (allowed.has(item.key)) quick.set(`${item.key}:${item.pane || ""}`, item);
  for (const item of [{ key: "identity", pane: "languages", label: "Languages" }, { key: "attributes", label: "Attributes" }, { key: "talents", label: "Talents & Skills" }, { key: "qualitiesFlaws", label: "Perks & Flaws" }, { key: "credits", label: "Storefront" }, { key: "identity", pane: "biography", label: "About Your Character" }]) if (allowed.has(item.key)) quick.set(`${item.key}:${item.pane || ""}`, item);
  return `<aside class="vr-cc-info vr-cc-review-status"><header><span>Review Status</span><h2>Character Readiness</h2><strong class="${escape(`${readiness.state} ${readiness.severity || ""}`)}">${escape(readiness.label)}</strong><p>${escape(readiness.summary)}</p></header><section class="quick"><h3>Quick Jump</h3><div>${[...quick.values()].slice(0, 7).map(item => `<button type="button" class="vr-cc-btn" ${targetAttributes(item)}>${escape(item.label)}</button>`).join("")}</div></section>${validation.blockingIssues.length ? `<section class="required"><h3>Required Actions</h3>${statusItems(validation.blockingIssues)}</section>` : ""}<section class="incomplete"><h3>Incomplete Sections</h3>${statusItems(validation.incompleteSections, "No optional sections are incomplete.")}</section><section class="resources"><h3>Unspent Resources</h3>${validation.unspentResources.length ? validation.unspentResources.map(item => `<button type="button" ${targetAttributes(item)}><strong>${Number(item.amount).toLocaleString()}</strong><span>${escape(item.label)}</span><i class="fa-solid fa-chevron-right"></i></button>`).join("") : `<p class="vr-cc-review-status-empty">No banked resources.</p>`}</section><section class="completed"><h3>Completed Checks</h3>${validation.completedChecks.map(item => `<p><i class="fa-solid fa-check"></i><span>${escape(item.label)}</span></p>`).join("")}</section></aside>`;
}
