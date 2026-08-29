const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
const localize = (key, fallback) => {
  const value = globalThis.game?.i18n?.localize?.(key);
  return value && value !== key ? value : fallback;
};
const plainText = value => String(value ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
const words = value => plainText(value).match(/\S+/g)?.length ?? 0;
export const BIOGRAPHY_SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "earlyLife", label: "Early Life" },
  { key: "career", label: "Career" },
  { key: "relationships", label: "Relationships" },
  { key: "notes", label: "Notes" }
];

function biographySections(model = {}) {
  const sections = Object.fromEntries(BIOGRAPHY_SECTIONS.map(({ key }) => [key, String(model.biographySections?.[key] ?? "")]));
  if (!sections.overview && model.biography) sections.overview = String(model.biography);
  return sections;
}

function narrativeField({ path, label, question, helper, value, editing = false, rows = 2, className = "" }) {
  const answer = String(value ?? "").trim();
  if (editing) return `<section class="vr-cc-identity-answer editing ${className}" data-identity-focus="${escape(path)}">
    <header class="vr-cc-identity-answer-header"><span>${escape(label)}</span><button type="button" class="vr-cc-text-action" data-action="finish-identity-field">${escape(localize("VEILRUNNER.Chargen.Identity.DoneEditing", "Done"))}</button></header>
    <strong>${escape(question)}</strong>
    <small>${escape(helper)}</small>
    <textarea name="${escape(path)}" rows="${rows}" aria-label="${escape(label)}" data-identity-editor>${escape(value)}</textarea>
  </section>`;
  return `<section class="vr-cc-identity-answer ${answer ? "filled" : "empty"} ${className}" data-identity-focus="${escape(path)}">
    <header class="vr-cc-identity-answer-header"><span>${escape(label)}</span><button type="button" class="vr-cc-text-action" data-action="edit-identity-field" data-identity-field="${escape(path)}"><i class="fa-solid fa-${answer ? "pen" : "plus"}" aria-hidden="true"></i> ${escape(answer ? localize("VEILRUNNER.Chargen.Identity.EditResponse", "Edit response") : localize("VEILRUNNER.Chargen.Identity.AddResponse", "Add response"))}</button></header>
    <strong>${escape(question)}</strong>
    <small>${escape(helper)}</small>
    ${answer ? `<p tabindex="0">${escape(answer)}</p>` : ""}
  </section>`;
}

function sectionHeader(title, eyebrow = "", action = "") {
  return `<header class="vr-cc-identity-card-heading"><div>${eyebrow ? `<span>${escape(eyebrow)}</span>` : ""}<h2>${escape(title)}</h2></div>${action}</header>`;
}

