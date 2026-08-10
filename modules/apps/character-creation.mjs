import { VEILRUNNER_PERSONA_INDEX_MODIFIERS, VEILRUNNER_PROFESSIONS } from "../data/professions.mjs";
import { attributePointsForLevel, attributePointsGainedAtLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { xpForLevel } from "../data/xp.mjs";

const ARCHETYPE_OPTIONS = ["Physique", "Armament", "Magic", "Tech", "Social"];
const PROFESSION_ARCHETYPES = {
  "Berserker": "Physique",
  "Gymnast": "Physique",
  "Martial Artist": "Physique",
  "Vanguard": "Physique",
  "Duelist": "Armament",
  "Field Technician": "Armament",
  "Marksman": "Armament",
  "Amplifier": "Magic",
  "Cleric": "Magic",
  "Conjurer": "Magic",
  "Druid": "Magic",
  "Elemental Adept": "Magic",
  "Magus": "Magic"
};
const EXTRA_PROFESSION_TREE = [
  { archetype: "Tech", profession: "Hardware", disciplines: ["Siliconsmith", "Gridtech", "Fabricator", "Signal Engineer"] },
  { archetype: "Tech", profession: "Software", disciplines: ["Cyber Tech", "Programmer", "Comforcer", "Netrunner"] },
  { archetype: "Tech", profession: "Mechanic", disciplines: ["Auto-Mechanic", "Cyber-mechanic"] },
  { archetype: "Tech", profession: "Vehicle Pilot", disciplines: ["Ground Operator", "Walker Operator", "Marine Operator", "Aerial Operator", "Astromech Operator", "Space Operator"] },
  { archetype: "Tech", profession: "Drone Operator", disciplines: ["Humanoid", "Multipedal", "Aquatic", "Aerial", "Astromech", "Stationary"] },
  { archetype: "Social", profession: "Investigator", disciplines: ["Forensic Analyst", "Occult Analyst"] },
  { archetype: "Social", profession: "Negotiator", disciplines: ["Con Artist", "Diplomat"] },
  { archetype: "Social", profession: "Infiltrator", disciplines: ["Chameleon", "Scout", "Locksmith", "Tracker"] },
  { archetype: "Magic", profession: "Magus", disciplines: ["Blood Mage", "Sorcerer", "Thaumaturge", "Wizard"] }
];
const ATTRIBUTE_GROUPS = [
  { key: "physical", label: "Physical", attributes: ["strength", "dexterity", "agility", "reaction"] },
  { key: "mental", label: "Mental", attributes: ["intelligence", "wisdom", "focus", "logic"] },
  { key: "social", label: "Social", attributes: ["charisma", "perception"] }
];
const PERSONA_AXES = [
  { key: "criminalLawful", left: "Criminal", right: "Lawful" },
  { key: "ruthlessEmpathy", left: "Ruthless", right: "Empathy" },
  { key: "individualCollectivist", left: "Individual", right: "Collectivist" }
];
const REFERENCE_PACKS = Object.freeze({
  species: "Veilrunner.species",
  origin: "Veilrunner.origins",
  background: "Veilrunner.backgrounds"
});
const SPECIES_GROUPS = Object.freeze([
  { label: "Mammalian", options: ["Human", "Elf", "Dwarf", "Ork", "Troll", "Goblin"] },
  { label: "Reptillian", options: ["Lizardfolk", "Dragonborn", "Kobold"] },
  { label: "Avian", options: ["Aivari"] },
  { label: "Aquatic", options: ["Kepian", "Sirenid"] },
  { label: "Synthethic", options: ["Android", "Synthoid", "Replicant"] }
]);
const BACKGROUND_OPTIONS = Object.freeze([
  "Acolyte", "artist", "academic scholar", "bartender", "correction officer", "judge",
  "mechanic", "physician", "smuggler", "surgeon", "underword operative"
]);
const ORIGIN_OPTIONS = Object.freeze(["Terra", "Luna"]);
const LEVEL_OPTIONS = Object.freeze([
  { level: 1, label: "Nobody", icon: "fa-solid fa-user" },
  { level: 5, label: "Beginner", icon: "fa-solid fa-seedling" },
  { level: 10, label: "Standard", icon: "fa-solid fa-shield-halved" },
  { level: 20, label: "Experienced", icon: "fa-solid fa-compass" },
  { level: 30, label: "Prime", icon: "fa-solid fa-star" },
  { level: 40, label: "Elite Tier", icon: "fa-solid fa-crown" }
]);
const QUALITY_FLAW_TIERS = Object.freeze(["Minor", "Moderate", "Significant", "Major", "Extreme"]);
const QUALITY_FLAW_PILLARS = Object.freeze(["Physical", "Social", "Magical", "Technical"]);
const PERSONA_DIRECTIONS = Object.freeze({
  criminal: { axis: "criminalLawful", direction: -1 }, lawful: { axis: "criminalLawful", direction: 1 },
  ruthless: { axis: "ruthlessEmpathy", direction: -1 }, empathy: { axis: "ruthlessEmpathy", direction: 1 }, empathetic: { axis: "ruthlessEmpathy", direction: 1 },
  individual: { axis: "individualCollectivist", direction: -1 }, collectivist: { axis: "individualCollectivist", direction: 1 }
});
const TREE_COLUMNS = [
  {
    key: "skills",
    label: "Skill Trees",
    icon: "fa-solid fa-crosshairs",
    nodes: ["Athletics", "Firearms", "Medicine", "Piloting", "Stealth", "Survival"]
  },
  {
    key: "spells",
    label: "Spell Trees",
    icon: "fa-solid fa-wand-sparkles",
    nodes: ["Augmentation", "Conjuration", "Divine", "Elemental", "Healing", "Illusion"]
  }
];
const STEPS = [
  { key: "level", label: "Starting Level", icon: "fa-solid fa-chart-line" },
  { key: "species", label: "Species", icon: "fa-solid fa-dna" },
  { key: "origin", label: "Origin", icon: "fa-solid fa-earth-americas" },
  { key: "background", label: "Background", icon: "fa-solid fa-scroll" },
  { key: "profession", label: "Path", icon: "fa-solid fa-id-card-clip" },
  { key: "attributes", label: "Attributes", icon: "fa-solid fa-dumbbell" },
  { key: "qualitiesFlaws", label: "Perks & Flaws", icon: "fa-solid fa-scale-balanced" },
  { key: "talents", label: "Talents & Skills", icon: "fa-solid fa-diagram-project" },
  { key: "credits", label: "Purchases", icon: "fa-solid fa-cart-shopping" },
  { key: "bio", label: "Bio", icon: "fa-solid fa-book-open" },
  { key: "review", label: "Review", icon: "fa-solid fa-circle-check" }
];
const existingCreators = new Map();

function normalizeArchetype(value) {
  const archetype = String(value ?? "").trim();
  return archetype === "Technical" ? "Tech" : archetype;
}

function professionTreeRecords() {
  const records = VEILRUNNER_PROFESSIONS.map(profession => ({
    archetype: normalizeArchetype(PROFESSION_ARCHETYPES[profession.name]),
    profession: profession.name,
    disciplines: profession.disciplines.map(discipline => discipline.name)
  }));
  for (const extra of EXTRA_PROFESSION_TREE) {
    if (!records.some(record => record.profession === extra.profession)) records.push(extra);
  }
  return records;
}

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function number(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function listFromText(value) {
  return String(value ?? "").split(/[\n,]/).map(entry => entry.trim()).filter(Boolean);
}

function textFromList(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function referenceModifiers(reference) {
  const modifiers = reference?.persona ?? reference?.system?.persona ?? [];
  const explicit = (Array.isArray(modifiers) ? modifiers : String(modifiers ?? "").split(/[\n,]/))
    .map(value => String(value).trim()).filter(Boolean);
  if (explicit.length) return explicit;
  // Existing journal/reference prose remains usable while editors migrate to the structured field.
  return Array.from(String(reference?.description ?? reference?.system?.description ?? "").matchAll(/([+-]\s*\d+)\s*(Criminal|Lawful|Ruthless|Empathy|Empathetic|Individual|Collectivist)\b/gi), match => `${match[1]} ${match[2]}`);
}

function personaModifierDeltas(modifiers) {
  const deltas = Object.fromEntries(PERSONA_AXES.map(axis => [axis.key, 0]));
  for (const modifier of modifiers ?? []) {
    const text = String(modifier ?? "").trim();
    const amount = Number(text.match(/[+-]\s*\d+/)?.[0]?.replace(/\s/g, ""));
    const direction = Object.entries(PERSONA_DIRECTIONS).find(([label]) => new RegExp(`\\b${label}\\b`, "i").test(text))?.[1];
    if (Number.isFinite(amount) && direction) deltas[direction.axis] += amount * direction.direction;
  }
  return deltas;
}

function clampPersona(value) {
  return Math.max(-100, Math.min(100, number(value)));
}

function biographyHtml(state) {
  const parts = [
    ["Appearance", state.appearance],
    ["Personality", state.personality],
    ["History", state.history],
    ["Known Languages", listFromText(state.languages).join(", ")],
    ["Talent and Skill Selections", state.talentSkillNotes],
    ["Tree Selections", state.talentSkillSelections?.join(", ")],
    ["Generation Purchases", state.purchases]
  ].filter(([, value]) => String(value ?? "").trim());
  if (!parts.length) return "";
  return parts.map(([heading, value]) => `<h3>${escape(heading)}</h3><p>${escape(value).replace(/\n/g, "<br />")}</p>`).join("");
}

function defaultState(actor) {
  const system = actor.system ?? {};
  const assignedLevel = Math.max(1, number(system.level, 1));
  const startingLevelLocked = assignedLevel > 1;
  const attributes = foundry.utils.deepClone(system.attributes ?? {});
  attributes.mental ??= {};
  attributes.social ??= {};
  attributes.mental.wisdom ??= attributes.mental.willpower ?? 0;
  attributes.social.perception ??= 0;
  delete attributes.mental.willpower;
  for (const group of ATTRIBUTE_GROUPS) {
    attributes[group.key] ??= {};
    for (const attribute of group.attributes) attributes[group.key][attribute] = Math.max(1, number(attributes[group.key][attribute], 1));
  }
  return {
    name: actor.name ?? "",
    startingLevel: system.characterGeneration?.complete
      ? number(system.characterGeneration?.startingLevel, assignedLevel)
      : startingLevelLocked ? assignedLevel : "",
    startingLevelLocked,
    species: system.species ?? "",
    origin: system.origin ?? "",
    background: system.background ?? "",
    archetype: normalizeArchetype(system.archetype ?? ""),
    profession: system.profession ?? "",
    discipline: system.discipline ?? "",
    attributes,
    qualitiesTaken: foundry.utils.deepClone(system.qualitiesTaken ?? []),
    flawsTaken: foundry.utils.deepClone(system.flawsTaken ?? []),
    talentSkillPointsSpent: number(system.characterGeneration?.talentSkillPointsSpent)
      || number(system.characterGeneration?.talentPointsSpent) + number(system.characterGeneration?.skillPointsSpent) + number(system.characterGeneration?.spellPointsSpent),
    talentSkillNotes: system.characterGeneration?.notes ?? "",
    talentSkillSelections: foundry.utils.deepClone(system.characterGeneration?.talentSkillSelections ?? []),
    qualityFlawDialog: null,
    qualityFlawSearch: "",
    qualityFlawView: "tier",
    talentPointsSpent: number(system.characterGeneration?.talentPointsSpent),
    talentNotes: system.characterGeneration?.notes ?? "",
    skillPointsSpent: number(system.characterGeneration?.skillPointsSpent),
    spellPointsSpent: number(system.characterGeneration?.spellPointsSpent),
    skillNotes: "",
    credits: number(system.credits),
    creditsSpent: number(system.characterGeneration?.creditsSpent),
    purchases: "",
    contacts: foundry.utils.deepClone(system.contacts ?? []),
    languages: textFromList(system.knownLanguages),
    pronouns: system.pronouns ?? "",
    age: system.age ?? "",
    size: system.size ?? "",
    appearance: "",
    personality: "",
    history: "",
    personaIndex: foundry.utils.deepClone(system.personaIndex ?? {})
  };
}

export function registerCharacterCreation() {
  Hooks.on("createActor", (actor, options, userId) => {
    if (actor.type !== "hero" || userId !== game.user?.id) return;
    window.setTimeout(() => openCharacterCreation(actor), 100);
  });
}

export function openCharacterCreation(actor) {
  const existing = existingCreators.get(actor.id);
  if (existing) {
    existing.bringToFront();
    return existing;
  }
  const creator = new CharacterCreationOverlay(actor);
  existingCreators.set(actor.id, creator);
  creator.render();
  return creator;
}

class CharacterCreationOverlay {
  constructor(actor) {
    this.actor = actor;
    this.step = 0;
    this.treeCanvasOpen = false;
    this.pathTransitioning = false;
    this.state = defaultState(actor);
    this.referenceOptions = Object.fromEntries(Object.keys(REFERENCE_PACKS).map(key => [key, []]));
    this.root = document.createElement("div");
    this.root.className = "veilrunner vr-character-creation";
    this.root.tabIndex = -1;
  }

  get #steps() {
    return this.state.startingLevelLocked ? STEPS.filter(step => step.key !== "level") : STEPS;
  }

  bringToFront() {
    this.root.focus();
  }

  async render() {
    actorSheetClose(this.actor);
    document.body.append(this.root);
    this.root.addEventListener("click", event => this.#onClick(event));
    this.root.addEventListener("input", event => this.#onInput(event));
    this.root.addEventListener("change", event => this.#onInput(event));
    this.#draw();
    this.root.focus();
    await this.#loadReferenceOptions();
    if (this.root.isConnected) this.#draw();
  }

  close({ renderSheet = false } = {}) {
    this.root.remove();
    existingCreators.delete(this.actor.id);
    if (renderSheet) this.actor.sheet?.render(true);
  }

  #draw() {
    if (this.treeCanvasOpen) {
      this.#drawTalentSkillCanvas();
      return;
    }
    const steps = this.#steps;
    const current = steps[this.step];
    this.root.innerHTML = `
      <div class="vr-cc-shell">
        <aside class="vr-cc-rail">
          <div class="vr-cc-brand">
            <span>Veilrunner</span>
            <strong>Character Generation</strong>
          </div>
          <nav class="vr-cc-steps">${steps.map((step, i) => `
            <button type="button" class="vr-cc-step ${i === this.step ? "active" : ""} ${i < this.step ? "complete" : ""}" data-step="${i}" title="${escape(step.label)}">
              <i class="${step.icon}"></i><span>${escape(step.label)}</span>
            </button>
          `).join("")}</nav>
        </aside>
        <main class="vr-cc-main">
          <header class="vr-cc-header">
            <div>
              <span>Step ${this.step + 1} of ${steps.length}</span>
              <h1>${escape(current.label)}</h1>
            </div>
            <button type="button" class="vr-cc-icon" data-action="cancel" title="Close"><i class="fa-solid fa-xmark"></i></button>
          </header>
          <section class="vr-cc-panel">${this.#stepContent(current.key)}</section>
          <footer class="vr-cc-footer">
            <button type="button" class="vr-cc-btn" data-action="previous" ${this.step === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i><span>Back</span></button>
            <div class="vr-cc-footer-status">${escape(this.#summaryLine())}</div>
            ${this.step === steps.length - 1
              ? `<button type="button" class="vr-cc-btn primary" data-action="confirm"><i class="fa-solid fa-check"></i><span>Confirm</span></button>`
              : `<button type="button" class="vr-cc-btn primary" data-action="next"><span>Next</span><i class="fa-solid fa-arrow-right"></i></button>`}
          </footer>
        </main>
        <aside class="vr-cc-info">
          ${this.#infoPanelContent(current.key)}
        </aside>
      </div>
      ${this.#qualityFlawDialogMarkup()}`;
  }

  #refreshInfoPanel() {
    const panel = this.root.querySelector(".vr-cc-info");
    const current = this.#steps[this.step];
    if (panel && current) panel.innerHTML = this.#infoPanelContent(current.key);
  }

  #stepContent(key) {
    if (key === "level") return this.#levelStep();
    if (["species", "origin", "background"].includes(key)) return this.#referenceChoiceStep(key);
    if (key === "profession") return this.#professionStep();
    if (key === "attributes") return this.#attributesStep();
    if (key === "qualitiesFlaws") return this.#qualitiesFlawsStep();
    if (key === "talents") return this.#talentsAndSkillsStep();
    if (key === "credits") return this.#creditsStep();
    if (key === "bio") return this.#bioStep();
    return this.#reviewStep();
  }

  #choiceText(path, label, hint) {
    return `<div class="vr-cc-grid one">
      <label class="vr-cc-field"><span>${escape(label)}</span><input name="${path}" type="text" value="${escape(this.state[path])}" data-hint="${escape(hint)}" /></label>
    </div>`;
  }

  #field(path, label, type = "text", placeholder = "") {
    return `<label class="vr-cc-field"><span>${escape(label)}</span><input name="${path}" type="${type}" value="${escape(this.state[path])}" placeholder="${escape(placeholder)}" /></label>`;
  }

  #textareaStep(textPath, title, placeholder, numberPath, numberLabel) {
    return `<div class="vr-cc-grid two">
      <label class="vr-cc-field tall"><span>${escape(title)}</span><textarea name="${textPath}" placeholder="${escape(placeholder)}">${escape(this.state[textPath])}</textarea></label>
      <label class="vr-cc-field"><span>${escape(numberLabel)}</span><input name="${numberPath}" type="number" min="0" value="${escape(this.state[numberPath])}" /></label>
    </div>`;
  }

  #textareaOnly(path, title, placeholder) {
    return `<label class="vr-cc-field tall"><span>${escape(title)}</span><textarea name="${path}" placeholder="${escape(placeholder)}">${escape(this.state[path])}</textarea></label>`;
  }

  #professionStep() {
    const records = professionTreeRecords();
    const professions = this.state.archetype
      ? records.filter(record => record.archetype === this.state.archetype)
      : [];
    const selectedRecord = records.find(record => record.profession === this.state.profession);
    const disciplines = this.state.profession ? selectedRecord?.disciplines ?? [] : [];
    return `<div class="vr-cc-path-grid">
      ${this.#pathButtonGroup("archetype", "Archetype", ARCHETYPE_OPTIONS, this.state.archetype)}
      ${this.state.archetype ? this.#pathButtonGroup("profession", "Profession", professions.map(p => p.profession).sort(), this.state.profession, !this.state.profession) : ""}
      ${this.state.profession ? this.#pathButtonGroup("discipline", "Discipline", disciplines.slice().sort(), this.state.discipline, !this.state.discipline) : ""}
    </div>`;
  }

  #pathButtonGroup(path, label, options, selected, animate = false) {
    const revealed = animate ? "revealed" : "";
    return `<section class="vr-cc-path-group ${revealed}" data-path-group="${path}">
      <h2>${escape(label)}</h2>
      <div class="vr-cc-path-buttons">
        ${options.length ? options.map(option => `
          <button type="button" class="vr-cc-path-btn ${option === selected ? "active" : ""}"
                  data-path-choice="${path}" data-value="${escape(option)}">
            <span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-regular fa-image"></i></span><span class="vr-cc-choice-name">${escape(option)}</span>
          </button>
        `).join("") : `<p class="vr-cc-path-empty">Choose ${path === "discipline" ? "a profession" : "an archetype"} first.</p>`}
      </div>
    </section>`;
  }

  #professionReference() {
    const profession = VEILRUNNER_PROFESSIONS.find(entry => entry.name === this.state.profession);
    const discipline = profession?.disciplines.find(entry => entry.name === this.state.discipline);
    const personaModifiers = VEILRUNNER_PERSONA_INDEX_MODIFIERS[`${this.state.profession}:${this.state.discipline}`] ?? discipline?.persona ?? [];
    const archetypeSummary = this.#archetypeSummary(this.state.archetype);
    if (!this.state.archetype && !profession && !discipline) return "<strong>Summary</strong><p>Select an archetype, profession, and discipline to see available local reference text.</p>";
    const abilityReference = discipline?.abilities?.length ? `<div class="vr-cc-unique-list">
        ${discipline.abilities.map(ability => `<article class="vr-cc-unique">
          <div class="vr-cc-unique-heading">
            <strong>${escape(ability.name)}</strong>
            ${this.#abilityTypeBadge(ability.type)}
          </div>
          <p>${escape(ability.text)}</p>
        </article>`).join("")}
      </div>` : "";
    return `<strong>Summary</strong>
      ${this.state.archetype ? `<p><b>${escape(this.state.archetype)}</b>: ${escape(archetypeSummary)}</p>` : ""}
      ${profession ? `<p><b>${escape(profession.name)}</b>: ${escape(profession.summary)}</p>` : ""}
      ${discipline ? `<p><b>${escape(discipline.name)}</b>: ${escape(discipline.summary)}</p>
      <dl>
        <div><dt>Primary Weapon</dt><dd>${escape(discipline.primaryWeapon)}</dd></div>
        <div><dt>Bonus Skill</dt><dd>${escape(discipline.bonusSkill)}</dd></div>
        ${personaModifiers.length ? `<div><dt>Persona Index</dt><dd>${escape(personaModifiers.join(", "))}</dd></div>` : ""}
      </dl>
      ${abilityReference}
      ${discipline.background ? `<div class="vr-cc-discipline-background"><strong>Background</strong><p>${escape(discipline.background)}</p></div>` : ""}` : ""}`;
  }

  async #loadReferenceOptions() {
    const entries = await Promise.all(Object.entries(REFERENCE_PACKS).map(async ([key, packId]) => {
      const pack = game.packs.get(packId);
      if (!pack) return [key, []];
      try {
        const index = await pack.getIndex({ fields: ["system.persona", "system.description"] });
        return [key, index.filter(entry => entry.type === key).map(entry => ({
          name: entry.name,
          persona: foundry.utils.getProperty(entry, "system.persona") ?? entry.system?.persona ?? [],
          description: foundry.utils.getProperty(entry, "system.description") ?? entry.system?.description ?? ""
        })).sort((a, b) => a.name.localeCompare(b.name))];
      } catch (error) {
        console.warn(`Veilrunner | Unable to load ${key} character options.`, error);
        return [key, []];
      }
    }));
    this.referenceOptions = Object.fromEntries(entries);
  }

  #referenceChoiceStep(key) {
    if (key === "species") return this.#speciesChoiceStep();
    if (key === "origin") return this.#originChoiceStep();
    if (key === "background") return this.#backgroundChoiceStep();
    const label = STEPS.find(step => step.key === key)?.label ?? key;
    const options = this.referenceOptions[key] ?? [];
    if (!options.length) return this.#choiceText(key, `Select ${label}`, `No ${label.toLowerCase()} reference entries are available yet. You can enter a campaign value manually.`);
    const selected = String(this.state[key] ?? "");
    const knownSelection = options.some(option => option.name === selected);
    return `<div class="vr-cc-grid one"><label class="vr-cc-field"><span>Select ${escape(label)}</span><select name="${key}">
      <option value="">Choose ${escape(label)}</option>
      ${selected && !knownSelection ? `<option value="${escape(selected)}" selected>${escape(selected)}</option>` : ""}
      ${options.map(option => `<option value="${escape(option.name)}" ${option.name === selected ? "selected" : ""}>${escape(option.name)}</option>`).join("")}
    </select></label></div>`;
  }

  #speciesChoiceStep() {
    return this.#referenceCards("species", SPECIES_GROUPS.flatMap(group => group.options.map(name => ({ category: group.label, name }))), "Choose a species. Stats and biography details can be added later.");
  }

  #originChoiceStep() {
    return this.#referenceCards("origin", ORIGIN_OPTIONS.map(name => ({ category: "Origin", name })), "Choose an origin. Literature and other origin details can be added later.");
  }

  #backgroundChoiceStep() {
    return this.#referenceCards("background", BACKGROUND_OPTIONS.map(name => ({ category: "Background", name })), "Choose a background. Literature and other background details can be added later.");
  }

  #referenceCards(path, entries, intro) {
    const selected = String(this.state[path] ?? "");
    const optionNames = new Set(entries.map(entry => entry.name));
    const categories = [];
    for (const entry of entries) {
      let category = categories.find(group => group.name === entry.category);
      if (!category) {
        category = { name: entry.category, entries: [] };
        categories.push(category);
      }
      category.entries.push(entry);
    }
    return `<div class="vr-cc-reference-cards">
      <p class="vr-cc-reference-cards-intro">${escape(intro)}</p>
      <div class="vr-cc-reference-card-grid">
        ${categories.map(category => `<section class="vr-cc-reference-card-category"><h2>${escape(category.name)}</h2><div class="vr-cc-reference-card-options">
          ${category.entries.map(entry => `<button type="button" class="vr-cc-reference-card ${entry.name === selected ? "active" : ""}" data-reference-choice-path="${escape(path)}" data-reference-choice-value="${escape(entry.name)}" aria-pressed="${entry.name === selected}">
            <span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-regular fa-image"></i></span><span class="vr-cc-choice-name">${escape(entry.name)}</span>
          </button>`).join("")}
        </div></section>`).join("")}
      </div>
      ${selected && !optionNames.has(selected) ? `<div class="vr-cc-reference-card-current">Current ${escape(path)}: <strong>${escape(selected)}</strong></div>` : ""}
    </div>`;
  }

  #levelStep() {
    const selected = number(this.state.startingLevel);
    return `<div class="vr-cc-reference-cards vr-cc-level-cards">
      <p class="vr-cc-reference-cards-intro">Choose a starting level before selecting a species. This sets the MVP Attribute, Talent, and Skill Point pools.</p>
      <section class="vr-cc-reference-card-category"><h2>Starting Level</h2><div class="vr-cc-reference-card-options">
        ${LEVEL_OPTIONS.map(option => `<button type="button" class="vr-cc-reference-card ${option.level === selected ? "active" : ""}" data-level-choice="${option.level}" aria-pressed="${option.level === selected}">
          <span class="vr-cc-choice-image" aria-hidden="true"><i class="${option.icon}"></i></span><span class="vr-cc-choice-name vr-cc-level-choice-name"><span>Level ${option.level}</span><small>${escape(option.label)}</small></span>
        </button>`).join("")}
        <label class="vr-cc-level-custom ${selected && !LEVEL_OPTIONS.some(option => option.level === selected) ? "active" : ""}">
          <span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-solid fa-gears"></i></span><span class="vr-cc-choice-name vr-cc-level-choice-name"><span>Custom Level</span><small>Enter a level</small></span>
          <input name="startingLevel" type="number" min="1" step="1" value="${selected && !LEVEL_OPTIONS.some(option => option.level === selected) ? selected : ""}" placeholder="Level" />
        </label>
      </div></section>
    </div>`;
  }

  #hasStartingLevel() {
    return Number.isInteger(number(this.state.startingLevel)) && number(this.state.startingLevel) >= 1;
  }

  async #applyStartingLevel() {
    const level = Math.max(1, number(this.state.startingLevel, 1));
    const attributeBudget = attributePointsForLevel(level);
    const talentBudget = talentPointsForLevel(level);
    const skillBudget = skillPointsForLevel(level);
    const attributeSpent = this.#attributePointCost();
    const talentSpent = Math.min(talentBudget, Math.max(0, number(this.state.talentPointsSpent)));
    const skillSpent = Math.min(skillBudget, Math.max(0, number(this.state.skillPointsSpent)));

    await this.actor.update({
      "system.level": level,
      "system.experience.max": xpForLevel(level),
      "system.attributes": this.state.attributes,
      "system.attributePoints.total": attributeBudget,
      "system.attributePoints.available": Math.max(0, attributeBudget - attributeSpent),
      "system.talentPoints.total": talentBudget,
      "system.talentPoints.available": Math.max(0, talentBudget - talentSpent),
      "system.skillPoints.total": skillBudget,
      "system.skillPoints.available": Math.max(0, skillBudget - skillSpent),
      "system.characterGeneration.startingLevel": level,
      "system.characterGeneration.attributePointsSpent": attributeSpent,
      "system.characterGeneration.talentPointsSpent": talentSpent,
      "system.characterGeneration.skillPointsSpent": skillSpent,
      "system.characterGeneration.talentSkillPointsSpent": talentSpent + skillSpent
    });
  }

  #selectedReference(key) {
    return (this.referenceOptions[key] ?? []).find(entry => entry.name === this.state[key]) ?? null;
  }

  #abilityTypeBadge(type) {
    const label = String(type ?? "").trim();
    const actionPoints = label.match(/>{1,2}/)?.[0].length;
    const cleanLabel = label.replace(/\s*>{1,2}\s*/g, "").trim() || "Ability";
    const kind = cleanLabel.toLowerCase();
    const pointIcons = actionPoints
      ? `<span class="vr-cc-action-pips" aria-label="${actionPoints} action point${actionPoints === 1 ? "" : "s"}">
          ${Array.from({ length: actionPoints }, () => `<i class="fa-solid fa-bolt"></i>`).join("")}
        </span>`
      : kind.includes("reaction")
        ? `<span class="vr-cc-reaction-pips" aria-label="reaction point"><i class="fa-solid fa-reply"></i></span>`
      : "";
    return `<span class="vr-cc-ability-type">
      ${pointIcons}
      <span>${escape(`Unique ${cleanLabel}`)}</span>
    </span>`;
  }

  #archetypeSummary(archetype) {
    const summaries = {
      Physique: "Body-led characters who solve problems through force, movement, endurance, and close action.",
      Armament: "Weapon and battlefield specialists who rely on training, equipment, tactics, and combat readiness.",
      Magic: "Supernatural specialists who shape encounters through spells, elemental force, healing, conjuration, or occult technique.",
      Tech: "Technical operators who build, hack, repair, pilot, program, and leverage machines or networks.",
      Social: "Influence and investigation specialists who navigate people, factions, deception, diplomacy, and hidden truths."
    };
    return summaries[archetype] ?? "Choose an archetype to focus the available professions.";
  }

  #attributesStep() {
    const budget = attributePointsForLevel(this.state.startingLevel);
    const spent = this.#attributePointCost();
    return `<div class="vr-cc-attribute-budget"><strong>${Math.max(0, budget - spent)} AP available</strong><span>${spent} / ${budget} spent. The starting value of 1 is free; each increase costs its new value in AP.</span></div><div class="vr-cc-attributes">${ATTRIBUTE_GROUPS.map(group => `
      <section>
        <h2>${escape(group.label)}</h2>
        ${group.attributes.map(attribute => {
          const path = `attributes.${group.key}.${attribute}`;
          const value = number(foundry.utils.getProperty(this.state, path));
          const nextCost = value + 1;
          const hint = game.i18n.localize(`VEILRUNNER.AttributeHint.${attribute}`);
          return `<div class="vr-cc-attribute"><span>${escape(game.i18n.localize(`VEILRUNNER.Attribute.${attribute}`))}</span><div class="vr-cc-attribute-value"><button type="button" data-attribute-adjust="${path}" data-direction="-1" ${value <= 1 ? "disabled" : ""}>−</button><input type="number" name="${path}" min="1" step="1" value="${value}" aria-label="${escape(game.i18n.localize(`VEILRUNNER.Attribute.${attribute}`))} value" /><button type="button" data-attribute-adjust="${path}" data-direction="1" ${spent + nextCost > budget ? "disabled" : ""}>+</button></div><small class="vr-cc-attribute-description">${escape(hint)}</small><small class="vr-cc-attribute-cost">Next: ${nextCost} AP</small></div>`;
        }).join("")}
      </section>`).join("")}
    </div>`;
  }

  #qualitiesFlawsStep() {
    const view = this.state.qualityFlawView === "pillar" ? "pillar" : "tier";
    const query = String(this.state.qualityFlawSearch ?? "").trim().toLowerCase();
    const matches = (...values) => !query || values.some(value => String(value).toLowerCase().includes(query));
    const rows = view === "tier"
      ? QUALITY_FLAW_TIERS.map((tier, index) => ({ label: `${tier} — ${index + 1} ${index ? "Points" : "Point"}`, tier, points: index + 1 }))
      : QUALITY_FLAW_PILLARS.map(pillar => ({ label: pillar, tier: "Minor", points: 1, pillar }));
    const visibleRows = rows.filter(row => matches(row.label, "custom perk", "custom flaw"));
    return `<div class="vr-cc-qf-toolbar">
        <label class="vr-cc-qf-search"><i class="fa-solid fa-magnifying-glass"></i><input name="qualityFlawSearch" type="search" value="${escape(this.state.qualityFlawSearch)}" placeholder="Search perks and flaws" aria-label="Search perks and flaws" /></label>
        <button type="button" class="vr-cc-btn" data-action="toggle-qf-view"><i class="fa-solid ${view === "tier" ? "fa-table-cells-large" : "fa-layer-group"}"></i><span>${view === "tier" ? "Pillar Mode" : "Tier Mode"}</span></button>
      </div>
      <div class="vr-cc-qf-grid">
        <div class="vr-cc-qf-column-headings"><h2>Perks</h2><h2>Flaws</h2></div>
        ${visibleRows.length ? visibleRows.map(row => `<section class="vr-cc-qf-tier-row">
          <h3>${escape(row.label)}</h3>
          <div class="vr-cc-qf-tier-options">
            ${this.#qualityFlawChoiceCard("quality", row.tier, row.points, row.pillar)}
            ${this.#qualityFlawChoiceCard("flaw", row.tier, row.points, row.pillar)}
          </div>
        </section>`).join("") : `<p class="vr-cc-qf-empty">No perks or flaws match that search.</p>`}
      </div>`;
  }

  #qualityFlawChoiceCard(kind, tier, points, pillar = "") {
    return `<article class="vr-cc-qf-choice-card ${kind}">
        <span class="vr-cc-qf-choice-icon"><i class="fa-solid ${kind === "quality" ? "fa-sparkles" : "fa-triangle-exclamation"}"></i></span>
        <strong>Custom ${kind === "quality" ? "Perk" : "Flaw"}</strong>
        <button type="button" class="vr-cc-btn" data-action="open-qf-dialog" data-qf-kind="${kind}" data-qf-tier="${tier}" data-qf-points="${points}" ${pillar ? `data-qf-pillar="${pillar}"` : ""}>Select</button>
      </article>`;
  }

  #qualityFlawQuota(audit = this.#qualityFlawAudit()) {
    return `<section class="vr-cc-qf-quota"><strong>Perk & Flaw Quota</strong><span>Perks ${audit.qualityPoints}/10 | Flaws ${audit.flawPoints}/20 minimum | Minor ${audit.minorPoints}/8 | Resolve potential: ${audit.resolvePotential}</span></section>`;
  }

  #qualityFlawTaken(kind, label, entries) {
    return `<section class="vr-cc-qf-taken ${kind}"><h2>${label}</h2><div class="vr-cc-qf-card-list">
      ${entries.length ? entries.map((entry, index) => `<article class="vr-cc-qf-card"><header><span>${escape(entry.tier)}</span><strong>${escape(entry.points)} pts</strong></header><h3>${escape(entry.name)}</h3><small>${escape(entry.pillar)}</small><p>${escape(entry.description || "No description entered.")}</p><button type="button" class="vr-cc-btn" data-action="remove-${kind}" data-index="${index}">Unselect</button></article>`).join("") : `<p class="vr-cc-qf-empty">No ${kind === "quality" ? "perks" : "flaws"} selected yet.</p>`}
    </div></section>`;
  }

  #qualityFlawDialogMarkup() {
    const dialog = this.state.qualityFlawDialog;
    if (!dialog) return "";
    const kindLabel = dialog.kind === "quality" ? "Perk" : "Flaw";
    return `<div class="vr-cc-qf-dialog-backdrop" role="presentation"><section class="vr-cc-qf-dialog" role="dialog" aria-modal="true" aria-label="Custom ${kindLabel}">
      <header><div><span>${escape(dialog.tier)} Tier</span><h2>Custom ${kindLabel}</h2></div><button type="button" class="vr-cc-icon" data-action="cancel-qf-dialog" title="Close"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="vr-cc-qf-dialog-fields">
        <label class="vr-cc-field"><span>Name</span><input name="qualityFlawDialog.name" value="${escape(dialog.name)}" autofocus /></label>
        <label class="vr-cc-field"><span>Pillar</span><select name="qualityFlawDialog.pillar">${QUALITY_FLAW_PILLARS.map(pillar => `<option value="${pillar}" ${pillar === dialog.pillar ? "selected" : ""}>${pillar}</option>`).join("")}</select></label>
        <label class="vr-cc-field"><span>Points</span><input name="qualityFlawDialog.points" type="number" min="1" max="10" value="${Math.max(1, number(dialog.points, 1))}" /></label>
        <label class="vr-cc-field"><span>Description</span><textarea name="qualityFlawDialog.description" rows="5" placeholder="Describe how this ${kindLabel.toLowerCase()} affects play.">${escape(dialog.description)}</textarea></label>
      </div>
      <footer><button type="button" class="vr-cc-btn" data-action="cancel-qf-dialog">Cancel</button><button type="button" class="vr-cc-btn primary" data-action="save-qf-dialog">Add ${kindLabel}</button></footer>
    </section></div>`;
  }

  #qualityFlawAudit() {
    const total = entries => entries.reduce((sum, entry) => sum + Math.max(0, number(entry.points)), 0);
    const qualityPoints = total(this.state.qualitiesTaken ?? []);
    const flawPoints = total(this.state.flawsTaken ?? []);
    const minorPoints = [...(this.state.qualitiesTaken ?? []), ...(this.state.flawsTaken ?? [])]
      .filter(entry => entry.tier === "Minor").reduce((sum, entry) => sum + Math.max(0, number(entry.points)), 0);
    const exceedsPillar = (entries, entry) => total(entries.filter(item => String(item.pillar).trim().toLowerCase() === String(entry.pillar).trim().toLowerCase())) + Math.max(0, number(entry.points)) > 10;
    return { qualityPoints, flawPoints, minorPoints, resolvePotential: Math.floor(flawPoints / 5), exceedsPillar };
  }

  #infoPanelContent(key) {
    const title = STEPS.find(step => step.key === key)?.label ?? "Information";
    const selectedPath = [this.state.archetype, this.state.profession, this.state.discipline].filter(Boolean).join(" / ");
    const generic = {
      species: ["Select Species", "Choose the character's species or lineage. Use the exact table name when the finalized rules text is available."],
      origin: ["Select Origin", "Choose where the character comes from. Origin can later drive baseline persona, contacts, language, and cultural hooks."],
      background: ["Select Background", "Choose the character's pre-adventuring background. This is a likely source for baseline persona and starting proficiencies."],
      talents: ["Talents & Skills", "Open the tree canvas to choose skill and spell branches, then confirm to return those selections to character generation."],
      credits: ["Purchases", "Track remaining credits, credits spent, and purchase notes. Purchases are folded into the character biography on confirm."],
      contacts: ["Contacts", "Create one or more starting contacts. On confirm, these are also mirrored into the sheet's Relationships panel."],
      languages: ["Known Languages", "Enter one language per line or comma separated. The saved list is also included in generated biography notes."],
      bio: ["Biographical Information", "Name, pronouns, age, size, appearance, personality, and history are written into the sheet identity and biography fields."],
      persona: ["Persona Index", "The recommendation combines the selected species, origin, background, and discipline. Apply it, then fine-tune any axis."],
      review: ["Review", "Confirming writes all selections into the Hero actor, marks character generation complete, closes this canvas, and opens the sheet."]
    };

    if (key === "level") {
      const level = number(this.state.startingLevel);
      const choice = LEVEL_OPTIONS.find(option => option.level === level);
      const label = choice ? `Lvl ${choice.level} - ${choice.label}` : level ? `Lvl ${level} - Custom` : "No level selected";
      return `<div class="vr-cc-info-heading"><span>Information</span><h2>Starting Level</h2></div>
        <div class="vr-cc-reference vr-cc-level-info">
          <h3>Level of Play</h3>
          <strong>${escape(label)}</strong>
          <div class="vr-cc-level-description-slot">The character begins at Level 1 and receives the starting points for this level of play. Add the campaign description for this tier here.</div>
          ${level ? `<h3>Attribute Points (AP)</h3><p>${Math.max(0, attributePointsForLevel(level) - this.#attributePointCost())} available. Cumulative pool through Level ${level}: ${attributePointsForLevel(level)} AP; Level ${level} contributes ${attributePointsGainedAtLevel(level)} AP. The 1-point minimum is free; each increase costs its new value in AP.</p>
          <h3>Talent Points (TP)</h3><p>${talentPointsForLevel(level)} available.</p>
          <h3>Skill Points (SP)</h3><p>${skillPointsForLevel(level)} available.</p>` : ""}
        </div>`;
    }

    if (["species", "origin", "background"].includes(key)) {
      const reference = this.#selectedReference(key);
      const modifiers = referenceModifiers(reference);
      const description = String(reference?.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
      const fallbackDescription = key === "species"
        ? "Species currently establishes the character's lineage selection only. Stats and biography details can be added later."
        : key === "origin"
          ? "Origin currently establishes the character's selection only. Literature and other origin details can be added later."
        : key === "background"
          ? "Background currently establishes the character's selection only. Literature and other background details can be added later."
        : `Choose a ${title.toLowerCase()} from the reference library. Its Persona Index modifiers are included in the recommendation.`;
      return `<div class="vr-cc-info-heading"><span>Information</span><h2>${escape(title)}</h2></div>
        <div class="vr-cc-reference"><strong>${escape((reference?.name ?? this.state[key]) || `Select ${title}`)}</strong>
        <p>${escape(description || fallbackDescription)}</p>
        ${modifiers.length ? `<p><b>Persona modifiers:</b> ${escape(modifiers.join(", "))}</p>` : ""}</div>
        <div class="vr-cc-info-summary"><dt>Current</dt><dd>${escape(this.#summaryLine())}</dd></div>`;
    }

    if (key === "profession") {
      return `<div class="vr-cc-info-heading">
        <span>Information</span>
        <h2>Path</h2>
      </div>
      <div class="vr-cc-info-summary">
        <dt>Current</dt><dd>${escape(selectedPath || "No path selected")}</dd>
      </div>
      <div class="vr-cc-reference">${this.#professionReference()}</div>`;
    }

    if (key === "attributes") {
      return `<div class="vr-cc-info-heading">
        <span>Information</span>
        <h2>Attribute Points</h2>
      </div>
      <div class="vr-cc-reference">
        <strong>${Math.max(0, attributePointsForLevel(this.state.startingLevel) - this.#attributePointCost())} AP Available</strong>
        <p>${this.#attributePointCost()} of ${attributePointsForLevel(this.state.startingLevel)} AP spent. The 1-point minimum is free; each increase costs its new value in AP.</p>
      </div>
      <div class="vr-cc-info-summary">
        ${ATTRIBUTE_GROUPS.map(group => `<div><dt>${escape(group.label)}</dt><dd>${group.attributes.reduce((sum, attr) => sum + number(foundry.utils.getProperty(this.state, `attributes.${group.key}.${attr}`)), 0)}</dd></div>`).join("")}
      </div>`;
    }

    if (key === "qualitiesFlaws") {
      return `<div class="vr-cc-info-heading"><span>Selected</span><h2>Perks & Flaws</h2></div>
        <div class="vr-cc-qf-selected">
          ${this.#qualityFlawQuota()}
          <section class="vr-cc-qf-rules"><h3>Rules</h3><ul>
            <li>No more than 8 points toward Minor entries.</li>
            <li>No more than 10 points per pillar: Physical, Social, Magical, or Technical.</li>
            <li>Must take at least 20 points in Flaws.</li>
            <li>Must not exceed 10 points in Perks.</li>
          </ul></section>
          ${this.#qualityFlawTaken("quality", "Selected Perks", this.state.qualitiesTaken)}
          ${this.#qualityFlawTaken("flaw", "Selected Flaws", this.state.flawsTaken)}
        </div>`;
    }

    const [heading, body] = generic[key] ?? [title, "Complete this step, then move forward when ready."];
    return `<div class="vr-cc-info-heading">
      <span>Information</span>
      <h2>${escape(heading)}</h2>
    </div>
    <div class="vr-cc-reference">
      <strong>${escape(title)}</strong>
      <p>${escape(body)}</p>
    </div>
    <div class="vr-cc-info-summary">
      <dt>Current</dt><dd>${escape(this.#summaryLine())}</dd>
    </div>`;
  }

  #talentsAndSkillsStep() {
    const selections = this.state.talentSkillSelections ?? [];
    const talentBudget = talentPointsForLevel(this.state.startingLevel);
    const skillBudget = skillPointsForLevel(this.state.startingLevel);
    const talentSpent = Math.min(talentBudget, Math.max(0, number(this.state.talentPointsSpent)));
    const skillSpent = Math.min(skillBudget, Math.max(0, number(this.state.skillPointsSpent)));
    return `<div class="vr-cc-grid two">
      <section class="vr-cc-tree-launch wide">
        <div>
          <span>Tree Canvas</span>
          <h2>Skill and Spell Trees</h2>
          <p>${escape(selections.length ? selections.join(", ") : "No tree selections confirmed yet.")}</p>
        </div>
        <button type="button" class="vr-cc-btn primary" data-action="open-tree-canvas">
          <i class="fa-solid fa-diagram-project"></i><span>Open Tree Canvas</span>
        </button>
      </section>
      <label class="vr-cc-field tall"><span>Talent and skill notes</span><textarea name="talentSkillNotes" placeholder="Record chosen talents, skill ranks, spell choices, and prerequisites.">${escape(this.state.talentSkillNotes)}</textarea></label>
      <div class="vr-cc-grid two">
        <label class="vr-cc-field"><span>Talent Points (TP) - ${Math.max(0, talentBudget - talentSpent)} available</span><input name="talentPointsSpent" type="number" min="0" max="${talentBudget}" value="${talentSpent}" /></label>
        <label class="vr-cc-field"><span>Skill Points (SP) - ${Math.max(0, skillBudget - skillSpent)} available</span><input name="skillPointsSpent" type="number" min="0" max="${skillBudget}" value="${skillSpent}" /></label>
      </div>
    </div>`;
  }

  #drawTalentSkillCanvas() {
    const selected = new Set(this.state.talentSkillSelections ?? []);
    this.root.innerHTML = `
      <div class="vr-cc-tree-canvas">
        <header class="vr-cc-tree-header">
          <div>
            <span>Character Generation</span>
            <h1>Talents & Skills</h1>
          </div>
          <button type="button" class="vr-cc-icon" data-action="close-tree-canvas" title="Return"><i class="fa-solid fa-arrow-left"></i></button>
        </header>
        <main class="vr-cc-tree-board">
          ${TREE_COLUMNS.map(column => `<section class="vr-cc-tree-column">
            <h2><i class="${column.icon}"></i><span>${escape(column.label)}</span></h2>
            <div class="vr-cc-tree-nodes">
              ${column.nodes.map((node, index) => {
                const value = `${column.label}: ${node}`;
                const active = selected.has(value);
                return `<button type="button" class="vr-cc-tree-node ${active ? "active" : ""}" data-tree-toggle="${escape(value)}">
                  <span>${escape(node)}</span>
                  <small>Tier ${index < 2 ? 1 : index < 4 ? 2 : 3}</small>
                </button>`;
              }).join("")}
            </div>
          </section>`).join("")}
        </main>
        <footer class="vr-cc-tree-footer">
          <div>${selected.size} selected</div>
          <button type="button" class="vr-cc-btn primary" data-action="confirm-tree-canvas"><i class="fa-solid fa-check"></i><span>Confirm Selections</span></button>
        </footer>
      </div>`;
  }

  #creditsStep() {
    return `<div class="vr-cc-grid two">
      <label class="vr-cc-field"><span>Purchase Budget Remaining</span><input name="credits" type="number" min="0" value="${escape(this.state.credits)}" /></label>
      <label class="vr-cc-field"><span>Purchase Budget Spent</span><input name="creditsSpent" type="number" min="0" value="${escape(this.state.creditsSpent)}" /></label>
      <label class="vr-cc-field tall wide"><span>Purchases</span><textarea name="purchases" placeholder="Weapons, armor, gear, services, or campaign-specific purchases.">${escape(this.state.purchases)}</textarea></label>
    </div>`;
  }

  #contactsStep() {
    const contacts = this.state.contacts.length ? this.state.contacts : [{ name: "", role: "", disposition: "", notes: "" }];
    return `<div class="vr-cc-list">
      ${contacts.map((contact, i) => `<article class="vr-cc-contact">
        <label><span>Name</span><input name="contacts.${i}.name" value="${escape(contact.name)}" /></label>
        <label><span>Role</span><input name="contacts.${i}.role" value="${escape(contact.role)}" /></label>
        <label><span>Disposition</span><input name="contacts.${i}.disposition" value="${escape(contact.disposition)}" /></label>
        <label><span>Notes</span><input name="contacts.${i}.notes" value="${escape(contact.notes)}" /></label>
      </article>`).join("")}
      <button type="button" class="vr-cc-btn" data-action="add-contact"><i class="fa-solid fa-plus"></i><span>Add Contact</span></button>
    </div>`;
  }

  #bioStep() {
    return `<div class="vr-cc-bio-sections">
      <section><h2>Identity</h2><div class="vr-cc-grid two">
        ${this.#field("name", "Character Name")}${this.#field("pronouns", "Pronouns")}${this.#field("age", "Age")}${this.#field("size", "Size")}
        ${this.#textareaOnly("appearance", "Appearance", "Visual details, style, notable gear.")}${this.#textareaOnly("personality", "Personality", "Mannerisms, values, first impressions.")}${this.#textareaOnly("history", "History", "Important past events and current motives.")}
      </div></section>
      <section><h2>Contacts</h2>${this.#contactsStep()}</section>
      <section><h2>Known Languages</h2>${this.#textareaOnly("languages", "Languages", "One language per line, or comma separated.")}</section>
      <section><h2>Persona Index</h2>${this.#personaStep()}</section>
    </div>`;
  }

  #personaStep() {
    const recommendation = this.#personaRecommendation();
    const sourceList = recommendation.sources.length
      ? recommendation.sources.map(source => `${source.label}: ${source.modifiers.join(", ")}`).join(" | ")
      : "Choose a reference-backed species, origin, background, or discipline to build a recommendation.";
    return `<div class="vr-cc-persona">
      <section class="vr-cc-persona-recommendation"><div><span>Recommended Persona Index</span><p>${escape(sourceList)}</p></div><button type="button" class="vr-cc-btn" data-action="apply-persona-recommendation">Use recommendation</button></section>
      ${PERSONA_AXES.map(axis => {
      const value = clampPersona(this.state.personaIndex[axis.key]);
      const suggested = recommendation.values[axis.key];
      return `<label class="vr-cc-axis">
        <span>${escape(axis.left)}</span>
        <input name="personaIndex.${axis.key}" type="range" min="-100" max="100" value="${value}" />
        <span>${escape(axis.right)}</span>
        <input name="personaIndex.${axis.key}" type="number" min="-100" max="100" value="${value}" />
        <small>Recommended: ${suggested > 0 ? "+" : ""}${suggested}</small>
      </label>`;
    }).join("")}</div>`;
  }

  #personaRecommendation() {
    const sources = [];
    for (const key of ["species", "origin", "background"]) {
      const reference = this.#selectedReference(key);
      const modifiers = referenceModifiers(reference);
      if (modifiers.length) sources.push({ label: reference.name, modifiers });
    }
    const disciplineModifiers = VEILRUNNER_PERSONA_INDEX_MODIFIERS[`${this.state.profession}:${this.state.discipline}`] ?? [];
    if (disciplineModifiers.length) sources.push({ label: this.state.discipline, modifiers: disciplineModifiers });
    const values = Object.fromEntries(PERSONA_AXES.map(axis => [axis.key, 0]));
    for (const source of sources) {
      const deltas = personaModifierDeltas(source.modifiers);
      for (const axis of PERSONA_AXES) values[axis.key] = clampPersona(values[axis.key] + deltas[axis.key]);
    }
    return { sources, values };
  }

  #reviewStep() {
    const rows = [
      ["Starting Level", this.state.startingLevel || "Not selected"],
      ["Species", this.state.species],
      ["Origin", this.state.origin],
      ["Background", this.state.background],
      ["Path", [this.state.archetype, this.state.profession, this.state.discipline].filter(Boolean).join(" / ")],
      ["Attribute Points", `${this.#attributePointCost()} / ${attributePointsForLevel(this.state.startingLevel)}`],
      ["Talents & Skills", this.state.talentSkillPointsSpent],
      ["Tree Selections", this.state.talentSkillSelections?.join(", ")],
      ["Purchase Budget Remaining", this.state.credits],
      ["Contacts", this.#cleanContacts().length],
      ["Languages", listFromText(this.state.languages).join(", ")],
      ["Name", this.state.name]
    ];
    return `<div class="vr-cc-review">${rows.map(([label, value]) => `
      <div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>
    `).join("")}</div>`;
  }

  #summaryLine() {
    return [this.state.species, this.state.origin, this.state.profession, this.state.discipline].filter(Boolean).join(" | ") || "Selections are saved when you confirm.";
  }

  #attributePointTotal() {
    let total = 0;
    for (const group of ATTRIBUTE_GROUPS) {
      for (const attribute of group.attributes) total += number(foundry.utils.getProperty(this.state, `attributes.${group.key}.${attribute}`));
    }
    return total;
  }

  #attributePointCost() {
    let total = 0;
    for (const group of ATTRIBUTE_GROUPS) {
      for (const attribute of group.attributes) {
        const value = Math.max(1, number(foundry.utils.getProperty(this.state, `attributes.${group.key}.${attribute}`)));
        total += this.#attributeValueCost(value);
      }
    }
    return total;
  }

  #attributeValueCost(value) {
    const safeValue = Math.max(1, Math.floor(number(value, 1)));
    return ((safeValue * (safeValue + 1)) / 2) - 1;
  }

  #clampAttributeValuesToBudget() {
    const budget = attributePointsForLevel(this.state.startingLevel);
    for (const group of ATTRIBUTE_GROUPS) {
      for (const attribute of group.attributes) {
        const path = `attributes.${group.key}.${attribute}`;
        const requested = Math.max(1, Math.floor(number(foundry.utils.getProperty(this.state, path), 1)));
        const spentWithoutCurrent = this.#attributePointCost() - this.#attributeValueCost(requested);
        let maximum = 1;
        while (spentWithoutCurrent + this.#attributeValueCost(maximum + 1) <= budget) maximum += 1;
        this.#setStateValue(path, Math.min(requested, maximum));
      }
    }
  }

  #cleanContacts() {
    return (this.state.contacts ?? []).filter(contact =>
      contact?.name || contact?.role || contact?.disposition || contact?.notes
    ).map(contact => ({
      name: contact.name ?? "",
      role: contact.role ?? "",
      disposition: contact.disposition ?? "",
      notes: contact.notes ?? ""
    }));
  }

  async #onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (Object.hasOwn(button.dataset, "step")) {
      this.#saveVisibleInputs();
      const steps = this.#steps;
      if (number(button.dataset.step) > 0 && !this.#hasStartingLevel()) {
        ui.notifications.warn("Choose a starting level before continuing character generation.");
        return;
      }
      if (steps[this.step]?.key === "level" && number(button.dataset.step) > this.step) await this.#applyStartingLevel();
      this.step = number(button.dataset.step);
      this.#draw();
      return;
    }
    if (button.dataset.pathChoice) {
      if (this.pathTransitioning) return;
      this.#choosePath(button.dataset.pathChoice, button.dataset.value ?? "");
      return;
    }
    if (button.dataset.treeToggle) {
      this.#toggleTreeSelection(button.dataset.treeToggle);
      return;
    }
    if (action === "cancel") {
      this.close({ renderSheet: true });
      return;
    }
    if (action === "open-tree-canvas") {
      this.#saveVisibleInputs();
      this.treeCanvasOpen = true;
      this.#draw();
      return;
    }
    if (action === "close-tree-canvas" || action === "confirm-tree-canvas") {
      this.treeCanvasOpen = false;
      this.#draw();
      return;
    }
    if (action === "previous" || action === "next") {
      this.#saveVisibleInputs();
      const steps = this.#steps;
      if (action === "next" && steps[this.step]?.key === "level" && !this.#hasStartingLevel()) {
        ui.notifications.warn("Choose a starting level before continuing character generation.");
        return;
      }
      if (action === "next" && steps[this.step]?.key === "level") await this.#applyStartingLevel();
      this.step = Math.max(0, Math.min(steps.length - 1, this.step + (action === "next" ? 1 : -1)));
      this.#draw();
      return;
    }
    if (action === "add-contact") {
      this.#saveVisibleInputs();
      this.state.contacts.push({ name: "", role: "", disposition: "", notes: "" });
      this.#draw();
      return;
    }
    if (action === "open-qf-dialog") {
      this.#saveVisibleInputs();
      const kind = button.dataset.qfKind === "flaw" ? "flaw" : "quality";
      const tier = QUALITY_FLAW_TIERS.includes(button.dataset.qfTier) ? button.dataset.qfTier : "Minor";
      const pillar = QUALITY_FLAW_PILLARS.includes(button.dataset.qfPillar) ? button.dataset.qfPillar : "Physical";
      this.state.qualityFlawDialog = { kind, tier, name: "", pillar, points: Math.max(1, number(button.dataset.qfPoints, 1)), description: "" };
      this.#draw();
      return;
    }
    if (action === "toggle-qf-view") {
      this.state.qualityFlawView = this.state.qualityFlawView === "tier" ? "pillar" : "tier";
      this.#draw();
      return;
    }
    if (action === "cancel-qf-dialog") {
      this.state.qualityFlawDialog = null;
      this.#draw();
      return;
    }
    if (action === "save-qf-dialog") {
      this.#saveVisibleInputs();
      const source = this.state.qualityFlawDialog;
      if (!source) return;
      const kind = source.kind === "flaw" ? "flaw" : "quality";
      const entry = { name: String(source.name ?? "").trim(), pillar: QUALITY_FLAW_PILLARS.includes(source.pillar) ? source.pillar : "Physical", tier: QUALITY_FLAW_TIERS.includes(source.tier) ? source.tier : "Minor", points: Math.max(1, number(source.points, 1)), description: String(source.description ?? "").trim() };
      if (!entry.name) return ui.notifications.warn(`Enter a ${kind === "quality" ? "perk" : "flaw"} name first.`);
      const audit = this.#qualityFlawAudit();
      const entries = kind === "quality" ? this.state.qualitiesTaken : this.state.flawsTaken;
      if (kind === "quality" && audit.qualityPoints + entry.points > 10) return ui.notifications.warn("Perks cannot exceed 10 points.");
      if (entry.tier === "Minor" && audit.minorPoints + entry.points > 8) return ui.notifications.warn("Minor entries cannot exceed 8 total points.");
      if (audit.exceedsPillar(entries, entry)) return ui.notifications.warn("A pillar cannot exceed 10 points.");
      entries.push(entry);
      this.state.qualityFlawDialog = null;
      this.#draw();
      return;
    }
    if (action === "remove-quality" || action === "remove-flaw") {
      const entries = action === "remove-quality" ? this.state.qualitiesTaken : this.state.flawsTaken;
      entries.splice(number(button.dataset.index), 1);
      this.#draw();
      return;
    }
    if (button.dataset.referenceChoicePath) {
      const path = button.dataset.referenceChoicePath;
      const value = button.dataset.referenceChoiceValue ?? "";
      this.state[path] = this.state[path] === value ? "" : value;
      this.#draw();
      return;
    }
    if (button.dataset.levelChoice) {
      this.state.startingLevel = number(button.dataset.levelChoice, 1);
      this.#draw();
      return;
    }
    if (button.dataset.attributeAdjust) {
      const path = button.dataset.attributeAdjust;
      const direction = number(button.dataset.direction);
      const value = Math.max(0, number(foundry.utils.getProperty(this.state, path)));
      const nextCost = value + 1;
      if (direction > 0 && this.#attributePointCost() + nextCost > attributePointsForLevel(this.state.startingLevel)) return;
      this.#setStateValue(path, Math.max(1, value + direction));
      this.#draw();
      return;
    }
    if (action === "apply-persona-recommendation") {
      this.#saveVisibleInputs();
      this.state.personaIndex = this.#personaRecommendation().values;
      this.#draw();
      return;
    }
    if (action === "confirm") this.#confirm();
  }

  #choosePath(path, value) {
    this.#saveVisibleInputs();
    if (path === "archetype") {
      const nextArchetype = this.state.archetype === value ? "" : value;
      const hasDownstreamPath = Boolean(this.state.profession || this.state.discipline);
      if (hasDownstreamPath && nextArchetype !== this.state.archetype) {
        this.#fadePathGroups(["profession", "discipline"], () => {
          this.state.archetype = nextArchetype;
          this.state.profession = "";
          this.state.discipline = "";
        });
        return;
      }
      this.state.archetype = nextArchetype;
      this.state.profession = "";
      this.state.discipline = "";
    } else if (path === "profession") {
      const nextProfession = this.state.profession === value ? "" : value;
      if (this.state.discipline && nextProfession !== this.state.profession) {
        this.#fadePathGroups(["discipline"], () => {
          this.state.profession = nextProfession;
          this.state.discipline = "";
        });
        return;
      }
      this.state.profession = nextProfession;
      this.state.discipline = "";
    } else if (path === "discipline") {
      this.state.discipline = this.state.discipline === value ? "" : value;
    }
    this.#draw();
  }

  #fadePathGroups(groups, applyState) {
    const columns = groups
      .map(group => this.root.querySelector(`[data-path-group="${group}"]`))
      .filter(Boolean);
    if (!columns.length) {
      applyState();
      this.#draw();
      return;
    }
    this.pathTransitioning = true;
    for (const column of columns) column.classList.add("fading");
    window.setTimeout(() => {
      applyState();
      this.pathTransitioning = false;
      this.#draw();
    }, 280);
  }

  #toggleTreeSelection(value) {
    const selections = new Set(this.state.talentSkillSelections ?? []);
    if (selections.has(value)) selections.delete(value);
    else selections.add(value);
    this.state.talentSkillSelections = Array.from(selections).sort();
    this.#draw();
  }

  #onInput(event) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) return;
    this.#setStateValue(input.name, input.type === "number" || input.type === "range" ? number(input.value) : input.value);
    if (input.name === "startingLevel") {
      if (event.type === "change") this.#draw();
      else this.#refreshInfoPanel();
      return;
    }
    if (input.name === "qualityFlawSearch") {
      if (event.type === "input") {
        const caret = input.selectionStart ?? String(input.value).length;
        this.#draw();
        const searchInput = this.root.querySelector('input[name="qualityFlawSearch"]');
        searchInput?.focus();
        searchInput?.setSelectionRange?.(caret, caret);
      }
      return;
    }
    if (input.name.startsWith("attributes.")) {
      if (event.type === "change") {
        this.#clampAttributeValuesToBudget();
        this.#draw();
      } else this.#refreshInfoPanel();
      return;
    }
    if (input.name.startsWith("personaIndex.")) {
      const value = clampPersona(input.value);
      this.#setStateValue(input.name, value);
      for (const field of this.root.querySelectorAll(`[name="${input.name}"]`)) field.value = value;
    }
    if (["archetype", "profession"].includes(input.name)) {
      if (input.name === "archetype") {
        this.state.profession = "";
        this.state.discipline = "";
      } else this.state.discipline = "";
      this.#draw();
    } else {
      this.#refreshInfoPanel();
    }
  }

  #saveVisibleInputs() {
    for (const input of this.root.querySelectorAll("input, textarea, select")) {
      if (input.name === "startingLevel" && !String(input.value ?? "").trim()) continue;
      this.#setStateValue(input.name, input.type === "number" || input.type === "range" ? number(input.value) : input.value);
    }
    this.#clampAttributeValuesToBudget();
  }

  #setStateValue(path, value) {
    if (!path) return;
    foundry.utils.setProperty(this.state, path, value);
  }

  async #confirm() {
    this.#saveVisibleInputs();
    const qualityFlawAudit = this.#qualityFlawAudit();
    if (qualityFlawAudit.qualityPoints > 10 || qualityFlawAudit.minorPoints > 8 || qualityFlawAudit.flawPoints < 20) {
      ui.notifications.warn("Meet the Perk & Flaw Quota before confirming: perks max 10, minor max 8, flaws minimum 20.");
      return;
    }
    const name = String(this.state.name ?? "").trim() || this.actor.name;
    const contacts = this.#cleanContacts();
    const level = Math.max(1, number(this.state.startingLevel, 1));
    const attributeBudget = attributePointsForLevel(level);
    const talentBudget = talentPointsForLevel(level);
    const skillBudget = skillPointsForLevel(level);
    const attributeSpent = this.#attributePointCost();
    const talentSpent = Math.min(talentBudget, Math.max(0, number(this.state.talentPointsSpent)));
    const skillSpent = Math.min(skillBudget, Math.max(0, number(this.state.skillPointsSpent)));
    const update = {
      name,
      "system.level": level,
      "system.experience.max": xpForLevel(level),
      "system.species": this.state.species,
      "system.origin": this.state.origin,
      "system.background": this.state.background,
      "system.archetype": normalizeArchetype(this.state.archetype),
      "system.profession": this.state.profession,
      "system.discipline": this.state.discipline,
      "system.attributes": this.state.attributes,
      "system.pronouns": this.state.pronouns,
      "system.age": this.state.age,
      "system.size": this.state.size,
      "system.credits": Math.max(0, number(this.state.credits)),
      "system.knownLanguages": listFromText(this.state.languages),
      "system.contacts": contacts,
      "system.qualitiesTaken": this.state.qualitiesTaken,
      "system.flawsTaken": this.state.flawsTaken,
      "system.relationships": contacts.map(contact => ({
        name: contact.name,
        img: null,
        status: contact.disposition || contact.role,
        value: 0
      })),
      "system.biography": biographyHtml(this.state),
      "system.personaIndex.criminalLawful": number(this.state.personaIndex.criminalLawful),
      "system.personaIndex.ruthlessEmpathy": number(this.state.personaIndex.ruthlessEmpathy),
      "system.personaIndex.individualCollectivist": number(this.state.personaIndex.individualCollectivist),
      "system.attributePoints.total": attributeBudget,
      "system.attributePoints.available": Math.max(0, attributeBudget - attributeSpent),
      "system.talentPoints.total": talentBudget,
      "system.talentPoints.available": Math.max(0, talentBudget - talentSpent),
      "system.skillPoints.total": skillBudget,
      "system.skillPoints.available": Math.max(0, skillBudget - skillSpent),
      "system.characterGeneration.complete": true,
      "system.characterGeneration.startingLevel": level,
      "system.characterGeneration.attributePointsSpent": attributeSpent,
      "system.characterGeneration.talentSkillPointsSpent": talentSpent + skillSpent,
      "system.characterGeneration.talentSkillSelections": this.state.talentSkillSelections ?? [],
      "system.characterGeneration.talentPointsSpent": talentSpent,
      "system.characterGeneration.skillPointsSpent": skillSpent,
      "system.characterGeneration.spellPointsSpent": 0,
      "system.characterGeneration.creditsSpent": Math.max(0, number(this.state.creditsSpent)),
      "system.characterGeneration.notes": [
        this.state.talentSkillNotes && `Talents & Skills:\n${this.state.talentSkillNotes}`,
        this.state.talentSkillSelections?.length && `Tree Selections:\n${this.state.talentSkillSelections.join(", ")}`,
        this.state.purchases && `Purchases:\n${this.state.purchases}`
      ].filter(Boolean).join("\n\n")
    };
    await this.actor.update(update);
    ui.notifications.info(`${name} character generation complete.`);
    this.close({ renderSheet: true });
  }
}

function actorSheetClose(actor) {
  try {
    if (actor.sheet?.rendered) actor.sheet.close();
  } catch (err) {
    console.warn("Veilrunner | Could not close hero sheet before character generation.", err);
  }
}
