const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export function renderChargenHeader(steps, activeIndex, validation, groups = []) {
  const activeKey = steps[activeIndex]?.key;
  const activeGroup = groups.find(group => group.keys.includes(activeKey)) ?? groups[0];
  const primary = groups.map((group, index) => {
    const groupSteps = group.keys.map(key => steps.find(step => step.key === key)).filter(Boolean);
    const current = groupSteps.some(step => step.key === activeKey);
    const completed = groupSteps.length && groupSteps.every(step => steps.indexOf(step) < activeIndex);
    const available = groupSteps.some(step => steps.indexOf(step) <= activeIndex + 1);
    return `<button type="button" class="vr-cc-phase ${current ? "active" : completed ? "complete" : available ? "available" : "locked"}" data-phase="${index}" aria-current="${current ? "step" : "false"}"><b>${String(index + 1).padStart(2, "0")}</b><span>${escape(group.label)}</span></button>`;
  }).join("");
  const secondary = (activeGroup?.keys ?? []).map(key => {
    const index = steps.findIndex(step => step.key === key); if (index < 0) return "";
    const step = steps[index]; const errors = validation.section.get(step.key) ?? [];
    const status = index === activeIndex ? "active" : errors.length ? "invalid" : index < activeIndex ? "complete" : "";
    return `<button type="button" class="vr-cc-step ${status}" data-step="${index}" title="${escape(errors.join(" "))}" aria-current="${index === activeIndex ? "step" : "false"}"><i class="${step.icon}"></i><span>${escape(step.label)}</span></button>`;
  }).join("");
  return `<header class="vr-cc-topbar"><div class="vr-cc-brand"><span>Veilrunner</span><strong>Character Generation</strong></div><div class="vr-cc-header-navigation"><nav class="vr-cc-phase-nav" aria-label="Character creation phases">${primary}</nav><nav class="vr-cc-header-nav" aria-label="Current character creation steps">${secondary}</nav></div></header>`;
}

function disciplineAbilityCard(ability, detailed = false) {
  const content = detailed
    ? ability.description || ability.text || "Rules have not been authored for this ability."
    : ability.summary || ability.text || "No summary has been authored for this ability.";
  return `<article class="vr-cc-discipline-ability"><span class="vr-cc-discipline-ability-icon"><i class="${ability.type === "Reaction" ? "fa-solid fa-bolt" : ability.type === "Trait" ? "fa-solid fa-star" : "fa-solid fa-sparkles"}" aria-hidden="true"></i></span><div><header><strong>${escape(ability.name)}</strong><small>${escape(ability.type || "Ability")}</small></header><p>${escape(content)}</p></div></article>`;
}

