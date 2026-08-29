const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

function selectionCard(option, path, selected) {
  const art = option.img ? `<img src="${escape(option.img)}" alt="" />` : `<i class="fa-regular fa-image"></i>`;
  return `<button type="button" class="vr-cc-selection-card vr-cc-full-art-choice-card vr-cc-path-choice-card ${option.value === selected ? "selected" : ""}" data-path-choice="${escape(path)}" data-value="${escape(option.value)}" ${option.archetype ? `data-path-archetype="${escape(option.archetype)}" data-path-profession="${escape(option.profession)}"` : ""} aria-pressed="${option.value === selected}"><span class="vr-cc-choice-image vr-cc-selection-art" aria-hidden="true">${art}</span><span class="vr-cc-choice-name vr-cc-path-choice-name"><strong>${escape(option.label)}</strong><small>${escape(option.caption || path)}</small></span></button>`;
}

/** Shared major-decision browser; callers supply only authored option view models. */
export function renderSelectionBrowser({ path, label, options = [], groups = [], selected, mode = "all" }) {
  const normalized = options.map(option => typeof option === "string" ? { value: option, label: option } : option);
  const ordered = normalized;
  const normalizedGroups = groups.map(group => ({
    label: group.label,
    options: (group.options ?? []).map(option => typeof option === "string" ? { value: option, label: option } : option)
  })).filter(group => group.options.length);
  const cards = normalizedGroups.length
    ? `<div class="vr-cc-selection-groups">${normalizedGroups.map((group, index) => `<section class="vr-cc-selection-group"><h3>${escape(group.label)}</h3><div class="vr-cc-selection-row"><button type="button" class="vr-cc-selection-row-scroll previous" data-action="scroll-discipline-row" data-scroll-direction="-1" aria-label="Scroll ${escape(group.label)} disciplines left" hidden><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><div class="vr-cc-selection-row-track" data-discipline-scroll-row="${index}" tabindex="0">${group.options.map(option => selectionCard(option, path, selected)).join("")}</div><button type="button" class="vr-cc-selection-row-scroll next" data-action="scroll-discipline-row" data-scroll-direction="1" aria-label="Scroll ${escape(group.label)} disciplines right"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div></section>`).join("")}</div>`
    : `<div class="vr-cc-selection-card-grid">${ordered.length ? ordered.map(option => selectionCard(option, path, selected)).join("") : `<p class="vr-cc-path-empty">${mode === "search" ? "No Disciplines match this search." : `Choose ${path === "discipline" ? "a profession" : "an archetype"} first.`}</p>`}</div>`;
  const header = mode !== "guided"
    ? `<header><div><span>${escape(label)}</span><p>${mode === "search" ? "Search by Discipline, Profession, or Archetype." : "Browse every Discipline without walking the guided path."}</p></div></header>`
    : "";
  return `<section class="vr-cc-path-group vr-cc-selection-browser ${mode !== "guided" ? "compact" : ""} ${normalizedGroups.length ? "grouped" : ""}" data-path-group="${escape(path)}">${header}${cards}</section>`;
}