function biographySummary(model) {
  const sections = biographySections(model);
  const populated = BIOGRAPHY_SECTIONS.filter(({ key }) => plainText(sections[key]));
  const activeKey = populated.some(({ key }) => key === model.biographySummaryTab) ? model.biographySummaryTab : populated[0]?.key ?? "overview";
  const biography = sections[activeKey];
  const plain = plainText(biography);
  const totalWords = BIOGRAPHY_SECTIONS.reduce((total, { key }) => total + words(sections[key]), 0);
  const action = `<button type="button" class="vr-cc-text-action" data-action="open-identity-pane" data-identity-pane="biography">${escape(populated.length ? localize("VEILRUNNER.Chargen.Identity.ContinueBiography", "Continue Biography") : localize("VEILRUNNER.Chargen.Identity.StartBiography", "Start Biography"))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
  const excerpt = plain;
  return `<article class="vr-cc-identity-card vr-cc-biography-summary ${excerpt ? "filled" : "empty"}" data-identity-focus="biography">
    ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"), "", action)}
    ${populated.length ? `<nav class="vr-cc-biography-tabs compact" aria-label="${escape(localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"))}">${populated.map(section => `<button type="button" class="${section.key === activeKey ? "active" : ""}" data-action="set-biography-summary-tab" data-biography-tab="${escape(section.key)}">${escape(section.label)}</button>`).join("")}</nav>` : ""}
    <div class="vr-cc-biography-preview"><i class="fa-solid fa-book-open" aria-hidden="true"></i>${excerpt
      ? `<blockquote>${escape(excerpt)}</blockquote>`
      : `<div class="vr-cc-purposeful-empty"><strong>${escape(localize("VEILRUNNER.Chargen.Identity.NoBiography", "Your story hasn't been written yet."))}</strong><small>${escape(localize("VEILRUNNER.Chargen.Identity.NoBiographyHelp", "Start with a few lines or build a full history over time."))}</small></div>`}</div>
    <footer>${totalWords ? `<span>${totalWords.toLocaleString()} ${localize("VEILRUNNER.Chargen.Identity.Words", "words")}</span>` : "<span></span>"}</footer>
  </article>`;
}

function languageSummary(model) {
  const names = model.knownLanguages ?? [];
  const used = model.freeLanguage?.definitionId ? 1 : 0;
  const action = `<button type="button" class="vr-cc-text-action" data-action="open-identity-pane" data-identity-pane="languages">${escape(localize("VEILRUNNER.Chargen.Identity.ManageLanguages", "Manage Languages"))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
  return `<article class="vr-cc-identity-card vr-cc-language-summary" data-identity-focus="languages">
    ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.Languages", "Languages"), "", action)}
    ${names.length ? `<div class="vr-cc-identity-chips">${names.map(name => `<span>${escape(name)}</span>`).join("")}</div>` : `<div class="vr-cc-purposeful-empty"><strong>${escape(localize("VEILRUNNER.Chargen.Identity.NoLanguages", "No bonus languages selected yet."))}</strong><small>${escape(localize("VEILRUNNER.Chargen.Identity.NoLanguagesHelp", "Your free language pick is optional and can be selected later."))}</small></div>`}
    <p class="vr-cc-summary-status"><strong>${escape(localize("VEILRUNNER.Chargen.Identity.FreeLanguagePicks", "Free Language Pick"))}:</strong> ${used} / 1 ${escape(localize("VEILRUNNER.Chargen.Identity.Used", "used"))}</p>
  </article>`;
}

function contactSummary(model) {
  const contacts = model.contacts ?? [];
  const action = `<button type="button" class="vr-cc-text-action" data-action="open-identity-pane" data-identity-pane="contacts">${escape(localize("VEILRUNNER.Chargen.Identity.ManageContacts", "Manage Contacts"))} <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>`;
  return `<article class="vr-cc-identity-card vr-cc-contact-summary" data-identity-focus="contacts">
    ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.RelationshipsContacts", "Relationships & Contacts"), "", action)}
    <div class="vr-cc-identity-contact-preview">${contacts.length ? contacts.slice(0, 3).map(contact => `<div><span class="vr-cc-contact-avatar"><i class="fa-solid fa-user-group" aria-hidden="true"></i></span><p><strong>${escape(contact.name || contact.role || localize("VEILRUNNER.Chargen.Identity.Contact", "Contact"))}</strong><small>${escape([contact.role, contact.disposition].filter(Boolean).join(" · ") || localize("VEILRUNNER.Chargen.Identity.NoRelationshipDetails", "No relationship details"))}</small></p></div>`).join("") : `<div class="vr-cc-purposeful-empty"><strong>${escape(localize("VEILRUNNER.Chargen.Identity.NoContacts", "No contacts added yet."))}</strong><small>${escape(localize("VEILRUNNER.Chargen.Identity.NoContactsHelp", "Choose the people who matter in your story: friends, rivals, mentors, and useful connections."))}</small></div>`}</div>
    <footer><span>${contacts.length} ${escape(contacts.length === 1 ? localize("VEILRUNNER.Chargen.Identity.Contact", "contact") : localize("VEILRUNNER.Chargen.Identity.Contacts", "contacts"))}</span></footer>
  </article>`;
}

export function renderIdentityOverview(model) {
  const tags = [model.species, model.origin, model.background].filter(Boolean);
  const editing = path => model.identityEditingField === path;
  return `<div class="vr-cc-identity-overview">
    <header class="vr-cc-dossier-heading"><h1>${escape(localize("VEILRUNNER.Chargen.Identity.Dossier", "Dossier"))}</h1></header>
    <article class="vr-cc-identity-card vr-cc-character-profile" data-identity-focus="profile">
      ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.CharacterProfile", "Character Profile"))}
      <div class="vr-cc-profile-grid">
        <button type="button" class="vr-cc-profile-portrait" data-action="pick-portrait" title="${escape(localize("VEILRUNNER.Chargen.Identity.ChoosePortrait", "Choose portrait"))}"><img src="${escape(model.portraitImage)}" alt="${escape(localize("VEILRUNNER.Chargen.Identity.CurrentPortrait", "Current character portrait"))}" /></button>
        ${model.identityProfileEditing ? `<div class="vr-cc-profile-fields editing">
          <label><span>${escape(localize("VEILRUNNER.Chargen.Identity.Name", "Name"))}</span><input name="name" value="${escape(model.name)}" data-identity-editor /></label>
          <div class="vr-cc-profile-compact"><label><span>${escape(localize("VEILRUNNER.Chargen.Identity.Pronouns", "Pronouns"))}</span><input name="pronouns" value="${escape(model.pronouns)}" /></label><label><span>${escape(localize("VEILRUNNER.Age", "Age"))}</span><input name="age" value="${escape(model.age)}" /></label></div>
          <div class="vr-cc-derived-size"><span>${escape(localize("VEILRUNNER.Size", "Size"))}</span><strong>${escape(model.size || "—")}</strong><small>${escape(localize("VEILRUNNER.Chargen.Identity.SizeDerived", "Determined by Species"))}</small></div>
          <button type="button" class="vr-cc-text-action" data-action="finish-identity-profile">${escape(localize("VEILRUNNER.Chargen.Identity.DoneEditing", "Done"))}</button>
        </div>` : `<div class="vr-cc-profile-dossier">
          <div class="vr-cc-profile-name"><span>${escape(localize("VEILRUNNER.Chargen.Identity.Name", "Name"))}</span><strong>${escape(model.name || localize("VEILRUNNER.Chargen.Identity.UnnamedCharacter", "Unnamed Character"))}</strong></div>
          <div class="vr-cc-identity-tags">${tags.length ? tags.map(tag => `<span>${escape(tag)}</span>`).join("") : `<em>${escape(localize("VEILRUNNER.Chargen.Identity.NoProfileSelections", "Species, home planet, and background appear here."))}</em>`}</div>
          <dl><div class="vr-cc-profile-chip"><dt>${escape(localize("VEILRUNNER.Chargen.Identity.Pronouns", "Pronouns"))}</dt><dd>${escape(model.pronouns || "—")}</dd></div><div class="vr-cc-profile-chip"><dt>${escape(localize("VEILRUNNER.Age", "Age"))}</dt><dd>${escape(model.age || "—")}</dd></div><div class="vr-cc-profile-size"><dt>${escape(localize("VEILRUNNER.Size", "Size"))}</dt><dd>${model.size ? `${escape(model.size)} · ` : ""}${escape(localize("VEILRUNNER.Chargen.Identity.SizeDerived", "Determined by Species"))}</dd></div></dl>
          <button type="button" class="vr-cc-text-action" data-action="edit-identity-profile"><i class="fa-solid fa-pen" aria-hidden="true"></i> ${escape(localize("VEILRUNNER.Chargen.Identity.EditProfile", "Edit Profile"))}</button>
        </div>`}
      </div>
      ${narrativeField({ path: "appearance", label: localize("VEILRUNNER.Appearance", "Appearance"), question: localize("VEILRUNNER.Chargen.Identity.AppearanceQuestion", "What does the city see when it looks at you?"), helper: localize("VEILRUNNER.Chargen.Identity.AppearanceHelp", "Scars, augments, clothing, posture, and anything people remember."), value: model.appearance, editing: editing("appearance"), rows: 3, className: "wide" })}
      ${languageSummary(model)}
    </article>

    ${contactSummary(model)}

    <article class="vr-cc-identity-card vr-cc-about-character vr-cc-about-history" data-identity-focus="about">
      ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.AboutCharacter", "About Your Character"))}
      <div class="vr-cc-guided-grid">
        ${narrativeField({ path: "personalityCues", label: localize("VEILRUNNER.Chargen.Identity.PersonalityCues", "Personality Cues"), question: localize("VEILRUNNER.Chargen.Identity.PersonalityQuestion", "Who do people meet before they really know you?"), helper: localize("VEILRUNNER.Chargen.Identity.PersonalityHelp", "The impression you give off before someone learns what's underneath."), value: model.personalityCues, editing: editing("personalityCues") })}
        ${narrativeField({ path: "values", label: localize("VEILRUNNER.Chargen.Identity.Values", "Values"), question: localize("VEILRUNNER.Chargen.Identity.ValuesQuestion", "What will you refuse to compromise on?"), helper: localize("VEILRUNNER.Chargen.Identity.ValuesHelp", "The lines you won't cross—even when walking away costs you something."), value: model.values, editing: editing("values") })}
        ${narrativeField({ path: "mannerisms", label: localize("VEILRUNNER.Chargen.Identity.Mannerisms", "Mannerisms"), question: localize("VEILRUNNER.Chargen.Identity.MannerismsQuestion", "What do you do without realizing it?"), helper: localize("VEILRUNNER.Chargen.Identity.MannerismsHelp", "Habits, tells, gestures, speech patterns, and little rituals other people notice."), value: model.mannerisms, editing: editing("mannerisms") })}
        ${narrativeField({ path: "firstImpression", label: localize("VEILRUNNER.Chargen.Identity.FirstImpression", "First Impression"), question: localize("VEILRUNNER.Chargen.Identity.FirstImpressionQuestion", "What do people notice first?"), helper: localize("VEILRUNNER.Chargen.Identity.FirstImpressionHelp", "The first detail that sticks after you leave the room."), value: model.firstImpression, editing: editing("firstImpression") })}
      </div>
      <section class="vr-cc-history-motivation" data-identity-focus="history">
        ${sectionHeader(localize("VEILRUNNER.Chargen.Identity.HistoryMotivation", "History & Motivation"))}
        <div class="vr-cc-guided-grid three">
          ${narrativeField({ path: "importantEvent", label: localize("VEILRUNNER.Chargen.Identity.ImportantEvent", "Important Event"), question: localize("VEILRUNNER.Chargen.Identity.ImportantEventQuestion", "What changed the direction of your life?"), helper: localize("VEILRUNNER.Chargen.Identity.ImportantEventHelp", "Give the GM a moment from your past that can still affect your present."), value: model.importantEvent, editing: editing("importantEvent") })}
          ${narrativeField({ path: "currentMotivation", label: localize("VEILRUNNER.Chargen.Identity.CurrentMotivation", "Current Motivation"), question: localize("VEILRUNNER.Chargen.Identity.CurrentMotivationQuestion", "Why are you still running?"), helper: localize("VEILRUNNER.Chargen.Identity.CurrentMotivationHelp", "Give the GM something they can place opportunities—and complications—in front of."), value: model.currentMotivation, editing: editing("currentMotivation") })}
          ${narrativeField({ path: "unresolvedConnection", label: localize("VEILRUNNER.Chargen.Identity.UnresolvedConnection", "Unresolved Connection or Problem"), question: localize("VEILRUNNER.Chargen.Identity.UnresolvedQuestion", "Who or what haven't you been able to leave behind?"), helper: localize("VEILRUNNER.Chargen.Identity.UnresolvedHelp", "Give the world someone or something that can come looking for you."), value: model.unresolvedConnection, editing: editing("unresolvedConnection") })}
        </div>
      </section>
    </article>

    <article class="vr-cc-identity-card vr-cc-persona-centerpiece" data-identity-focus="persona">${sectionHeader(localize("VEILRUNNER.PersonaIndex", "Persona Index"), "", model.personaBaselineEstablished ? "" : `<p class="vr-cc-persona-baseline"><strong>Persona baseline not established yet.</strong> <span>Choose a species, home planet, background, or discipline to generate a starting alignment.</span></p>`)}${model.personaHtml}</article>

    ${biographySummary(model)}
  </div>`;
}

export function renderBiographyPane(model) {
  const sections = biographySections(model);
  const activeKey = BIOGRAPHY_SECTIONS.some(({ key }) => key === model.biographyTab) ? model.biographyTab : "overview";
  const totalWords = BIOGRAPHY_SECTIONS.reduce((total, { key }) => total + words(sections[key]), 0);
  return `<section class="vr-cc-identity-manager vr-cc-biography-manager">
    <header><button type="button" class="vr-cc-btn" data-action="open-identity-pane" data-identity-pane="overview"><i class="fa-solid fa-arrow-left"></i> ${escape(localize("VEILRUNNER.Chargen.Identity.BackToIdentity", "Back to Identity"))}</button><div><span>${escape(localize("VEILRUNNER.Chargen.Identity.Dossier", "Dossier"))}</span><h2>${escape(localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"))}</h2><p>${escape(localize("VEILRUNNER.Chargen.Identity.BiographyHelp", "Write as much or as little as your character needs. No section is required."))}</p></div><strong>${totalWords.toLocaleString()} ${escape(localize("VEILRUNNER.Chargen.Identity.Words", "words"))}</strong></header>
    <nav class="vr-cc-biography-tabs" aria-label="${escape(localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"))}">${BIOGRAPHY_SECTIONS.map(section => `<button type="button" class="${section.key === activeKey ? "active" : ""}" data-action="set-biography-tab" data-biography-tab="${escape(section.key)}">${escape(section.label)}</button>`).join("")}</nav>
    <form data-biography-form>${BIOGRAPHY_SECTIONS.map(section => `<label class="vr-cc-biography-editor ${section.key === activeKey ? "active" : ""}"><span>${escape(section.label)}</span><textarea name="biographySections.${escape(section.key)}" data-identity-editor aria-label="${escape(section.label)}">${escape(sections[section.key])}</textarea></label>`).join("")}</form>
  </section>`;
}

export function renderLanguagePane(model) {
  const selectedId = model.freeLanguage?.definitionId ?? "";
  return `<section class="vr-cc-identity-manager vr-cc-language-manager">
    <header><button type="button" class="vr-cc-btn" data-action="open-identity-pane" data-identity-pane="overview"><i class="fa-solid fa-arrow-left"></i> ${escape(localize("VEILRUNNER.Chargen.Identity.BackToIdentity", "Back to Identity"))}</button><div><span>${escape(localize("VEILRUNNER.Chargen.Identity.Communication", "Communication"))}</span><h2>${escape(localize("VEILRUNNER.Chargen.Identity.ManageLanguages", "Manage Languages"))}</h2><p>${escape(localize("VEILRUNNER.Chargen.Identity.LanguageManagerHelp", "Your free language is optional and can be selected now or added later."))}</p></div><strong>${selectedId ? 1 : 0} / 1 ${escape(localize("VEILRUNNER.Chargen.Identity.Used", "used"))}</strong></header>
    <label class="vr-cc-manager-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" name="languageSearch" value="${escape(model.languageSearch)}" placeholder="${escape(localize("VEILRUNNER.Chargen.Identity.SearchLanguages", "Search languages"))}" /></label>
    <div class="vr-cc-language-existing"><h3>${escape(localize("VEILRUNNER.Chargen.Identity.KnownLanguages", "Known Languages"))}</h3><div class="vr-cc-identity-chips">${model.knownLanguages.length ? model.knownLanguages.map(name => `<span>${escape(name)}</span>`).join("") : `<em>${escape(localize("VEILRUNNER.Chargen.Identity.NoLanguages", "No known languages yet."))}</em>`}</div></div>
    <div class="vr-cc-language-catalog">${model.languages.length ? model.languages.map(language => `<article class="${language.definitionId === selectedId ? "selected" : ""}"><img src="${escape(language.img)}" alt="" /><div><strong>${escape(language.name)}</strong><p>${escape(language.description || localize("VEILRUNNER.Chargen.Identity.NoLanguageDescription", "No description has been authored."))}</p></div><button type="button" class="vr-cc-btn ${language.definitionId === selectedId ? "selected" : "primary"}" data-action="select-free-language" data-language-id="${escape(language.definitionId)}">${escape(language.definitionId === selectedId ? localize("VEILRUNNER.Chargen.Identity.Selected", "Selected") : localize("VEILRUNNER.Chargen.Identity.Choose", "Choose"))}</button></article>`).join("") : `<div class="vr-cc-catalog-empty"><i class="fa-solid fa-language"></i><h3>${escape(localize("VEILRUNNER.Chargen.Identity.EmptyLanguageCatalog", "No language records have been authored."))}</h3><p>${escape(localize("VEILRUNNER.Chargen.Identity.EmptyLanguageCatalogHelp", "The Veilrunner Languages compendium is ready for canonical entries. Existing character languages remain preserved."))}</p></div>`}</div>
  </section>`;
}

export function renderContactPane(model) {
  const contact = model.contacts[model.contactFocus];
  return `<section class="vr-cc-identity-manager vr-cc-contact-manager">
    <header><button type="button" class="vr-cc-btn" data-action="open-identity-pane" data-identity-pane="overview"><i class="fa-solid fa-arrow-left"></i> ${escape(localize("VEILRUNNER.Chargen.Identity.BackToIdentity", "Back to Identity"))}</button><div><span>${escape(localize("VEILRUNNER.Chargen.Identity.Network", "Network"))}</span><h2>${escape(localize("VEILRUNNER.Chargen.Identity.ManageContacts", "Manage Contacts"))}</h2><p>${escape(localize("VEILRUNNER.Chargen.Identity.ContactManagerHelp", "Keep the people, debts, and relationships that can pull your runner back into the story."))}</p></div><strong>${model.contacts.length} ${escape(localize("VEILRUNNER.Chargen.Identity.Total", "total"))}</strong></header>
    <div class="vr-cc-contact-manager-tools"><label class="vr-cc-manager-search"><i class="fa-solid fa-magnifying-glass"></i><input type="search" name="contactSearch" value="${escape(model.contactSearch)}" placeholder="${escape(localize("VEILRUNNER.Chargen.Identity.SearchContacts", "Search contacts"))}" /></label><select name="contactRoleFilter"><option value="all">${escape(localize("VEILRUNNER.Chargen.Identity.AllContactTypes", "All contact types"))}</option>${model.contactRoles.map(role => `<option value="${escape(role)}" ${model.contactRoleFilter === role ? "selected" : ""}>${escape(role)}</option>`).join("")}</select><button type="button" class="vr-cc-btn primary" data-action="add-contact"><i class="fa-solid fa-plus"></i> ${escape(localize("VEILRUNNER.Chargen.Identity.AddContact", "Add Contact"))}</button></div>
    <div class="vr-cc-contact-manager-grid"><div class="vr-cc-contact-directory">${model.filteredContacts.length ? model.filteredContacts.map(entry => `<button type="button" class="${entry.index === model.contactFocus ? "active" : ""}" data-contact-choice="${entry.index}"><span><i class="fa-solid fa-user-group"></i></span><p><strong>${escape(entry.contact.name || entry.contact.role || `${localize("VEILRUNNER.Chargen.Identity.Contact", "Contact")} ${entry.index + 1}`)}</strong><small>${escape([entry.contact.role, entry.contact.disposition].filter(Boolean).join(" · ") || localize("VEILRUNNER.Chargen.Identity.NoDetails", "No details"))}</small></p></button>`).join("") : `<p class="vr-cc-contact-empty">${escape(localize("VEILRUNNER.Chargen.Identity.NoContactMatches", "No contacts match these filters."))}</p>`}</div>
      <div class="vr-cc-contact-editor">${contact ? `<div class="vr-cc-contact-editor-heading"><h3>${escape(contact.name || contact.role || `${localize("VEILRUNNER.Chargen.Identity.Contact", "Contact")} ${model.contactFocus + 1}`)}</h3><button type="button" class="vr-cc-icon" data-action="remove-contact" data-contact-index="${model.contactFocus}" title="${escape(localize("VEILRUNNER.Chargen.Identity.RemoveContact", "Remove contact"))}"><i class="fa-solid fa-trash"></i></button></div><label><span>${escape(localize("VEILRUNNER.Chargen.Identity.Name", "Name"))}</span><input name="contacts.${model.contactFocus}.name" value="${escape(contact.name)}" /></label><label><span>${escape(localize("VEILRUNNER.Chargen.Identity.ContactType", "Contact Type"))}</span><input name="contacts.${model.contactFocus}.role" value="${escape(contact.role)}" /></label><label><span>${escape(localize("VEILRUNNER.Chargen.Identity.RelationshipStatus", "Relationship / Status"))}</span><input name="contacts.${model.contactFocus}.disposition" value="${escape(contact.disposition)}" /></label><label class="wide"><span>${escape(localize("VEILRUNNER.Chargen.Identity.Notes", "Notes"))}</span><textarea name="contacts.${model.contactFocus}.notes" rows="7">${escape(contact.notes)}</textarea></label>` : `<div class="vr-cc-catalog-empty"><i class="fa-solid fa-address-book"></i><h3>${escape(localize("VEILRUNNER.Chargen.Identity.SelectOrAddContact", "Select or add a contact."))}</h3></div>`}</div>
    </div>
  </section>`;
}

export function renderIdentityDetails(pane = "overview", focus = "overview") {
  const entries = [
    [localize("VEILRUNNER.Chargen.Identity.CharacterProfile", "Character Profile"), localize("VEILRUNNER.Chargen.Identity.ProfileDrawerHelp", "Portrait, identity, Species-derived Size, and the way the city sees you.")],
    [localize("VEILRUNNER.Chargen.Identity.AboutCharacter", "About Your Character"), localize("VEILRUNNER.Chargen.Identity.AboutDrawerHelp", "Quick cues for playing the person behind the build.")],
    [localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"), localize("VEILRUNNER.Chargen.Identity.BiographyDrawerHelp", "Long-form history with no word or character limit.")],
    [localize("VEILRUNNER.PersonaIndex", "Persona Index"), localize("VEILRUNNER.Chargen.Identity.PersonaDrawerHelp", "Three meaningful axes shaped by authored choices and your final adjustment.")],
    [localize("VEILRUNNER.Chargen.Identity.HistoryMotivation", "History & Motivation"), localize("VEILRUNNER.Chargen.Identity.HistoryDrawerHelp", "The event, drive, and unfinished problem that keep you moving.")],
    [localize("VEILRUNNER.Chargen.Identity.Languages", "Languages"), localize("VEILRUNNER.Chargen.Identity.LanguagesDrawerHelp", "Known languages plus an optional free selection that can be added later.")],
    [localize("VEILRUNNER.Chargen.Identity.RelationshipsContacts", "Relationships & Contacts"), localize("VEILRUNNER.Chargen.Identity.ContactsDrawerHelp", "A compact network summary with full management inside Identity.")]
  ];
  const paneCopy = {
    biography: [localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"), localize("VEILRUNNER.Chargen.Identity.BiographyPaneGuidance", "Write continuous prose in the full editor. Changes stay in the character-generation draft until Review → Confirm.")],
    languages: [localize("VEILRUNNER.Chargen.Identity.Languages", "Languages"), localize("VEILRUNNER.Chargen.Identity.LanguagesPaneGuidance", "The free Language selection is optional and can be added later. Existing and externally granted languages remain preserved.")],
    contacts: [localize("VEILRUNNER.Chargen.Identity.RelationshipsContacts", "Relationships & Contacts"), localize("VEILRUNNER.Chargen.Identity.ContactsPaneGuidance", "Search, filter, add, and edit the contacts that belong to this character's network.")]
  }[pane];
  if (paneCopy) return `<div class="vr-cc-info-heading"><span>${escape(localize("VEILRUNNER.Identity", "Identity"))}</span><h2>${escape(paneCopy[0])}</h2></div><div class="vr-cc-reference"><p>${escape(paneCopy[1])}</p></div>`;
  const focusCopy = {
    profile: [localize("VEILRUNNER.Chargen.Identity.CharacterProfile", "Character Profile"), localize("VEILRUNNER.Chargen.Identity.ProfileDrawerHelp", "Portrait, identity, Species-derived Size, and the way the city sees you.")],
    appearance: [localize("VEILRUNNER.Appearance", "Appearance"), localize("VEILRUNNER.Chargen.Identity.AppearanceDrawerHelp", "Describe the visible details, augments, style, and physical presence that make the character recognizable.")],
    about: [localize("VEILRUNNER.Chargen.Identity.AboutCharacter", "About Your Character"), localize("VEILRUNNER.Chargen.Identity.AboutDrawerHelp", "Quick cues for playing the person behind the build.")],
    personalityCues: [localize("VEILRUNNER.Chargen.Identity.PersonalityCues", "Personality Cues"), localize("VEILRUNNER.Chargen.Identity.PersonalityDrawerHelp", "Capture the outward temperament people encounter before they understand the character more deeply.")],
    values: [localize("VEILRUNNER.Chargen.Identity.Values", "Values"), localize("VEILRUNNER.Chargen.Identity.ValuesDrawerHelp", "Name the convictions and boundaries the character protects when compromise would be easier.")],
    mannerisms: [localize("VEILRUNNER.Chargen.Identity.Mannerisms", "Mannerisms"), localize("VEILRUNNER.Chargen.Identity.MannerismsDrawerHelp", "Record repeatable gestures, habits, speech patterns, or tells that can appear naturally during play.")],
    firstImpression: [localize("VEILRUNNER.Chargen.Identity.FirstImpression", "First Impression"), localize("VEILRUNNER.Chargen.Identity.FirstImpressionDrawerHelp", "Choose the detail other people are most likely to remember after a first meeting.")],
    biography: [localize("VEILRUNNER.Chargen.Identity.Biography", "Biography"), localize("VEILRUNNER.Chargen.Identity.BiographyDrawerHelp", "Long-form history with no word or character limit.")],
    persona: [localize("VEILRUNNER.PersonaIndex", "Persona Index"), localize("VEILRUNNER.Chargen.Identity.PersonaFocusedHelp", "Criminal ↔ Lawful, Ruthless ↔ Empathy, and Individual ↔ Collectivist describe three independent ethical axes. Character choices establish these values automatically; any supported personal adjustment remains secondary.")],
    history: [localize("VEILRUNNER.Chargen.Identity.HistoryMotivation", "History & Motivation"), localize("VEILRUNNER.Chargen.Identity.HistoryDrawerHelp", "The event, drive, and unfinished problem that keep you moving.")],
    importantEvent: [localize("VEILRUNNER.Chargen.Identity.ImportantEvent", "Important Event"), localize("VEILRUNNER.Chargen.Identity.ImportantEventDrawerHelp", "The defining event gives the GM a moment to reference when building callbacks, NPC connections, consequences, or story hooks.")],
    currentMotivation: [localize("VEILRUNNER.Chargen.Identity.CurrentMotivation", "Current Motivation"), localize("VEILRUNNER.Chargen.Identity.CurrentMotivationDrawerHelp", "A clear motivation helps the GM put meaningful opportunities, costs, and complications in the character's path.")],
    unresolvedConnection: [localize("VEILRUNNER.Chargen.Identity.UnresolvedConnection", "Unresolved Connection or Problem"), localize("VEILRUNNER.Chargen.Identity.UnresolvedDrawerHelp", "An unfinished connection gives the world someone or something that can return, ask for help, or demand a reckoning.")],
    languages: [localize("VEILRUNNER.Chargen.Identity.Languages", "Languages"), localize("VEILRUNNER.Chargen.Identity.LanguagesPaneGuidance", "Languages granted by character choices are preserved. The free language pick is optional and can be selected later.")],
    contacts: [localize("VEILRUNNER.Chargen.Identity.RelationshipsContacts", "Relationships & Contacts"), localize("VEILRUNNER.Chargen.Identity.ContactsPaneGuidance", "Contacts are meaningful people and connections in the character's story. Open management to record their type, status, and details.")]
  }[focus];
  if (focusCopy) return `<div class="vr-cc-info-heading"><span>${escape(localize("VEILRUNNER.Identity", "Identity"))}</span><h2>${escape(focusCopy[0])}</h2></div><div class="vr-cc-reference vr-cc-identity-context"><strong>${escape(localize("VEILRUNNER.Chargen.Identity.WhyThisMatters", "Why this matters"))}</strong><p>${escape(focusCopy[1])}</p></div>`;
  return `<div class="vr-cc-info-heading"><span>${escape(localize("VEILRUNNER.Details", "Details"))}</span><h2>${escape(localize("VEILRUNNER.Identity", "Identity"))}</h2></div><div class="vr-cc-reference vr-cc-identity-drawer-list">${entries.map(([title, description]) => `<section><strong>${escape(title)}</strong><p>${escape(description)}</p></section>`).join("")}</div>`;
}