function disciplineDetailsPanel(selection, tab, action) {
  const abilities = Array.isArray(selection.abilities) ? selection.abilities : [];
  const tags = Array.isArray(selection.tags) ? selection.tags.filter(Boolean) : [];
  const details = selection.details ?? {};
  const detailRows = [
    ["Primary Attributes", details.primaryAttributes],
    ["Bonus Attributes", details.bonusAttributes],
    ["Primary Weapon Type", details.primaryWeapon],
    ["Bonus Skill", details.bonusSkill],
    ["Granted School", details.grantedSchool],
    ["Persona Index", details.persona]
  ].filter(([, value]) => Array.isArray(value) ? value.length : String(value ?? "").trim());
  const artwork = selection.img
    ? `<img src="${escape(selection.img)}" alt="" />`
    : `<div class="vr-cc-discipline-art-placeholder"><i class="fa-solid fa-person-running" aria-hidden="true"></i><span>Discipline artwork unavailable</span></div>`;
  const overview = `<section class="vr-cc-discipline-section"><h3>Mechanical Summary</h3><p>${escape(selection.mechanicalSummary || selection.summary || "No mechanical summary has been authored for this Discipline.")}</p></section>
    <section class="vr-cc-discipline-section"><h3>Discipline Details</h3>${detailRows.length ? `<dl>${detailRows.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(Array.isArray(value) ? value.join(" · ") : value)}</dd></div>`).join("")}</dl>` : `<p>No structured Discipline details have been authored.</p>`}</section>
    <section class="vr-cc-discipline-section"><h3>Unique Abilities</h3>${abilities.length ? `<div class="vr-cc-discipline-abilities">${abilities.map(ability => disciplineAbilityCard(ability)).join("")}</div>` : `<p>No unique abilities have been authored for this Discipline.</p>`}</section>`;
  const abilityRules = abilities.length
    ? `<div class="vr-cc-discipline-abilities rules">${abilities.map(ability => disciplineAbilityCard(ability, true)).join("")}</div>`
    : `<p>No ability rules have been authored for this Discipline.</p>`;
  const lore = String(selection.lore || selection.background || "").trim();
  const loreContent = lore
    ? lore.split(/\n{2,}/).map(paragraph => `<p>${escape(paragraph)}</p>`).join("")
    : `<p>No lore has been authored for this Discipline.</p>`;
  const content = tab === "abilities" ? abilityRules : tab === "lore" ? loreContent : overview;
  return `<aside class="vr-cc-info vr-cc-details-pane vr-cc-discipline-details"><header class="vr-cc-discipline-hero">${artwork}<div><h2>${escape(selection.name)}</h2>${tags.length ? `<p>${tags.map(escape).join(" · ")}</p>` : ""}</div></header><nav class="vr-cc-inspector-tabs" aria-label="Discipline details"><button type="button" data-action="inspector-tab" data-inspector-tab="overview" class="${tab === "overview" ? "active" : ""}">Overview</button><button type="button" data-action="inspector-tab" data-inspector-tab="abilities" class="${tab === "abilities" ? "active" : ""}">Abilities</button><button type="button" data-action="inspector-tab" data-inspector-tab="lore" class="${tab === "lore" ? "active" : ""}">Lore</button></nav><div class="vr-cc-discipline-tab-content ${escape(tab)}">${content}</div>${action}</aside>`;
}

export function renderDetailsPanel(selection, fallback, tab = "overview", action = "") {
  if (!selection) return `<aside class="vr-cc-info vr-cc-details-pane">${fallback}${action}</aside>`;
  if (selection.kind === "Discipline") return disciplineDetailsPanel(selection, tab, action);
  if (["species", "origin", "background"].includes(String(selection.kind ?? "").toLowerCase())) {
    const about = `<p>${escape(selection.description || "No description is available.")}</p>${selection.summary ? `<p>${escape(selection.summary)}</p>` : ""}`;
    return `<aside class="vr-cc-info vr-cc-details-pane vr-cc-reference-details"><div class="vr-cc-info-heading"><span>${escape(selection.kind)}</span><h2>${escape(selection.name)}</h2></div>${selection.img ? `<img class="vr-cc-detail-image" src="${escape(selection.img)}" alt="" />` : '<div class="vr-cc-inspector-art-placeholder"><i class="fa-regular fa-image"></i><span>Artwork unavailable</span></div>'}<nav class="vr-cc-inspector-tabs vr-cc-inspector-about-tab" aria-label="About"><span>About</span></nav><div class="vr-cc-reference vr-cc-inspector-content">${about}</div>${action}</aside>`;
  }
  const abilities = Array.isArray(selection.abilities) ? selection.abilities : [];
  const lore = selection.lore || selection.background || "No additional lore is available.";
  const content = tab === "abilities" ? (abilities.length ? `<div class="vr-cc-inspector-list">${abilities.map(ability => `<article><strong>${escape(ability.name)}</strong><small>${escape(ability.type || "Ability")}</small><p>${escape(ability.text || ability.description || "")}</p></article>`).join("")}</div>` : "<p>No abilities are authored for this selection.</p>") : tab === "lore" ? `<p>${escape(lore)}</p>` : `<p>${escape(selection.description || "No description is available.")}</p>${selection.summary ? `<p>${escape(selection.summary)}</p>` : ""}`;
  return `<aside class="vr-cc-info vr-cc-details-pane"><div class="vr-cc-info-heading"><span>${escape(selection.kind ?? "Selection")}</span><h2>${escape(selection.name)}</h2></div>${selection.img ? `<img class="vr-cc-detail-image" src="${escape(selection.img)}" alt="" />` : '<div class="vr-cc-inspector-art-placeholder"><i class="fa-regular fa-image"></i><span>Artwork unavailable</span></div>'}<nav class="vr-cc-inspector-tabs"><button type="button" data-action="inspector-tab" data-inspector-tab="overview" class="${tab === "overview" ? "active" : ""}">Overview</button><button type="button" data-action="inspector-tab" data-inspector-tab="abilities" class="${tab === "abilities" ? "active" : ""}">Abilities</button><button type="button" data-action="inspector-tab" data-inspector-tab="lore" class="${tab === "lore" ? "active" : ""}">Lore</button></nav><div class="vr-cc-reference vr-cc-inspector-content">${content}</div>${action}</aside>`;
}
