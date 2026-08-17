import { VEILRUNNER_PERSONA_INDEX_MODIFIERS, VEILRUNNER_PROFESSIONS } from "../data/professions.mjs";
import { attributePointsForLevel, attributePointsGainedAtLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { xpForLevel } from "../data/xp.mjs";
import { applyHeroLevelUp } from "../data/level-up.mjs";
import { talentTreeCatalog, talentTreePage, talentTreeRoot, saveTalentTreeCatalog, skillPointCostForLevel } from "../data/talent-tree.mjs";
import { VEILRUNNER_STARTER_STORE } from "../data/starter-store.mjs";

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
  { key: "talents", label: "Talents & Skills", icon: "fa-solid fa-diagram-project" },
  { key: "qualitiesFlaws", label: "Perks & Flaws", icon: "fa-solid fa-scale-balanced" },
  { key: "contacts", label: "Contacts", icon: "fa-solid fa-address-book" },
  { key: "languages", label: "Languages", icon: "fa-solid fa-language" },
  { key: "persona", label: "Persona Index", icon: "fa-solid fa-sliders" },
  { key: "credits", label: "Purchases", icon: "fa-solid fa-cart-shopping" },
  { key: "bio", label: "Biography", icon: "fa-solid fa-book-open" },
  { key: "review", label: "Review", icon: "fa-solid fa-circle-check" }
];
const STEP_GROUPS = Object.freeze([
  { label: "Level of Play", keys: ["level"] },
  { label: "Identity", keys: ["species", "origin", "background"] },
  { label: "Build", keys: ["profession", "attributes", "talents", "qualitiesFlaws"] },
  { label: "Details", keys: ["contacts", "languages", "persona", "credits", "bio"] },
  { label: "Review", keys: ["review"] }
]);
const LEVEL_UP_STEP_KEYS = Object.freeze(["attributes", "talents", "qualitiesFlaws", "review"]);
const existingCreators = new Map();
const UNSAFE_PROPERTY_PATH_SEGMENT = /(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$)/i;

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

function isSafePropertyPath(path) {
  return typeof path === "string" && path.length > 0 && !UNSAFE_PROPERTY_PATH_SEGMENT.test(path);
}

function listFromText(value) {
  return String(value ?? "").split(/[\n,]/).map(entry => entry.trim()).filter(Boolean);
}

function treeRequirement(value) {
  if (value && typeof value === "object") return { id: String(value.id ?? "").trim(), level: Math.max(1, number(value.level, 1)), line: value.line && typeof value.line === "object" ? foundry.utils.deepClone(value.line) : {} };
  const [id, level] = String(value ?? "").split(":").map(entry => entry.trim());
  return { id, level: Math.max(1, number(level, 1)), line: {} };
}

function treeRequirementsFromText(value) {
  return listFromText(value).map(treeRequirement).filter(entry => entry.id);
}

function treeRequirementsText(values) {
  return (values ?? []).map(value => { const requirement = treeRequirement(value); return requirement.level > 1 ? `${requirement.id}:${requirement.level}` : requirement.id; }).join(", ");
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
    talentTree: foundry.utils.deepClone(system.talentTree ?? { branches: [], leaves: [] }),
    qualityFlawDialog: null,
    contactFocus: 0,
    qualityFlawSearch: "",
    qualityFlawTypeFilter: "all",
    qualityFlawPillarFilter: "all",
    qualityFlawTierFilter: "all",
    qualityFlawFocus: { kind: "quality", tier: "Minor", points: 1, pillar: "Physical" },
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
    personaIndex: foundry.utils.deepClone(system.personaIndex ?? {}),
    // Existing characters retain their authored Persona values; new creation
    // previews the evolving recommendation until a player edits it.
    personaTouched: Object.values(system.personaIndex ?? {}).some(value => number(value) !== 0)
  };
}

export function registerCharacterCreation() {
  Hooks.on("createActor", (actor, options, userId) => {
    if (actor.type !== "hero" || userId !== game.user?.id) return;
    window.setTimeout(() => openCharacterCreation(actor), 100);
  });
}

export function openCharacterCreation(actor, { mode = "creation" } = {}) {
  const existing = existingCreators.get(actor.id);
  if (existing) {
    existing.bringToFront();
    return existing;
  }
  const creator = new CharacterCreationOverlay(actor, { mode });
  existingCreators.set(actor.id, creator);
  creator.render();
  return creator;
}

class CharacterCreationOverlay {
  constructor(actor, { mode = "creation" } = {}) {
    this.actor = actor;
    this.mode = mode === "levelUp" ? "levelUp" : "creation";
    this.step = 0;
    this.treeCanvasOpen = false;
    this.treePage = "magic";
    this.pathTransitioning = false;
    this.openTreeGroups = new Set();
    this.animateNavigation = false;
    this.authorNode = null;
    this.traitEditorOpen = false;
    this.treeZoom = 1;
    this.treePan = null;
    this.treeViewport = {};
    this.treeViewportInitialized = {};
    this.treeCanvasDimensions = { skills: { width: 10000, height: 6000 }, magic: { width: 10000, height: 6000 } };
    this.treeUndoStack = [];
    this.openPracticeId = null;
    this.treeNodeDrag = null;
    this.nodeMoveMode = false;
    this.selectedTreeNodes = new Set();
    this.treeRingTool = { active: false, radius: 500, rotation: -90 };
    this.connectionDrag = null;
    this.suppressTreeClick = false;
    this.connectionTool = { active: false, source: null, operation: "connect", requiredLevel: 1, bend: 0, thickness: 2, sourceAnchor: "auto", targetAnchor: "auto", pattern: "solid", glow: 1, color: "" };
    this.state = defaultState(actor);
    this.initialTalentTree = foundry.utils.deepClone(this.state.talentTree);
    if (this.mode === "levelUp") {
      this.state.startingLevel = Math.max(1, number(actor.system?.level, 1) + 1);
      this.state.startingLevelLocked = true;
    }
    this.referenceOptions = Object.fromEntries(Object.keys(REFERENCE_PACKS).map(key => [key, []]));
    this.root = document.createElement("div");
    this.root.className = "veilrunner vr-character-creation";
    this.root.tabIndex = -1;
  }

  get #steps() {
    if (this.mode === "levelUp") return STEPS.filter(step => LEVEL_UP_STEP_KEYS.includes(step.key));
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
    this.root.addEventListener("contextmenu", event => this.#onTreeContextMenu(event));
    this.root.addEventListener("pointerdown", event => this.#onTreePanStart(event));
    this.root.addEventListener("pointermove", event => this.#onTreePanMove(event));
    this.root.addEventListener("pointerup", event => this.#onTreePanEnd(event));
    this.root.addEventListener("wheel", event => this.#onTreeWheel(event), { passive: false });
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
    const previousTreeBoard = this.root.querySelector?.(".vr-cc-tree-board");
    if (previousTreeBoard) {
      const previousKey = previousTreeBoard.dataset.viewportKey ?? (previousTreeBoard.closest(".vr-cc-talent-canvas")?.classList.contains("magic") ? "magic:main" : "skills:main");
      this.treeViewport[previousKey] = { left: previousTreeBoard.scrollLeft, top: previousTreeBoard.scrollTop };
    }
    const steps = this.#steps;
    const current = steps[this.step];
    if (current?.key === "persona" && !this.state.personaTouched) this.state.personaIndex = this.#personaRecommendation().values;
    this.root.classList.toggle("vr-cc-review-mode", current?.key === "review");
    this.root.classList.toggle("vr-cc-talent-mode", current?.key === "talents");
    this.root.innerHTML = `
      <div class="vr-cc-shell">
        <aside class="vr-cc-rail">
          <div class="vr-cc-brand">
            <span>Veilrunner</span>
            <strong>Character Generation</strong>
          </div>
          <nav class="vr-cc-steps">${this.#treeNavigation(steps)}</nav>
          <footer class="vr-cc-progress"><span>Character Generation</span><strong>${this.step + 1} / ${steps.length}</strong><progress max="${steps.length}" value="${this.step + 1}"></progress></footer>
        </aside>
        <main class="vr-cc-main">
          ${current.key === "talents" ? this.#talentHeader(current, steps.length) : `<header class="vr-cc-header"><div><span>Step ${this.step + 1} of ${steps.length}</span><h1>${escape(current.label)}</h1></div></header>`}
          <section class="vr-cc-panel">${this.#stepContent(current.key)}</section>
        </main>
        ${current.key === "talents" ? "" : `<aside class="vr-cc-info">${this.#infoPanelContent(current.key)}</aside>`}
        <footer class="vr-cc-footer vr-cc-flow-footer">
          <button type="button" class="vr-cc-btn" data-action="previous" ${this.step === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-left"></i><span>Back</span></button>
          <div class="vr-cc-footer-status">${escape(this.#summaryLine())}</div>
          ${this.step === steps.length - 1
            ? `<button type="button" class="vr-cc-btn primary" data-action="confirm"><i class="fa-solid fa-check"></i><span>Confirm</span></button>`
            : `<button type="button" class="vr-cc-btn primary" data-action="next"><span>Next</span><i class="fa-solid fa-arrow-right"></i></button>`}
        </footer>
        ${current.key === "review" ? "" : `<aside class="vr-cc-live-build">${this.#liveBuild()}</aside>`}
      </div>
      ${this.#qualityFlawDialogMarkup()}`;
    this.#decorateTreeNodeEditor();
    this.#decorateTreeShapes();
    this.#decorateTreeLineCrossings();
    this.#decorateTreeRingPreview();
    this.#decorateConnectionToolbar();
    this.#decorateConnectionSockets();
    this.#restoreTreeViewport();
    this.animateNavigation = false;
  }

  #decorateTreeNodeEditor() {
    const grid = this.root.querySelector(".vr-cc-author-grid");
    if (!grid || !this.authorNode || grid.querySelector('[name="authorNode.shape"]')) return;
    const label = document.createElement("label");
    label.textContent = "Shape";
    const select = document.createElement("select");
    select.name = "authorNode.shape";
    for (const shape of ["circle", "hex", "pentagon", "square", "diamond"]) {
      const option = document.createElement("option");
      option.value = shape;
      option.textContent = shape[0].toUpperCase() + shape.slice(1);
      option.selected = this.authorNode.shape === shape;
      select.append(option);
    }
    label.append(select);
    grid.insertBefore(label, grid.children[1] ?? null);
  }

  #decorateTreeShapes() {
    const apply = (element, shape) => element?.classList.add(`shape-${["circle", "hex", "pentagon", "square", "diamond"].includes(shape) ? shape : "diamond"}`);
    const root = this.root.querySelector("[data-tree-root]");
    if (root) apply(root, talentTreeRoot(this.treePage)?.shape ?? "hex");
    for (const element of this.root.querySelectorAll("[data-tree-school]")) apply(element, this.#treeCatalogEntry(element.dataset.treeSchool, "school")?.school?.shape ?? "pentagon");
    for (const element of this.root.querySelectorAll("[data-tree-practice-card]")) apply(element, this.#treeCatalogEntry(element.dataset.treePracticeCard, "practice")?.practice?.shape ?? "diamond");
    for (const element of this.root.querySelectorAll("[data-tree-rank]")) {
      const spell = this.#treeCatalogEntry(element.dataset.treeRank, "spell")?.spell;
      apply(element, spell?.shape ?? (spell?.type === "ability" ? "hex" : "diamond"));
    }
    const world = this.root.querySelector(".vr-cc-tree-world");
    for (const element of this.root.querySelectorAll("[data-tree-drag]")) element.draggable = false;
    for (const element of this.root.querySelectorAll("[data-tree-drag]")) {
      const selected = this.selectedTreeNodes.has(element.dataset.treeDrag);
      element.classList.toggle("multi-selected", selected);
      if (selected && world) this.#addTreeSelectionMarker(element, world);
    }
    world?.classList.toggle("node-move-mode", this.nodeMoveMode);
  }

  #addTreeSelectionMarker(element, world) {
    if ([...world.querySelectorAll(".vr-cc-node-selection-marker")].some(marker => marker.dataset.selectionKey === element.dataset.treeDrag)) return;
    const marker = document.createElement("span");
    marker.className = `vr-cc-node-selection-marker ${element.dataset.treeRank ? "spell" : element.dataset.treeRoot ? "root" : "standard"}`;
    marker.dataset.selectionKey = element.dataset.treeDrag;
    marker.style.left = element.style.left;
    marker.style.top = element.style.top;
    marker.innerHTML = `<i></i><b>Selected</b>`;
    world.append(marker);
  }

  #decorateTreeLineCrossings() {
    for (const path of this.root.querySelectorAll(".vr-cc-tree-links > .vr-cc-tree-link:not(.connection-preview):not(.crossing-casing)")) {
      const casing = path.cloneNode(false);
      casing.classList.add("crossing-casing");
      casing.setAttribute("aria-hidden", "true");
      path.before(casing);
    }
  }

  #decorateTreeRingPreview() {
    const world = this.root.querySelector(".vr-cc-tree-world");
    const svg = world?.querySelector(".vr-cc-tree-links");
    svg?.querySelector(".vr-cc-ring-preview")?.remove();
    if (!this.nodeMoveMode || !this.treeRingTool.active || this.openPracticeId || !svg) return;
    const records = this.#ringSelectionRecords(talentTreeCatalog());
    if (records.length < 2) return;
    const root = talentTreeRoot(this.treePage);
    if (!root) return;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.classList.add("vr-cc-ring-preview");
    const radius = Math.max(180, Math.min(3000, number(this.treeRingTool.radius, 500)));
    const rotation = number(this.treeRingTool.rotation, -90) * Math.PI / 180;
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    ring.setAttribute("cx", number(root.x));
    ring.setAttribute("cy", number(root.y));
    ring.setAttribute("r", radius);
    ring.classList.add("vr-cc-ring-guide");
    group.append(ring);
    records.forEach((record, index) => {
      const angle = rotation + index * Math.PI * 2 / records.length;
      const x = number(root.x) + Math.cos(angle) * radius;
      const y = number(root.y) + Math.sin(angle) * radius;
      const spoke = document.createElementNS("http://www.w3.org/2000/svg", "line");
      spoke.setAttribute("x1", number(root.x));
      spoke.setAttribute("y1", number(root.y));
      spoke.setAttribute("x2", x);
      spoke.setAttribute("y2", y);
      spoke.classList.add("vr-cc-ring-spoke");
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", x);
      marker.setAttribute("cy", y);
      marker.setAttribute("r", 12);
      marker.classList.add("vr-cc-ring-marker");
      group.append(spoke, marker);
    });
    svg.append(group);
  }

  #decorateConnectionToolbar() {
    const toolbar = this.root.querySelector(".vr-cc-connection-toolbar");
    if (!toolbar || toolbar.querySelector('[name="connectionTool.requiredLevel"]')) return;
    const label = document.createElement("label");
    label.textContent = "Required source level";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "1";
    input.max = "20";
    input.name = "connectionTool.requiredLevel";
    input.value = String(Math.max(1, Math.min(20, number(this.connectionTool.requiredLevel, 1))));
    label.append(input);
    toolbar.insertBefore(label, toolbar.children[2] ?? null);
  }

  #decorateConnectionSockets() {
    if (!this.connectionTool.active) return;
    const world = this.root.querySelector(".vr-cc-tree-world");
    if (!world) return;
    for (const node of this.root.querySelectorAll("[data-tree-root], [data-tree-school], [data-tree-practice-card], [data-tree-rank]")) {
      const layer = document.createElement("span");
      layer.className = "vr-cc-node-socket-layer";
      for (const key of ["treeRoot", "treeSchool", "treePracticeCard", "treeRank"]) if (node.dataset[key]) layer.dataset[key] = node.dataset[key];
      const isSpell = Boolean(node.dataset.treeRank);
      const width = isSpell ? 46 : node.offsetWidth;
      const height = isSpell ? 46 : node.offsetHeight;
      layer.style.left = `${node.offsetLeft - width / 2}px`;
      layer.style.top = `${node.offsetTop - height / 2}px`;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
      for (const socket of ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"]) {
        const point = document.createElement("i");
        point.className = `vr-cc-node-socket socket-${socket}`;
        point.dataset.treeSocket = socket;
        point.title = `${socket} connection point`;
        layer.append(point);
      }
      world.append(layer);
    }
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
    if (key === "contacts") return this.#contactsStep();
    if (key === "languages") return this.#textareaOnly("languages", "Languages", "One language per line, or comma separated.");
    if (key === "persona") return this.#personaStep();
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

  #refreshLiveBuild() {
    const panel = this.root.querySelector(".vr-cc-live-build");
    if (panel) panel.innerHTML = this.#liveBuild();
  }

  #refreshLivePersonaPips() {
    for (const axis of PERSONA_AXES) {
      const value = clampPersona(this.state.personaIndex?.[axis.key]);
      const leftPips = Math.floor(Math.max(0, -value) / 10);
      const rightPips = Math.floor(Math.max(0, value) / 10);
      for (const pips of this.root.querySelectorAll(`[data-persona-axis="${axis.key}"]`)) {
        pips.style.setProperty("--vr-persona-position", `${((value + 100) / 2).toFixed(1)}%`);
        pips.setAttribute("aria-label", `${axis.left} to ${axis.right}: ${value}`);
        pips.querySelectorAll(".left i").forEach((pip, index) => pip.classList.toggle("active", index >= 10 - leftPips));
        pips.querySelectorAll(".right i").forEach((pip, index) => pip.classList.toggle("active", index < rightPips));
      }
    }
  }

  #personaPips(axis, value) {
    const leftPips = Math.floor(Math.max(0, -value) / 10);
    const rightPips = Math.floor(Math.max(0, value) / 10);
    return `<span class="vr-cc-persona-pips" data-persona-axis="${axis.key}" style="--vr-persona-position: ${((value + 100) / 2).toFixed(1)}%" aria-label="${escape(`${axis.left} to ${axis.right}: ${value}`)}"><span class="vr-cc-persona-pip-side left">${Array.from({ length: 10 }, (_, index) => `<i class="${index >= 10 - leftPips ? "active" : ""}"></i>`).join("")}</span><b aria-hidden="true"></b><span class="vr-cc-persona-pip-side right">${Array.from({ length: 10 }, (_, index) => `<i class="${index < rightPips ? "active" : ""}"></i>`).join("")}</span><em aria-hidden="true"></em></span>`;
  }

  #treeNavigation(steps) {
    const visible = new Set(steps.map(step => step.key));
    return STEP_GROUPS.filter(group => group.keys.some(key => visible.has(key))).map(group => {
      const groupSteps = group.keys.filter(key => visible.has(key));
      const open = groupSteps.includes(steps[this.step]?.key) || this.openTreeGroups.has(group.label);
      const children = group.keys.filter(key => visible.has(key)).map(key => {
        const index = steps.findIndex(step => step.key === key);
        const step = steps[index];
        return `<button type="button" class="vr-cc-step child ${index === this.step ? "active" : ""} ${index < this.step ? "complete" : ""}" data-step="${index}"><i class="${step.icon}"></i><span>${escape(step.label)}</span></button>`;
      }).join("");
      return `<section class="vr-cc-tree-group"><button type="button" class="vr-cc-tree-trunk" data-tree-group="${escape(group.label)}" aria-expanded="${open}"><i class="fa-solid fa-chevron-${open ? "down" : "right"}"></i><span>${escape(group.label)}</span></button><div class="vr-cc-tree-branches ${open ? "open" : ""} ${open && this.animateNavigation ? "animate" : ""}">${children}</div></section>`;
    }).join("");
  }

  #stepGroupLabel(step) {
    return STEP_GROUPS.find(group => group.keys.includes(step?.key))?.label ?? "";
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
      <label class="vr-cc-field vr-cc-name-at-level"><span>Character Name <small>(optional)</small></span><input name="name" type="text" value="${escape(this.state.name)}" placeholder="You can add this later" /></label>
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
    // Draft-only by design. Actor data is written atomically from Review → Confirm.
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
    const query = String(this.state.qualityFlawSearch ?? "").trim().toLowerCase();
    const type = ["all", "quality", "flaw"].includes(this.state.qualityFlawTypeFilter) ? this.state.qualityFlawTypeFilter : "all";
    const pillar = ["all", ...QUALITY_FLAW_PILLARS].includes(this.state.qualityFlawPillarFilter) ? this.state.qualityFlawPillarFilter : "all";
    const tierFilter = ["all", ...QUALITY_FLAW_TIERS].includes(this.state.qualityFlawTierFilter) ? this.state.qualityFlawTierFilter : "all";
    const matches = (...values) => !query || values.some(value => String(value).toLowerCase().includes(query));
    const visibleRows = QUALITY_FLAW_TIERS.flatMap((tier, index) => ["quality", "flaw"].map(kind => ({ kind, tier, points: index + 1, pillar: pillar === "all" ? "" : pillar })))
      .filter(row => (type === "all" || row.kind === type) && (tierFilter === "all" || row.tier === tierFilter) && matches(row.tier, row.pillar, `custom ${row.kind === "quality" ? "perk" : "flaw"}`));
    const pill = (action, value, label, active) => `<button type="button" class="vr-cc-qf-pill ${active ? "active" : ""}" data-action="${action}" data-qf-filter="${value}" aria-pressed="${active}">${escape(label)}</button>`;
    return `<div class="vr-cc-qf-toolbar">
        <label class="vr-cc-qf-search"><i class="fa-solid fa-magnifying-glass"></i><input name="qualityFlawSearch" type="search" value="${escape(this.state.qualityFlawSearch)}" placeholder="Search perks and flaws" aria-label="Search perks and flaws" /></label>
      </div>
      <div class="vr-cc-qf-filters" aria-label="Perk and flaw filters">
        <div><span>Type</span>${pill("set-qf-type", "all", "All", type === "all")}${pill("set-qf-type", "quality", "Perks", type === "quality")}${pill("set-qf-type", "flaw", "Flaws", type === "flaw")}</div>
        <div><span>Pillar</span>${pill("set-qf-pillar", "all", "All Pillars", pillar === "all")}${QUALITY_FLAW_PILLARS.map(value => pill("set-qf-pillar", value, value, pillar === value)).join("")}</div>
        <div><span>Tier</span>${pill("set-qf-tier", "all", "All Tiers", tierFilter === "all")}${QUALITY_FLAW_TIERS.map((value, index) => pill("set-qf-tier", value, `${index + 1} PT`, tierFilter === value)).join("")}</div>
      </div>
      <div class="vr-cc-qf-grid">
        ${visibleRows.length ? visibleRows.map(row => `<section class="vr-cc-qf-tier-row">
          <div class="vr-cc-qf-tier-options">
            ${this.#qualityFlawChoiceCard(row.kind, row.tier, row.points, row.pillar)}
          </div>
        </section>`).join("") : `<p class="vr-cc-qf-empty">No perks or flaws match those filters.</p>`}
      </div>`;
  }

  #qualityFlawChoiceCard(kind, tier, points, pillar = "") {
    const focus = this.state.qualityFlawFocus ?? {};
    const focused = focus.kind === kind && focus.tier === tier && focus.points === points && focus.pillar === pillar;
    return `<article class="vr-cc-qf-choice-card ${kind} ${focused ? "focused" : ""}">
        <button type="button" class="vr-cc-qf-choice-focus" data-action="focus-qf-choice" data-qf-kind="${kind}" data-qf-tier="${tier}" data-qf-points="${points}" data-qf-pillar="${pillar}" aria-label="Inspect custom ${kind === "quality" ? "perk" : "flaw"}"></button>
        <header><span class="vr-cc-qf-choice-icon"><i class="fa-solid ${kind === "quality" ? "fa-sparkles" : "fa-triangle-exclamation"}"></i></span><strong>${points} PT</strong></header>
        <strong>Custom ${kind === "quality" ? "Perk" : "Flaw"}</strong>
        <small>${escape(tier)} - ${escape(pillar || "Choose pillar")}</small>
        <button type="button" class="vr-cc-btn" data-action="open-qf-dialog" data-qf-kind="${kind}" data-qf-tier="${tier}" data-qf-points="${points}" ${pillar ? `data-qf-pillar="${pillar}"` : ""}>Select</button>
      </article>`;
  }

  #qualityFlawQuota(audit = this.#qualityFlawAudit()) {
    return `<section class="vr-cc-qf-quota"><strong>Perk & Flaw Quota</strong><span>Perks ${audit.qualityPoints}/10 | Flaws ${audit.flawPoints}/20 minimum | Minor ${audit.minorPoints}/8 | Resolve potential: ${audit.resolvePotential}</span></section>`;
  }

  #qualityFlawTracker() {
    const audit = this.#qualityFlawAudit();
    const pillarBar = pillar => {
      const points = audit.pillarPoints[pillar] ?? 0;
      return `<div class="vr-cc-qf-pillar"><span>${escape(pillar)}</span><progress max="10" value="${points}"></progress><strong>${points}/10</strong></div>`;
    };
    return `<header class="vr-cc-live-header"><div><span>Live Rules & Math</span><h2>Perks & Flaws</h2></div></header>
      <div class="vr-cc-live-scroll vr-cc-qf-tracker">
        ${this.#qualityFlawQuota(audit)}
        <section class="vr-cc-qf-rules"><h3>Limits</h3><ul><li>Minor entries: ${audit.minorPoints}/8 pts</li><li>Perks: ${audit.qualityPoints}/10 pts</li><li>Flaws: ${audit.flawPoints}/20 pts minimum</li></ul></section>
        <section class="vr-cc-qf-pillar-breakdown"><h3>Pillar Breakdown</h3>${QUALITY_FLAW_PILLARS.map(pillarBar).join("")}</section>
        ${this.#qualityFlawTaken("quality", "Selected Perks", this.state.qualitiesTaken)}
        ${this.#qualityFlawTaken("flaw", "Selected Flaws", this.state.flawsTaken)}
      </div>`;
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
    const allEntries = [...(this.state.qualitiesTaken ?? []), ...(this.state.flawsTaken ?? [])];
    const pillarPoints = Object.fromEntries(QUALITY_FLAW_PILLARS.map(pillar => [pillar, total(allEntries.filter(entry => entry.pillar === pillar))]));
    return { qualityPoints, flawPoints, minorPoints, resolvePotential: Math.floor(flawPoints / 5), pillarPoints, exceedsPillar };
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
        ${modifiers.length ? `<p><b>Persona modifiers:</b> ${escape(modifiers.join(", "))}</p>` : ""}</div>`;
    }

    if (key === "profession") {
      return `<div class="vr-cc-info-heading">
        <span>Information</span>
        <h2>Path</h2>
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

    if (key === "persona") {
      return `<div class="vr-cc-info-heading"><span>Persona Index</span><h2>Ten-point markers</h2></div><div class="vr-cc-reference vr-cc-persona-guide"><p>Each illuminated segment is 10 points. The marker shows the current position; negative values move toward the left label and positive values toward the right label.</p>${PERSONA_AXES.map(axis => {
        const value = clampPersona(this.state.personaIndex?.[axis.key]);
        const direction = value === 0 ? "Balanced" : `${Math.abs(value)} toward ${value < 0 ? axis.left : axis.right}`;
        return `<div><strong>${escape(axis.left)} / ${escape(axis.right)}</strong><span>-100 Â· -90 Â· -80 Â· -70 Â· -60 Â· -50 Â· -40 Â· -30 Â· -20 Â· -10 Â· 0 Â· +10 Â· +20 Â· +30 Â· +40 Â· +50 Â· +60 Â· +70 Â· +80 Â· +90 Â· +100</span><small>Current: ${escape(direction)}</small></div>`;
      }).join("")}</div>`;
    }

    if (key === "qualitiesFlaws") {
      const focus = this.state.qualityFlawFocus ?? { kind: "quality", tier: "Minor", points: 1, pillar: "Physical" };
      const typeLabel = focus.kind === "flaw" ? "Flaw" : "Perk";
      return `<div class="vr-cc-info-heading"><span>Item Inspector</span><h2>Custom ${typeLabel}</h2></div>
        <div class="vr-cc-reference vr-cc-qf-inspector">
          <div class="vr-cc-qf-inspector-badge">${escape(focus.points)} PT · ${escape(focus.tier)}</div>
          <h3>${escape(focus.pillar)} ${typeLabel}</h3>
          <p>Select opens the editable entry form. Add the finalized mechanical triggers, prerequisites, and lore description there; this system does not invent missing rule text.</p>
          <p><b>Rule context:</b> each pillar is limited to 10 points. Minor entries collectively cannot exceed 8 points.</p>
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
    </div>`;
  }

  #talentsAndSkillsStep() {
    return this.#talentCanvasV2();
  }

  #talentHeader(current, stepCount) {
    const page = this.treePage === "magic" ? "magic" : "skills";
    return `<header class="vr-cc-header vr-cc-talent-header">
      <div class="vr-cc-talent-heading"><span>Step ${this.step + 1} of ${stepCount}</span><h1>${escape(current.label)}</h1></div>
      <nav class="vr-cc-tree-tabs" aria-label="Talent canvas"><button type="button" data-tree-page="skills" class="${page === "skills" ? "active" : ""}"><i class="fa-solid fa-crosshairs"></i><span>Skills</span></button><button type="button" data-tree-page="magic" class="${page === "magic" ? "active" : ""}"><i class="fa-solid fa-wand-sparkles"></i><span>Magic</span></button></nav>
      <div class="vr-cc-tree-pools"><div><span>Talent Points</span><strong>${this.#treeAvailable("talent")}</strong></div><div><span>Skill Points</span><strong>${this.#treeAvailable("skill")}</strong></div><small>${Math.round(this.treeZoom * 100)}%</small><button type="button" class="vr-cc-btn vr-cc-tree-undo" data-action="undo-tree-purchase" ${this.treeUndoStack.length ? "" : "disabled"}><i class="fa-solid fa-rotate-left"></i><span>Undo</span></button></div>
      ${game.user.isGM ? `<div class="vr-cc-tree-author-actions"><button type="button" class="vr-cc-btn ${this.nodeMoveMode ? "active" : ""}" data-action="toggle-tree-move"><i class="fa-solid fa-arrows-up-down-left-right"></i><span>${this.nodeMoveMode ? "Finish Moving" : "Move Nodes"}</span></button><button type="button" class="vr-cc-btn ${this.connectionTool.active ? "active" : ""}" data-action="toggle-tree-connect"><i class="fa-solid fa-link"></i><span>${this.connectionTool.active ? "Cancel Connect" : "Connect Nodes"}</span></button><button type="button" class="vr-cc-btn" data-action="add-tree-node"><i class="fa-solid fa-pen-ruler"></i><span>Node Editor</span></button><button type="button" class="vr-cc-btn" data-action="manage-tree-traits"><i class="fa-solid fa-tags"></i><span>Traits</span></button></div>` : ""}
      ${game.user.isGM && this.connectionTool.active ? this.#connectionToolbar() : ""}
      ${game.user.isGM && this.nodeMoveMode ? this.#nodeAlignmentToolbar() : ""}
    </header>`;
  }

  #nodeAlignmentToolbar() {
    const count = this.selectedTreeNodes.size;
    const ringCount = [...this.selectedTreeNodes].filter(key => !key.startsWith("root:")).length;
    const ringControls = this.treeRingTool.active ? `<div class="vr-cc-ring-controls"><label>Radius <input type="range" name="treeRingTool.radius" min="180" max="3000" step="10" value="${number(this.treeRingTool.radius, 500)}"><output>${number(this.treeRingTool.radius, 500)} px</output></label><label>Rotation <input type="range" name="treeRingTool.rotation" min="-180" max="180" step="1" value="${number(this.treeRingTool.rotation, -90)}"><output>${number(this.treeRingTool.rotation, -90)}°</output></label><button type="button" class="vr-cc-mini-btn primary" data-action="place-tree-ring"><i class="fa-solid fa-check"></i> Place on Ring</button><button type="button" class="vr-cc-mini-btn" data-action="cancel-tree-ring">Cancel Ring</button></div>` : "";
    return `<section class="vr-cc-node-align-toolbar"><strong>${count} node${count === 1 ? "" : "s"} selected</strong><span>Click to select · Shift-click to add or remove</span><button type="button" class="vr-cc-mini-btn" data-action="align-tree-horizontal" ${count < 2 ? "disabled" : ""}><i class="fa-solid fa-arrows-left-right-to-line"></i> Horizontal line</button><button type="button" class="vr-cc-mini-btn" data-action="align-tree-vertical" ${count < 2 ? "disabled" : ""}><i class="fa-solid fa-arrows-up-down-to-line"></i> Vertical line</button><button type="button" class="vr-cc-mini-btn" data-action="square-tree-nodes" ${count < 2 ? "disabled" : ""}><i class="fa-solid fa-border-all"></i> Square Up</button><button type="button" class="vr-cc-mini-btn" data-action="space-tree-horizontal" ${count < 3 ? "disabled" : ""}><i class="fa-solid fa-arrows-left-right"></i> Space Horizontally</button><button type="button" class="vr-cc-mini-btn" data-action="space-tree-vertical" ${count < 3 ? "disabled" : ""}><i class="fa-solid fa-arrows-up-down"></i> Space Vertically</button><button type="button" class="vr-cc-mini-btn ${this.treeRingTool.active ? "active" : ""}" data-action="preview-tree-ring" ${ringCount < 2 || this.openPracticeId ? "disabled" : ""}><i class="fa-regular fa-circle"></i> Circular Ring</button><button type="button" class="vr-cc-mini-btn" data-action="clear-node-selection" ${count ? "" : "disabled"}>Clear selection</button>${ringControls}</section>`;
  }

  #connectionToolbar() {
    const tool = this.connectionTool;
    const anchorOptions = field => ["auto", "center", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"].map(value => `<option value="${value}" ${tool[field] === value ? "selected" : ""}>${value}</option>`).join("");
    return `<section class="vr-cc-connection-toolbar"><strong>${tool.source ? `Source: ${escape(tool.source.name)}` : "Drag from any center, side, or corner socket to a target socket"}</strong><label>Mode<select name="connectionTool.operation"><option value="connect">Create / Update</option><option value="remove" ${tool.operation === "remove" ? "selected" : ""}>Remove</option></select></label><label>Thickness<input name="connectionTool.thickness" type="number" min="1" max="10" step=".5" value="${number(tool.thickness, 2)}" /></label><label>Bend<input name="connectionTool.bend" type="range" min="-100" max="100" value="${number(tool.bend)}" /><small>${number(tool.bend)}%</small></label><label>Source socket<select name="connectionTool.sourceAnchor">${anchorOptions("sourceAnchor")}</select></label><label>Target socket<select name="connectionTool.targetAnchor">${anchorOptions("targetAnchor")}</select></label><label>Pattern<select name="connectionTool.pattern"><option value="solid">Solid</option><option value="dashed" ${tool.pattern === "dashed" ? "selected" : ""}>Dashed</option><option value="dotted" ${tool.pattern === "dotted" ? "selected" : ""}>Dotted</option></select></label><label>Glow<input name="connectionTool.glow" type="range" min="0" max="3" step=".25" value="${number(tool.glow, 1)}" /></label><label>Color<input name="connectionTool.color" type="color" value="${escape(tool.color || "#ffffff")}" /><button type="button" class="vr-cc-mini-btn" data-action="clear-connection-color">School color</button></label><div class="vr-cc-connection-clear"><button type="button" class="vr-cc-mini-btn" data-action="clear-connection-selection" ${tool.source ? "" : "disabled"}>Clear Selection</button><button type="button" class="vr-cc-mini-btn danger" data-action="clear-canvas-connections">Clear Canvas Links</button></div></section>`;
  }

  #talentCanvasV2() {
    const page = this.treePage === "magic" ? "magic" : "skills";
    const schools = talentTreePage(page);
    const practiceEntry = this.openPracticeId ? this.#treeCatalogEntry(this.openPracticeId, "practice") : null;
    const board = practiceEntry
      ? this.#practiceSpellWorld(practiceEntry.school, practiceEntry.practice, page)
      : schools.length ? this.#treeWorld(schools, page) : `<section class="vr-cc-tree-empty"><h2>${page === "magic" ? "Magic" : "Skills"} catalog not yet populated</h2><p>The ${page} system is separate and ready for its own Schools, Practices, and nodes.</p></section>`;
    const breadcrumb = practiceEntry ? `<div class="vr-cc-subcanvas-heading"><button type="button" class="vr-cc-btn" data-action="close-practice-canvas"><i class="fa-solid fa-arrow-left"></i><span>All Practices</span></button><div><span>${escape(practiceEntry.school.name)}</span><strong>${escape(practiceEntry.practice.name)} ${page === "magic" ? "Spells" : "Skills"}</strong></div></div>` : "";
    return `<section class="vr-cc-talent-canvas ${page === "magic" ? "magic" : "skills"}">${breadcrumb}<main class="vr-cc-tree-board" data-viewport-key="${escape(this.#treeViewportKey())}">${board}</main>${this.authorNode ? this.#authorNodeMarkup() : ""}${this.traitEditorOpen ? this.#traitEditorMarkup() : ""}</section>`;
  }

  #treeWorld(schools, page) {
    const rootNode = talentTreeRoot(page);
    const rootRecord = { kind: "root", root: rootNode, node: rootNode };
    const schoolMap = new Map(schools.map(school => [school.id, { kind: "school", school, node: school }]));
    const practiceMap = new Map(schools.flatMap(school => (school.practices ?? []).map(practice => [practice.id, { kind: "practice", school, practice, node: practice }])));
    const purchasedPractices = new Set(this.state.talentTree?.branches ?? []);
    const paths = [];
    for (const school of schools) {
      const line = this.#treeLineStyle(school.rootConnection, school.color);
      const schoolState = this.#schoolInvestment(school).total > 0 ? "active" : "available";
      if (!line.hidden) paths.push(`<path class="vr-cc-tree-link ${schoolState} pattern-${line.pattern}" style="${line.css}" ${this.#treeLineMetadata(rootRecord, schoolMap.get(school.id), line)} d="${this.#treeConnectionPath(rootRecord, schoolMap.get(school.id), line)}" />`);
    }
    for (const school of schools) for (const practice of school.practices ?? []) {
      const sources = practice.requires?.length ? practice.requires.map(value => ({ source: practiceMap.get(treeRequirement(value).id), requirement: treeRequirement(value) })).filter(entry => entry.source) : [{ source: schoolMap.get(school.id), requirement: { line: practice.schoolConnection ?? {} } }];
      const practiceAvailable = (practice.requires ?? []).every(value => purchasedPractices.has(treeRequirement(value).id)) && this.state.startingLevel >= Math.max(1, number(practice.requiredLevel, 1));
      const practiceState = purchasedPractices.has(practice.id) ? "active" : practiceAvailable ? "available" : "blocked";
      for (const entry of sources) {
        const line = this.#treeLineStyle(entry.requirement.line, school.color);
        if (!line.hidden) paths.push(`<path class="vr-cc-tree-link ${practiceState} ${entry.source.school.id !== school.id ? "cross-school" : ""} pattern-${line.pattern}" style="${line.css}" ${this.#treeLineMetadata(entry.source, practiceMap.get(practice.id), line)} d="${this.#treeConnectionPath(entry.source, practiceMap.get(practice.id), line)}" />`);
      }
    }
    const dimensions = this.#treeWorldDimensions(schools, page);
    return `<div class="vr-cc-tree-world-frame" style="width:${dimensions.width * this.treeZoom}px;height:${dimensions.height * this.treeZoom}px"><div class="vr-cc-tree-world ${page}" data-world-width="${dimensions.width}" data-world-height="${dimensions.height}" style="--tree-zoom:${this.treeZoom};width:${dimensions.width}px;height:${dimensions.height}px"><svg class="vr-cc-tree-links" viewBox="0 0 ${dimensions.width} ${dimensions.height}" style="width:${dimensions.width}px;height:${dimensions.height}px" aria-hidden="true">${paths.join("")}</svg>${this.#rootMarkup(rootNode, this.#magicInvestment(schools))}${schools.map(school => this.#schoolMarkup(school, false)).join("")}</div></div>`;
  }

  #practiceSpellWorld(school, practice, page) {
    const practiceRecord = { kind: "practice", school, practice, node: practice };
    const spellMap = new Map((practice.spells ?? []).map(spell => [spell.id, { kind: "spell", school, practice, spell, node: spell }]));
    const practicePurchased = (this.state.talentTree?.branches ?? []).includes(practice.id);
    const paths = [];
    const external = new Map();
    for (const spell of practice.spells ?? []) {
      const target = spellMap.get(spell.id);
      const rank = number((this.state.talentTree?.leaves ?? []).find(entry => entry.id === spell.id)?.rank);
      const available = practicePurchased && (spell.requires ?? []).every(value => { const requirement = treeRequirement(value); return number((this.state.talentTree?.leaves ?? []).find(entry => entry.id === requirement.id)?.rank) >= requirement.level; });
      const state = rank ? "active" : available ? "available" : "blocked";
      if (!(spell.requires ?? []).length) {
        const line = this.#treeLineStyle(spell.practiceConnection, practice.color || school.color);
        if (!line.hidden) paths.push(`<path class="vr-cc-tree-link spell-link ${state} pattern-${line.pattern}" style="${line.css}" ${this.#treeLineMetadata(practiceRecord, target, line)} d="${this.#treeConnectionPath(practiceRecord, target, line)}" />`);
      }
      for (const requiredValue of spell.requires ?? []) {
        const requirement = treeRequirement(requiredValue);
        const source = spellMap.get(requirement.id);
        if (!source) {
          const sourceEntry = this.#treeCatalogEntry(requirement.id, "spell");
          if (!sourceEntry) continue;
          if (!external.has(requirement.id)) {
            const index = external.size;
            const proxy = { ...sourceEntry.spell, x: number(practice.x) - 280, y: number(practice.y) + 20 + index * 105 };
            external.set(requirement.id, { kind: "external", ...sourceEntry, spell: proxy, node: proxy, requirement });
          }
          const proxySource = external.get(requirement.id);
          const line = this.#treeLineStyle(requirement.line, sourceEntry.school.color);
          if (!line.hidden) paths.push(`<path class="vr-cc-tree-link spell-link cross-school ${state} pattern-${line.pattern}" style="${line.css}" ${this.#treeLineMetadata(proxySource, target, line)} d="${this.#treeConnectionPath(proxySource, target, line)}" />`);
          continue;
        }
        const line = this.#treeLineStyle(requirement.line, practice.color || school.color);
        if (!line.hidden) paths.push(`<path class="vr-cc-tree-link spell-link ${state} pattern-${line.pattern}" style="${line.css}" ${this.#treeLineMetadata(source, target, line)} d="${this.#treeConnectionPath(source, target, line)}" />`);
      }
    }
    const dimensions = this.#treeWorldDimensions([school], page);
    return `<div class="vr-cc-tree-world-frame" style="width:${dimensions.width * this.treeZoom}px;height:${dimensions.height * this.treeZoom}px"><div class="vr-cc-tree-world ${page} practice-subcanvas" data-world-width="${dimensions.width}" data-world-height="${dimensions.height}" style="--tree-zoom:${this.treeZoom};width:${dimensions.width}px;height:${dimensions.height}px;--tree-color:${escape(practice.color || school.color)}"><svg class="vr-cc-tree-links" viewBox="0 0 ${dimensions.width} ${dimensions.height}" style="width:${dimensions.width}px;height:${dimensions.height}px" aria-hidden="true">${paths.join("")}</svg>${this.#practiceMarkup(school, practice, true)}${[...external.values()].map(entry => this.#externalRequirementMarkup(entry)).join("")}</div></div>`;
  }

  #externalRequirementMarkup(entry) {
    const rank = Math.max(0, number((this.state.talentTree?.leaves ?? []).find(candidate => candidate.id === entry.spell.id)?.rank));
    return `<div class="vr-cc-external-requirement" data-tree-node-id="${escape(entry.spell.id)}" style="left:${number(entry.spell.x)}px;top:${number(entry.spell.y)}px;--tree-color:${escape(entry.school.color)}" title="Cross-Practice prerequisite"><span>${escape(entry.school.name)} / ${escape(entry.practice.name)}</span><strong>${escape(entry.spell.name)}</strong><small>Lv ${rank}/${entry.requirement.level} required</small></div>`;
  }

  #rootMarkup(root, investment = { total: 0, talent: 0, skill: 0 }) {
    const selected = this.connectionTool.source?.id === root.id ? "connection-source" : "";
    const drag = game.user.isGM ? `draggable="true" data-tree-drag="root:${escape(root.id)}"` : "";
    return `<div class="vr-cc-root-node shape-${escape(root.shape ?? "hex")} ${selected}" style="left:${number(root.x)}px;top:${number(root.y)}px;--tree-color:${escape(root.color ?? "#d8b4fe")}" ${drag} data-tree-root="${escape(root.id)}" data-tree-node-id="${escape(root.id)}" title="${investment.talent} Talent Points and ${investment.skill} Skill Points invested"><span>Total Investment</span><b>${investment.total}</b><strong>${escape(root.name)}</strong></div>`;
  }

  #schoolInvestment(school) {
    const branches = new Set(this.state.talentTree?.branches ?? []);
    const ranks = new Map((this.state.talentTree?.leaves ?? []).map(entry => [entry.id, Math.max(0, number(entry.rank))]));
    let talent = 0;
    let skill = 0;
    for (const practice of school.practices ?? []) {
      if (branches.has(practice.id)) talent += Math.max(1, number(practice.talentCost, 1));
      for (const spell of practice.spells ?? []) {
        const rank = ranks.get(spell.id) ?? 0;
        if (!rank) continue;
        talent += Math.max(1, number(spell.talentCost, 1));
        skill += Math.max(0, rank - 1) * Math.max(0, number(spell.rankCost, skillPointCostForLevel(this.state.startingLevel)));
      }
    }
    return { talent, skill, total: talent + skill };
  }

  #magicInvestment(schools) {
    return schools.reduce((total, school) => { const value = this.#schoolInvestment(school); total.talent += value.talent; total.skill += value.skill; total.total += value.total; return total; }, { talent: 0, skill: 0, total: 0 });
  }

  #treeWorldDimensions(schools, page) {
    const nodes = schools.flatMap(school => [school, ...(school.practices ?? []).flatMap(practice => [practice, ...(practice.spells ?? [])])]);
    const previous = this.treeCanvasDimensions[page] ?? { width: 10000, height: 6000 };
    const maximumX = Math.max(0, ...nodes.map(node => number(node.x)));
    const maximumY = Math.max(0, ...nodes.map(node => number(node.y)));
    const dimensions = { width: Math.max(previous.width, Math.ceil((maximumX + 2500) / 2000) * 2000), height: Math.max(previous.height, Math.ceil((maximumY + 1800) / 1500) * 1500) };
    this.treeCanvasDimensions[page] = dimensions;
    return dimensions;
  }

  #treeLineStyle(source = {}, fallbackColor = "#94a3b8") {
    const line = source && typeof source === "object" ? source : {};
    const thickness = Math.max(1, Math.min(10, number(line.thickness, 2)));
    const bend = Math.max(-100, Math.min(100, number(line.bend)));
    const glow = Math.max(0, Math.min(3, number(line.glow, 1)));
    const pattern = ["solid", "dashed", "dotted"].includes(line.pattern) ? line.pattern : "solid";
    const anchors = ["auto", "center", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"];
    const sourceAnchor = anchors.includes(line.sourceAnchor) ? line.sourceAnchor : "auto";
    const targetAnchor = anchors.includes(line.targetAnchor) ? line.targetAnchor : "auto";
    const color = /^#[0-9a-f]{6}$/i.test(line.color ?? "") ? line.color : fallbackColor;
    return { hidden: line.hidden === true, thickness, bend, glow, pattern, sourceAnchor, targetAnchor, color, css: `--tree-color:${escape(color)};--line-width:${thickness};--line-glow:${glow}` };
  }

  #treeNodeGeometry(record) {
    const node = record?.node;
    if (!node) return { left: 0, top: 0, right: 0, bottom: 0, cx: 0, cy: 0 };
    if (record.kind === "external") return { left: number(node.x) - 85, top: number(node.y) - 32, right: number(node.x) + 85, bottom: number(node.y) + 32, cx: number(node.x), cy: number(node.y) };
    if (record.kind === "spell") return { left: number(node.x) - 23, top: number(node.y) - 23, right: number(node.x) + 23, bottom: number(node.y) + 23, cx: number(node.x), cy: number(node.y) };
    const width = record.kind === "root" ? 144 : 116;
    const height = width;
    return { left: number(node.x) - width / 2, top: number(node.y) - height / 2, right: number(node.x) + width / 2, bottom: number(node.y) + height / 2, cx: number(node.x), cy: number(node.y) };
  }

  #treeAnchorPoint(geometry, anchor, toward) {
    let selected = anchor;
    if (selected === "auto") {
      const dx = toward.cx - geometry.cx;
      const dy = toward.cy - geometry.cy;
      selected = Math.abs(dx) > Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
    }
    if (selected === "top") return { x: geometry.cx, y: geometry.top };
    if (selected === "top-left") return { x: geometry.left, y: geometry.top };
    if (selected === "top-right") return { x: geometry.right, y: geometry.top };
    if (selected === "right") return { x: geometry.right, y: geometry.cy };
    if (selected === "bottom") return { x: geometry.cx, y: geometry.bottom };
    if (selected === "bottom-right") return { x: geometry.right, y: geometry.bottom };
    if (selected === "bottom-left") return { x: geometry.left, y: geometry.bottom };
    if (selected === "left") return { x: geometry.left, y: geometry.cy };
    return { x: geometry.cx, y: geometry.cy };
  }

  #treeConnectionPath(source, target, line) {
    const sourceGeometry = this.#treeNodeGeometry(source);
    const targetGeometry = this.#treeNodeGeometry(target);
    const start = this.#treeAnchorPoint(sourceGeometry, line.sourceAnchor, targetGeometry);
    const end = this.#treeAnchorPoint(targetGeometry, line.targetAnchor, sourceGeometry);
    if (!line.bend) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.min(360, distance * .45) * (line.bend / 100);
    const nx = -dy / distance;
    const ny = dx / distance;
    return `M ${start.x} ${start.y} C ${start.x + dx / 3 + nx * offset} ${start.y + dy / 3 + ny * offset}, ${start.x + dx * 2 / 3 + nx * offset} ${start.y + dy * 2 / 3 + ny * offset}, ${end.x} ${end.y}`;
  }

  #treeLineMetadata(source, target, line) {
    return `data-tree-source="${escape(source?.node?.id ?? "")}" data-tree-target="${escape(target?.node?.id ?? "")}" data-source-anchor="${escape(line.sourceAnchor ?? "auto")}" data-target-anchor="${escape(line.targetAnchor ?? "auto")}" data-line-bend="${number(line.bend)}"`;
  }

  #schoolMarkup(school, showSpells = false) {
    const drag = game.user.isGM ? `draggable="true" data-tree-drag="school:${escape(school.id)}"` : "";
    const selected = this.connectionTool.source?.id === school.id ? "connection-source" : "";
    const investment = this.#schoolInvestment(school);
    return `<section class="vr-cc-school-group" style="--tree-color:${escape(school.color)}"><div class="vr-cc-school-node ${selected}" style="left:${number(school.x)}px;top:${number(school.y)}px" ${drag} data-tree-school="${escape(school.id)}" data-tree-node-id="${escape(school.id)}" title="${investment.talent} Talent Points and ${investment.skill} Skill Points invested"><span>School</span><b>${investment.total}</b><strong>${escape(school.name)}</strong></div>${(school.practices ?? []).map(practice => this.#practiceMarkup(school, practice, showSpells)).join("")}</section>`;
  }

  #practiceMarkup(school, practice, showSpells = false) {
    const purchased = (this.state.talentTree?.branches ?? []).includes(practice.id);
    const draftPurchase = purchased && !(this.initialTalentTree?.branches ?? []).includes(practice.id);
    const requirementsMet = (practice.requires ?? []).every(value => (this.state.talentTree?.branches ?? []).includes(treeRequirement(value).id));
    const levelMet = this.state.startingLevel >= Math.max(1, number(practice.requiredLevel, 1));
    const available = requirementsMet && levelMet;
    const drag = game.user.isGM ? `draggable="true" data-tree-drag="practice:${escape(school.id)}:${escape(practice.id)}"` : "";
    const spells = showSpells ? (practice.spells ?? []).map(spell => this.#spellRow(school, practice, spell, purchased, practice.color || school.color)).join("") : "";
    const selected = this.connectionTool.source?.id === practice.id ? "connection-source" : "";
    const status = purchased ? (showSpells ? "" : "Open Spells") : `${Math.max(1, number(practice.talentCost, 1))} TP`;
    return `<div class="vr-cc-practice-cluster" style="--tree-color:${escape(practice.color || school.color)}"><button type="button" class="vr-cc-practice-node ${selected} ${draftPurchase ? "draft-change" : ""} ${purchased ? "purchased" : available ? "available" : "locked"}" style="left:${number(practice.x)}px;top:${number(practice.y)}px" ${drag} data-tree-practice-card="${escape(practice.id)}" data-tree-practice="${escape(practice.id)}" data-tree-node-id="${escape(practice.id)}" title="${draftPurchase ? "Right-click to undo this current-session purchase." : ""}" ${(!purchased && !available) && !game.user.isGM ? "disabled" : ""}><span>Practice</span><strong>${escape(practice.name)}</strong>${status ? `<small>${escape(status)}</small>` : ""}</button>${spells}</div>`;
  }

  #spellRow(school, practice, spell, practicePurchased, color) {
    const entry = (this.state.talentTree?.leaves ?? []).find(candidate => candidate.id === spell.id);
    const rank = Math.max(0, number(entry?.rank));
    const initialRank = Math.max(0, number((this.initialTalentTree?.leaves ?? []).find(candidate => candidate.id === spell.id)?.rank));
    const draftRank = rank > initialRank;
    const requirementsMet = (spell.requires ?? []).every(value => { const requirement = treeRequirement(value); return number((this.state.talentTree?.leaves ?? []).find(candidate => candidate.id === requirement.id)?.rank) >= requirement.level; });
    const levelMet = this.state.startingLevel >= Math.max(1, number(spell.requiredLevel, 1));
    const maximum = Math.max(1, number(spell.maxRank, 1));
    const available = practicePurchased && requirementsMet && levelMet && rank < maximum;
    const cost = rank ? Math.max(0, number(spell.rankCost, skillPointCostForLevel(this.state.startingLevel))) : Math.max(1, number(spell.talentCost, 1));
    const currency = rank ? "SP" : "TP";
    const prerequisiteText = (spell.requires ?? []).map(value => { const requirement = treeRequirement(value); return `${this.#treeCatalogEntry(requirement.id, "spell")?.spell?.name ?? requirement.id} level ${requirement.level}`; }).join(", ");
    const drag = game.user.isGM ? `draggable="true" data-tree-drag="spell:${escape(school.id)}:${escape(practice.id)}:${escape(spell.id)}"` : "";
    const selected = this.connectionTool.source?.id === spell.id ? "connection-source" : "";
    return `<button type="button" class="vr-cc-spell-node ${selected} ${draftRank ? "draft-change" : ""} ${rank ? "ranked" : ""} ${available ? "available" : "locked"}" style="left:${number(spell.x)}px;top:${number(spell.y)}px;--tree-color:${escape(color)}" data-tree-rank="${escape(spell.id)}" data-tree-node-id="${escape(spell.id)}" ${drag} ${!available && !game.user.isGM ? "disabled" : ""} title="${escape(`${spell.name}; level ${rank}/${maximum}; ${cost} ${currency}${prerequisiteText ? `; requires ${prerequisiteText}` : ""}${draftRank ? "; right-click to undo one current-session level" : ""}`)}"><span class="vr-cc-spell-glyph"><i class="fa-solid ${spell.type === "ability" ? "fa-burst" : "fa-wand-sparkles"}"></i></span><strong>${escape(spell.name)}</strong><small>Lv ${rank}/${maximum} · ${rank >= maximum ? "MAX" : `${cost} ${currency}`}</small></button>`;
  }

  #talentCanvas() {
    const page = this.treePage === "magic" ? "magic" : "skills";
    const trees = talentTreePage(page);
    const board = trees.length
      ? `<div class="vr-cc-constellation-board" style="--tree-zoom:${this.treeZoom}">${trees.map(tree => this.#constellationBranch(tree)).join("")}</div>`
      : `<section class="vr-cc-tree-empty"><h2>${page === "magic" ? "Magic" : "Skills"} catalog not yet populated</h2><p>This canvas is ready for approved branches, leaves, prerequisites, and level requirements. No rules have been invented.</p></section>`;
    return `<section class="vr-cc-talent-canvas"><header class="vr-cc-talent-summary"><div><span>Talent Points</span><strong>${this.#treeAvailable("talent")} available</strong></div><div><span>Skill Points</span><strong>${this.#treeAvailable("skill")} available</strong></div><div><span>Rank cost</span><strong>${skillPointCostForLevel(this.state.startingLevel)} SP</strong></div><div class="vr-cc-tree-zoom"><button type="button" data-action="tree-zoom-out" title="Zoom out"><i class="fa-solid fa-minus"></i></button><strong>${Math.round(this.treeZoom * 100)}%</strong><button type="button" data-action="tree-zoom-in" title="Zoom in"><i class="fa-solid fa-plus"></i></button></div>${game.user.isGM ? `<button type="button" class="vr-cc-btn" data-action="add-tree-node"><i class="fa-solid fa-plus"></i><span>Author Node</span></button><button type="button" class="vr-cc-btn" data-action="manage-tree-traits"><i class="fa-solid fa-tags"></i><span>Traits</span></button>` : ""}</header><main class="vr-cc-tree-board">${board}</main><footer class="vr-cc-talent-switch"><button type="button" data-tree-page="skills" class="${page === "skills" ? "active" : ""}"><i class="fa-solid fa-crosshairs"></i><span>Skills</span></button><button type="button" data-tree-page="magic" class="${page === "magic" ? "active" : ""}"><i class="fa-solid fa-wand-sparkles"></i><span>Magic</span></button></footer>${this.authorNode ? this.#authorNodeMarkup() : ""}${this.traitEditorOpen ? this.#traitEditorMarkup() : ""}</section>`;
  }

  #constellationBranch(branch) {
    const unlocked = (this.state.talentTree?.branches ?? []).includes(branch.id);
    const leaves = branch.leaves ?? [];
    const lines = leaves.map(leaf => {
      const prerequisite = leaves.find(candidate => candidate.id === leaf.requires?.[0]);
      const source = prerequisite ?? branch;
      const dx = (number(leaf.x, 50) - number(source.x, 50)) * 7.6;
      const dy = (number(leaf.y, 50) - number(source.y, 50)) * 6.2;
      return `<i class="vr-cc-constellation-line" style="--x1:${number(source.x, 50)}%;--y1:${number(source.y, 50)}%;--line-width:${Math.hypot(dx, dy).toFixed(1)}px;--line-angle:${Math.atan2(dy, dx)}rad;--tree-color:${escape(branch.color ?? "#67e8f9")}"></i>`;
    }).join("");
    const drag = game.user.isGM ? `draggable="true" data-tree-drag="branch:${escape(branch.id)}"` : "";
    const root = `<button type="button" class="vr-cc-constellation-node root ${unlocked ? "purchased" : ""}" style="--node-x:${number(branch.x, 50)}%;--node-y:${number(branch.y, 50)}%;--tree-color:${escape(branch.color ?? "#67e8f9")}" data-tree-branch="${escape(branch.id)}" ${drag} title="${escape(branch.name)}"><i class="fa-solid fa-satellite-dish"></i><span>${escape(branch.name)}</span></button>`;
    const nodes = leaves.map(leaf => {
      const entry = (this.state.talentTree?.leaves ?? []).find(candidate => candidate.id === leaf.id);
      const requirementsMet = (leaf.requires ?? []).every(id => (this.state.talentTree?.leaves ?? []).some(candidate => candidate.id === id));
      const levelMet = this.state.startingLevel >= Math.max(1, number(leaf.requiredLevel, 1));
      const enabled = unlocked && requirementsMet && levelMet;
      const action = entry ? `data-tree-rank="${escape(leaf.id)}"` : `data-tree-leaf="${escape(leaf.id)}"`;
      const leafDrag = game.user.isGM ? `draggable="true" data-tree-drag="leaf:${escape(branch.id)}:${escape(leaf.id)}"` : "";
      return `<button type="button" class="vr-cc-constellation-node ${entry ? "purchased" : ""} ${enabled ? "available" : "locked"}" style="--node-x:${number(leaf.x, 50)}%;--node-y:${number(leaf.y, 50)}%;--tree-color:${escape(branch.color ?? "#67e8f9")}" ${action} ${leafDrag} ${!entry && !enabled && !game.user.isGM ? "disabled" : ""} title="${escape(`${leaf.name} · ${(leaf.traits ?? []).join(", ") || "No traits"}`)}"><i class="fa-solid ${leaf.type === "ability" ? "fa-burst" : "fa-wand-sparkles"}"></i><span>${escape(leaf.name)}</span><small>${entry ? `R${entry.rank}` : `${Math.max(0, number(leaf.talentCost, 1))} TP`}</small></button>`;
    }).join("");
    return `<section class="vr-cc-constellation-school">${lines}${root}${nodes}</section>`;
  }

  #authorNodeMarkup() {
    return this.#authorNodeMarkupV2();
  }

  #traitEditorMarkup() {
    const traits = game.settings.get(game.system.id, "actionTraits") ?? [];
    const used = new Set([
      ...["skills", "magic"].flatMap(page => talentTreePage(page).flatMap(school => (school.practices ?? []).flatMap(practice => (practice.spells ?? []).flatMap(spell => spell.traits ?? [])))),
      ...(game.items?.contents ?? []).flatMap(item => item.system?.traits ?? []),
      ...(game.actors?.contents ?? []).flatMap(actor => actor.items.contents.flatMap(item => item.system?.traits ?? []))
    ]);
    return `<div class="vr-cc-author-shade"><section class="vr-cc-author-panel vr-cc-trait-manager"><header><div><span>GM Authoring</span><h2>Action Traits</h2></div><button type="button" class="vr-cc-icon" data-action="close-tree-traits"><i class="fa-solid fa-xmark"></i></button></header><div class="vr-cc-trait-list">${traits.map((trait, index) => `<label><input name="traitLabels.${index}" value="${escape(trait.label)}" /><span>${escape(trait.id)}</span><button type="button" class="vr-cc-icon" data-action="retire-tree-trait" data-index="${index}" title="${trait.retired ? "Restore" : "Retire"}"><i class="fa-solid ${trait.retired ? "fa-rotate-left" : "fa-eye-slash"}"></i></button><button type="button" class="vr-cc-icon" data-action="delete-tree-trait" data-index="${index}" ${used.has(trait.id) ? "disabled" : ""} title="${used.has(trait.id) ? "Trait is in use" : "Delete unused trait"}"><i class="fa-solid fa-trash"></i></button></label>`).join("")}</div><footer><input name="newTraitLabel" placeholder="New trait" /><button type="button" class="vr-cc-btn" data-action="add-tree-trait">Add</button><button type="button" class="vr-cc-btn primary" data-action="save-tree-traits">Save</button></footer></section></div>`;
  }

  #drawTalentSkillCanvas() {
    const page = this.treePage === "magic" ? "magic" : "skills";
    const trees = talentTreePage(page);
    this.root.innerHTML = `
      <div class="vr-cc-tree-canvas">
        <header class="vr-cc-tree-header">
          <div>
            <span>Character Generation</span>
            <h1>Talents & Skills</h1>
          </div>
          <button type="button" class="vr-cc-icon" data-action="close-tree-canvas" title="Return"><i class="fa-solid fa-arrow-left"></i></button>
        </header>
        <nav class="vr-cc-tree-tabs"><button type="button" data-tree-page="skills" class="${page === "skills" ? "active" : ""}">Skills</button><button type="button" data-tree-page="magic" class="${page === "magic" ? "active" : ""}">Magic</button></nav>
        <main class="vr-cc-tree-board">${trees.length ? trees.map(tree => `<section class="vr-cc-tree-column"><h2>${escape(tree.name)}</h2>${(tree.branches ?? []).map(branch => this.#treeBranchMarkup(branch)).join("")}</section>`).join("") : `<section class="vr-cc-tree-empty"><h2>${page === "magic" ? "Magic" : "Skills"} catalog not yet populated</h2><p>This canvas is ready for approved branches, leaves, prerequisites, and level requirements. No rules have been invented.</p></section>`}</main>
        <footer class="vr-cc-tree-footer">
          <div>${(this.state.talentTree?.leaves ?? []).length} leaves purchased</div>
          <button type="button" class="vr-cc-btn primary" data-action="confirm-tree-canvas"><i class="fa-solid fa-check"></i><span>Confirm Selections</span></button>
        </footer>
      </div>`;
  }

  #creditsStep() {
    const products = VEILRUNNER_STARTER_STORE;
    return `<section class="vr-cc-storefront"><header><span>Starter Storefront</span><h2>Purchases</h2><p>${escape(String(this.state.credits ?? 0))} credits available. Inventory is created only when character generation is confirmed.</p></header>${products.length ? `<div class="vr-cc-store-grid"></div>` : `<div class="vr-cc-store-empty"><i class="fa-solid fa-store"></i><h3>Starter catalog not yet populated</h3><p>Approved products, prices, descriptions, and item definitions will appear here. No inventory has been invented.</p></div>`}</section>`;
  }

  #contactsStep() {
    const contacts = this.state.contacts ?? [];
    const selected = Math.min(Math.max(0, number(this.state.contactFocus)), Math.max(0, contacts.length - 1));
    const contact = contacts[selected];
    return `<section class="vr-cc-contacts"><header><span>Starting Contacts</span><h2>Choose a card, then enter that contact's details.</h2></header>
      <div class="vr-cc-contact-cards">${contacts.map((entry, index) => `<button type="button" class="vr-cc-reference-card ${index === selected ? "active" : ""}" data-contact-choice="${index}"><span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-solid fa-address-book"></i></span><span class="vr-cc-choice-name">${escape(entry.name || entry.role || `Contact ${index + 1}`)}</span></button>`).join("")}
        <button type="button" class="vr-cc-reference-card vr-cc-contact-add" data-action="add-contact"><span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-solid fa-plus"></i></span><span class="vr-cc-choice-name">Add Contact</span></button></div>
      ${contact ? `<article class="vr-cc-contact"><label><span>Name</span><input name="contacts.${selected}.name" value="${escape(contact.name)}" /></label><label><span>Role</span><input name="contacts.${selected}.role" value="${escape(contact.role)}" /></label><label><span>Disposition</span><input name="contacts.${selected}.disposition" value="${escape(contact.disposition)}" /></label><label><span>Notes</span><input name="contacts.${selected}.notes" value="${escape(contact.notes)}" /></label></article>` : `<p class="vr-cc-contact-empty">Select Add Contact to create your first contact card.</p>`}
    </section>`;
  }

  #bioStep() {
    return `<div class="vr-cc-bio-sections">
      <section><h2>Identity</h2><div class="vr-cc-grid two">
        ${this.#field("name", "Character Name")}${this.#field("pronouns", "Pronouns")}${this.#field("age", "Age")}${this.#field("size", "Size")}
        ${this.#textareaOnly("appearance", "Appearance", "Visual details, style, notable gear.")}${this.#textareaOnly("personality", "Personality", "Mannerisms, values, first impressions.")}${this.#textareaOnly("history", "History", "Important past events and current motives.")}
      </div></section>
    </div>`;
  }

  #treeBranchMarkup(branch) {
    const unlocked = (this.state.talentTree?.branches ?? []).includes(branch.id);
    const requirements = branch.requires ?? [];
    const met = requirements.every(id => (this.state.talentTree?.branches ?? []).includes(id));
    return `<section class="vr-cc-tree-branch"><header><div><h3>${escape(branch.name)}</h3><p>${escape(branch.description ?? "")}</p></div><button type="button" class="vr-cc-btn" data-tree-branch="${escape(branch.id)}" ${unlocked || !met ? "disabled" : ""}>${unlocked ? "Unlocked" : `Unlock · ${Math.max(1, number(branch.talentCost, 1))} TP`}</button></header>${requirements.length ? `<small>Requires branches: ${escape(requirements.join(", "))}</small>` : ""}<div class="vr-cc-tree-nodes">${(branch.leaves ?? []).map(leaf => this.#treeLeafMarkup(branch, leaf, unlocked)).join("")}</div></section>`;
  }

  #treeLeafMarkup(branch, leaf, branchUnlocked) {
    const entry = (this.state.talentTree?.leaves ?? []).find(candidate => candidate.id === leaf.id);
    const requirementsMet = (leaf.requires ?? []).every(id => (this.state.talentTree?.leaves ?? []).some(candidate => candidate.id === id));
    const levelMet = this.state.startingLevel >= Math.max(1, number(leaf.requiredLevel, 1));
    const canUnlock = branchUnlocked && requirementsMet && levelMet;
    const rankCost = skillPointCostForLevel(this.state.startingLevel);
    return `<article class="vr-cc-tree-node ${entry ? "active" : ""}"><strong>${escape(leaf.name)}</strong><p>${escape(leaf.description ?? "")}</p><small>${entry ? `Rank ${entry.rank}` : `Unlock: ${Math.max(1, number(leaf.talentCost, 1))} TP`}${leaf.requiredLevel ? ` · Level ${leaf.requiredLevel}` : ""}</small><div>${entry ? `<button type="button" class="vr-cc-btn" data-tree-rank="${escape(leaf.id)}" ${entry.rank >= Math.max(1, number(leaf.maxRank, 5)) ? "disabled" : ""}>Rank +1 · ${rankCost} SP</button>` : `<button type="button" class="vr-cc-btn" data-tree-leaf="${escape(leaf.id)}" ${canUnlock ? "" : "disabled"}>Purchase</button>`}</div></article>`;
  }

  #treeCatalogEntry(id, kind) {
    for (const page of ["skills", "magic"]) for (const school of talentTreePage(page)) {
      if ((kind === "school" || kind === "branch") && school.id === id) return { page, school, branch: school };
      for (const practice of school.practices ?? []) {
        if ((kind === "practice" || kind === "branch") && practice.id === id) return { page, school, practice, branch: practice };
        const spell = (practice.spells ?? []).find(candidate => candidate.id === id);
        if ((kind === "spell" || kind === "leaf") && spell) return { page, school, practice, spell, branch: practice, leaf: spell };
      }
    }
    return null;
  }

  #treeSpent(tree = this.state.talentTree) {
    let talent = 0;
    let skill = 0;
    for (const id of tree?.branches ?? []) {
      const practice = this.#treeCatalogEntry(id, "practice")?.practice;
      if (practice) talent += Math.max(1, number(practice.talentCost, 1));
    }
    for (const entry of tree?.leaves ?? []) {
      const spell = this.#treeCatalogEntry(entry.id, "spell")?.spell;
      if (spell) {
        talent += Math.max(1, number(spell.talentCost, 1));
        skill += Math.max(0, number(entry.rank) - 1) * Math.max(0, number(spell.rankCost, skillPointCostForLevel(this.state.startingLevel)));
      }
    }
    return { talent, skill };
  }

  #authorTreeNode(source = null) {
    if (!game.user.isGM) return;
    this.#authorTreeNodeV2(source);
  }

  async #saveAuthoredTreeNode() {
    return this.#saveAuthoredTreeNodeV2();
  }

  #authorTreeNodeV2(source = null) {
    const page = this.treePage === "magic" ? "magic" : "skills";
    const kind = source?.spell ? "spell" : source?.practice ? "practice" : source?.school ? "school" : "spell";
    const node = source?.spell ?? source?.practice ?? source?.school ?? {};
    this.authorNode = {
      nodeKind: kind, editId: node.id ?? "", schoolId: source?.school?.id ?? "", practiceId: source?.practice?.id ?? "",
      name: node.name ?? "", color: source?.school?.color ?? "#8b5cf6", shape: node.shape ?? (kind === "school" ? "pentagon" : kind === "practice" ? "diamond" : "diamond"), x: number(node.x, 500), y: number(node.y, 300),
      type: node.type ?? "action", category: node.category ?? (page === "magic" ? "magic" : "actions"), actions: node.type === "ability" ? 0 : number(node.actions, 1),
      traitsText: (node.traits ?? []).join(", "), mana: number(node.resourceCosts?.mana), stamina: number(node.resourceCosts?.stamina), health: number(node.resourceCosts?.health),
      talentCost: number(node.talentCost, 1), rankCost: number(node.rankCost, 1), maxRank: number(node.maxRank, 20), requiredLevel: number(node.requiredLevel, 1),
      requiresText: treeRequirementsText(node.requires), img: node.img ?? "", description: node.description ?? "",
      effectScope: node.effects?.[0]?.scope ?? "actor", effectTarget: node.effects?.[0]?.target ?? "", effectValue: node.effects?.[0]?.value ?? "", effectDuration: node.effects?.[0]?.duration ?? ""
    };
    this.#draw();
  }

  #authorNodeMarkupV2() {
    const node = this.authorNode;
    const schools = talentTreePage(this.treePage);
    const practices = schools.flatMap(school => (school.practices ?? []).map(practice => ({ ...practice, schoolId: school.id, schoolName: school.name })));
    const traits = game.settings.get(game.system.id, "actionTraits") ?? [];
    const spellFields = node.nodeKind === "spell" ? `<label>Action Kind<select name="authorNode.type"><option value="action">Action</option><option value="ability" ${node.type === "ability" ? "selected" : ""}>Ability (0 AP)</option></select></label><label>Category<select name="authorNode.category">${["actions", "reactions", "magic", "tech"].map(value => `<option value="${value}" ${node.category === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>Action Points<input type="number" name="authorNode.actions" value="${number(node.actions)}" min="0" ${node.type === "ability" ? "max=\"0\"" : ""} /></label><label>Traits<input name="authorNode.traitsText" value="${escape(node.traitsText)}" list="vr-action-traits" /></label><datalist id="vr-action-traits">${traits.filter(entry => !entry.retired).map(entry => `<option value="${escape(entry.label)}"></option>`).join("")}</datalist><label>Mana Cost<input type="number" name="authorNode.mana" value="${number(node.mana)}" min="0" /></label><label>Stamina Cost<input type="number" name="authorNode.stamina" value="${number(node.stamina)}" min="0" /></label><label>Health Cost<input type="number" name="authorNode.health" value="${number(node.health)}" min="0" /></label><label>First Purchase<input type="number" name="authorNode.talentCost" value="${number(node.talentCost, 1)}" min="1" /> TP</label><label>SP per Later Level<input type="number" name="authorNode.rankCost" value="${number(node.rankCost, 1)}" min="0" /></label><label>Maximum Level<input type="number" name="authorNode.maxRank" value="${number(node.maxRank, 20)}" min="1" max="20" /></label><label>Artwork<input name="authorNode.img" value="${escape(node.img)}" /></label><fieldset class="wide"><legend>Actor or Area Effect</legend><label>Scope<select name="authorNode.effectScope"><option value="actor">Actor</option><option value="area" ${node.effectScope === "area" ? "selected" : ""}>Area</option></select></label><label>Target<input name="authorNode.effectTarget" value="${escape(node.effectTarget)}" /></label><label>Value<input name="authorNode.effectValue" value="${escape(node.effectValue)}" /></label><label>Duration<input name="authorNode.effectDuration" value="${escape(node.effectDuration)}" /></label></fieldset>` : "";
    return `<div class="vr-cc-author-shade"><form class="vr-cc-author-panel"><header><div><span>Shared GM Authoring</span><h2>${node.editId ? "Edit" : "Create"} Tree Node</h2></div><button type="button" class="vr-cc-icon" data-action="cancel-tree-node"><i class="fa-solid fa-xmark"></i></button></header><div class="vr-cc-author-grid"><label>Node Type<select name="authorNode.nodeKind"><option value="school" ${node.nodeKind === "school" ? "selected" : ""}>School</option><option value="practice" ${node.nodeKind === "practice" ? "selected" : ""}>Practice</option><option value="spell" ${node.nodeKind === "spell" ? "selected" : ""}>${this.treePage === "magic" ? "Spell" : "Skill"}</option></select></label>${node.nodeKind !== "school" ? `<label>School<select name="authorNode.schoolId"><option value="">Select School</option>${schools.map(school => `<option value="${escape(school.id)}" ${node.schoolId === school.id ? "selected" : ""}>${escape(school.name)}</option>`).join("")}</select></label>` : ""}${node.nodeKind === "spell" ? `<label>Practice<select name="authorNode.practiceId"><option value="">Select Practice</option>${practices.filter(practice => !node.schoolId || practice.schoolId === node.schoolId).map(practice => `<option value="${escape(practice.id)}" ${node.practiceId === practice.id ? "selected" : ""}>${escape(practice.schoolName)} / ${escape(practice.name)}</option>`).join("")}</select></label>` : ""}<label>Title<input name="authorNode.name" value="${escape(node.name)}" required /></label>${node.nodeKind === "school" ? `<label>School Color<input name="authorNode.color" type="color" value="${escape(node.color)}" /></label>` : ""}<label>X<input name="authorNode.x" type="number" value="${number(node.x)}" /></label><label>Y<input name="authorNode.y" type="number" value="${number(node.y)}" /></label>${node.nodeKind === "practice" ? `<label>Talent Point Cost<input type="number" name="authorNode.talentCost" value="${number(node.talentCost, 1)}" min="1" /></label>` : ""}${node.nodeKind !== "school" ? `<label>Required Character Level<input type="number" name="authorNode.requiredLevel" value="${number(node.requiredLevel, 1)}" min="1" /></label><label>${node.nodeKind === "spell" ? "Spell Prerequisites" : "Practice Prerequisite IDs"}<input name="authorNode.requiresText" value="${escape(node.requiresText)}" placeholder="${node.nodeKind === "spell" ? "firebolt:5, other-spell:3" : "practice-id, cross-school-id"}" /></label>` : ""}${spellFields}<label class="wide">Description<textarea name="authorNode.description">${escape(node.description)}</textarea></label></div><footer>${node.editId ? `<button type="button" class="vr-cc-btn danger" data-action="delete-tree-node"><i class="fa-solid fa-trash"></i><span>Delete Node</span></button>` : ""}<button type="button" class="vr-cc-btn primary" data-action="save-tree-node"><i class="fa-solid fa-floppy-disk"></i><span>Save Shared Node</span></button></footer></form></div>`;
  }

  async #saveAuthoredTreeNodeV2() {
    if (!game.user.isGM) return;
    this.#saveVisibleInputs();
    const source = this.authorNode;
    if (!source) return;
    const name = String(source.name ?? "").trim();
    if (!name) return ui.notifications.warn("Enter a node title.");
    const page = this.treePage === "magic" ? "magic" : "skills";
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const schools = catalog[page] ?? (catalog[page] = []);
    const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "node";
    const uniqueId = (base, used) => { let id = slug(base); let n = 2; while (used.has(id)) id = `${slug(base)}-${n++}`; return id; };
    let savedNode;
    if (source.nodeKind === "school") {
      savedNode = schools.find(entry => entry.id === source.editId);
      if (!savedNode) { savedNode = { id: uniqueId(name, new Set(schools.map(entry => entry.id))), practices: [] }; schools.push(savedNode); }
      Object.assign(savedNode, { name, color: source.color || "#8b5cf6", shape: ["circle", "hex", "pentagon", "square", "diamond"].includes(source.shape) ? source.shape : "pentagon", x: number(source.x, 500), y: number(source.y, 120) });
    } else {
      const school = schools.find(entry => entry.id === source.schoolId);
      if (!school) return ui.notifications.warn("Select a School.");
      school.practices ??= [];
      if (source.nodeKind === "practice") {
        savedNode = school.practices.find(entry => entry.id === source.editId);
        const used = new Set(schools.flatMap(entry => entry.practices ?? []).map(entry => entry.id));
        if (!savedNode) { savedNode = { id: uniqueId(name, used), spells: [] }; school.practices.push(savedNode); }
        const previousRequirementLines = new Map((savedNode.requires ?? []).map(value => { const requirement = treeRequirement(value); return [requirement.id, requirement.line]; }));
        Object.assign(savedNode, { name, shape: ["circle", "hex", "pentagon", "square", "diamond"].includes(source.shape) ? source.shape : "diamond", x: number(source.x, 500), y: number(source.y, 390), talentCost: Math.max(1, number(source.talentCost, 1)), requiredLevel: Math.max(1, number(source.requiredLevel, 1)), requires: listFromText(source.requiresText), description: String(source.description ?? "") });
        savedNode.requires = savedNode.requires.map(value => ({ ...treeRequirement(value), line: previousRequirementLines.get(treeRequirement(value).id) ?? {} }));
      } else {
        const practice = school.practices.find(entry => entry.id === source.practiceId);
        if (!practice) return ui.notifications.warn("Select a Practice.");
        practice.spells ??= [];
        savedNode = practice.spells.find(entry => entry.id === source.editId);
        const used = new Set(schools.flatMap(entry => entry.practices ?? []).flatMap(entry => entry.spells ?? []).map(entry => entry.id));
        if (!savedNode) { savedNode = { id: uniqueId(name, used) }; practice.spells.push(savedNode); }
        const registry = game.settings.get(game.system.id, "actionTraits") ?? [];
        const traitIds = new Map(registry.flatMap(entry => [[String(entry.id).toLowerCase(), entry.id], [String(entry.label).toLowerCase(), entry.id]]));
        const traits = listFromText(source.traitsText).map(value => traitIds.get(value.toLowerCase()) ?? slug(value));
        const type = source.type === "ability" ? "ability" : "action";
        const category = ["actions", "reactions", "magic", "tech"].includes(source.category) ? source.category : (page === "magic" ? "magic" : "actions");
        const previousRequirementLines = new Map((savedNode.requires ?? []).map(value => { const requirement = treeRequirement(value); return [requirement.id, requirement.line]; }));
        Object.assign(savedNode, { name, x: number(source.x, number(practice.x) + 105), y: number(source.y, number(practice.y) + 138), type, category, actions: type === "ability" ? 0 : Math.max(1, number(source.actions, 1)), traits: [...new Set(traits)], img: String(source.img ?? ""), description: String(source.description ?? ""), talentCost: Math.max(1, number(source.talentCost, 1)), rankCost: Math.max(0, number(source.rankCost, 1)), maxRank: Math.min(20, Math.max(1, number(source.maxRank, 20))), requiredLevel: Math.max(1, number(source.requiredLevel, 1)), requires: treeRequirementsFromText(source.requiresText), resourceCosts: { mana: Math.max(0, number(source.mana)), stamina: Math.max(0, number(source.stamina)), health: Math.max(0, number(source.health)) }, effects: source.effectTarget ? [{ scope: source.effectScope === "area" ? "area" : "actor", target: String(source.effectTarget), value: String(source.effectValue ?? ""), duration: String(source.effectDuration ?? ""), notes: "" }] : [] });
        savedNode.requires = savedNode.requires.map(requirement => ({ ...requirement, line: previousRequirementLines.get(requirement.id) ?? requirement.line }));
        savedNode.shape = ["circle", "hex", "pentagon", "square", "diamond"].includes(source.shape) ? source.shape : (type === "ability" ? "hex" : "diamond");
        const itemRequires = savedNode.requires.map(value => { const requirement = treeRequirement(value); return `${requirement.id}:${requirement.level}`; });
        const itemData = { name, type: "action", img: savedNode.img || "icons/svg/light.svg", system: { activationKind: type, category, actionType: category === "reactions" ? "reaction" : "standard", actions: savedNode.actions, currentLevel: 1, maxLevel: savedNode.maxRank, traits: savedNode.traits, resourceCosts: savedNode.resourceCosts, effects: savedNode.effects, tree: { enabled: true, page, school: school.name, practice: practice.name, x: savedNode.x, y: savedNode.y, requires: itemRequires, talentCost: savedNode.talentCost, rankCost: savedNode.rankCost, requiredLevel: savedNode.requiredLevel }, description: savedNode.description } };
        let actionDocument = savedNode.sourceUuid ? await fromUuid(savedNode.sourceUuid) : null;
        if (actionDocument?.documentName === "Item") await actionDocument.update(itemData);
        else { actionDocument = await Item.create(itemData, { renderSheet: false }); savedNode.sourceUuid = actionDocument.uuid; }
        await this.#registerCustomTraits(traits);
      }
    }
    await saveTalentTreeCatalog(catalog);
    this.authorNode = null;
    this.#draw();
  }

  async #deleteAuthoredTreeNodeV2() {
    if (!game.user.isGM) return;
    const source = this.authorNode;
    if (!source?.editId) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({ window: { title: "Delete Shared Tree Node" }, content: `<p>Delete <strong>${escape(source.name)}</strong> from the shared ${escape(this.treePage)} catalog?</p>`, modal: true });
    if (!confirmed) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const schools = catalog[this.treePage] ?? [];
    const allPractices = schools.flatMap(school => school.practices ?? []);
    const allSpells = allPractices.flatMap(practice => practice.spells ?? []);
    const requiredBy = [...allPractices, ...allSpells].filter(node => (node.requires ?? []).some(value => treeRequirement(value).id === source.editId));
    if (requiredBy.length) return ui.notifications.warn(`Remove this prerequisite from ${requiredBy.map(node => node.name).join(", ")} first.`);
    if (source.nodeKind === "school") {
      const school = schools.find(entry => entry.id === source.editId);
      if (school?.practices?.length) return ui.notifications.warn("Delete or move this School's Practices first.");
      catalog[this.treePage] = schools.filter(entry => entry.id !== source.editId);
    } else if (source.nodeKind === "practice") {
      const school = schools.find(entry => entry.id === source.schoolId);
      const practice = school?.practices?.find(entry => entry.id === source.editId);
      if (practice?.spells?.length) return ui.notifications.warn("Delete or move this Practice's Spells first.");
      if (school) school.practices = school.practices.filter(entry => entry.id !== source.editId);
    } else {
      const practice = allPractices.find(entry => entry.id === source.practiceId);
      const spell = practice?.spells?.find(entry => entry.id === source.editId);
      const actionDocument = spell?.sourceUuid ? await fromUuid(spell.sourceUuid) : null;
      if (practice) practice.spells = practice.spells.filter(entry => entry.id !== source.editId);
      if (actionDocument?.documentName === "Item") await actionDocument.delete();
    }
    await saveTalentTreeCatalog(catalog);
    this.authorNode = null;
    this.#draw();
  }

  async #registerCustomTraits(ids) {
    const traits = foundry.utils.deepClone(game.settings.get(game.system.id, "actionTraits") ?? []);
    const known = new Set(traits.map(entry => entry.id));
    for (const id of ids) if (!known.has(id)) traits.push({ id, label: id.replace(/(^|-)\w/g, value => value.toUpperCase()), retired: false });
    await game.settings.set(game.system.id, "actionTraits", traits);
  }

  async #addTreeTrait() {
    const label = String(this.root.querySelector('[name="newTraitLabel"]')?.value ?? "").trim();
    if (!label) return;
    await this.#registerCustomTraits([label.toLowerCase().replace(/[^a-z0-9]+/g, "-")]);
    this.#draw();
  }

  async #saveTreeTraits() {
    const traits = foundry.utils.deepClone(game.settings.get(game.system.id, "actionTraits") ?? []);
    for (const input of this.root.querySelectorAll('[name^="traitLabels."]')) {
      const index = number(input.name.split(".")[1], -1);
      if (traits[index]) traits[index].label = String(input.value ?? "").trim() || traits[index].label;
    }
    await game.settings.set(game.system.id, "actionTraits", traits);
    this.traitEditorOpen = false;
    this.#draw();
  }

  async #deleteAuthoredTreeNode() {
    return this.#deleteAuthoredTreeNodeV2();
  }

  #onTreeWheel(event) {
    const board = event.target.closest?.(".vr-cc-tree-board");
    if (!board) return;
    event.preventDefault();
    const previous = this.treeZoom;
    const next = Math.max(.35, Math.min(1.8, previous * (event.deltaY < 0 ? 1.1 : .9)));
    if (Math.abs(next - previous) < .001) return;
    const rect = board.getBoundingClientRect();
    const worldX = (board.scrollLeft + event.clientX - rect.left) / previous;
    const worldY = (board.scrollTop + event.clientY - rect.top) / previous;
    this.treeZoom = next;
    const world = board.querySelector(".vr-cc-tree-world");
    const frame = board.querySelector(".vr-cc-tree-world-frame");
    if (world && frame) {
      world.style.setProperty("--tree-zoom", next);
      const width = number(world.dataset.worldWidth, 10000);
      const height = number(world.dataset.worldHeight, 6000);
      frame.style.width = `${width * next}px`;
      frame.style.height = `${height * next}px`;
      board.scrollLeft = worldX * next - (event.clientX - rect.left);
      board.scrollTop = worldY * next - (event.clientY - rect.top);
      const readout = this.root.querySelector(".vr-cc-tree-pools > small");
      if (readout) readout.textContent = `${Math.round(next * 100)}%`;
    }
  }

  #onTreePanStart(event) {
    if (event.button !== 0) return;
    const scroller = event.target.closest?.(".vr-cc-tree-board");
    if (!scroller) return;
    const socket = event.target.closest?.("[data-tree-socket]");
    if (game.user.isGM && this.connectionTool.active && socket) {
      const layer = socket.closest(".vr-cc-node-socket-layer");
      const source = this.#connectionNodeRecord(layer);
      const world = layer?.closest(".vr-cc-tree-world");
      const svg = world?.querySelector(".vr-cc-tree-links");
      if (!source || !world || !svg) return;
      const preview = document.createElementNS("http://www.w3.org/2000/svg", "path");
      preview.classList.add("vr-cc-tree-link", "connection-preview", `pattern-${this.connectionTool.pattern}`);
      const style = this.#authoredConnectionStyle();
      preview.setAttribute("style", style.css ?? `--tree-color:${style.color || "#ffffff"};--line-width:${style.thickness};--line-glow:${style.glow}`);
      svg.append(preview);
      this.connectionTool.sourceAnchor = socket.dataset.treeSocket;
      this.connectionDrag = { source, layer, socket, world, scroller, preview, start: this.#treePointerPosition(event, world), moved: false };
      socket.classList.add("drag-source");
      this.root.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    const dragTarget = game.user.isGM && this.nodeMoveMode && !this.connectionTool.active ? event.target.closest?.("[data-tree-drag]") : null;
    if (dragTarget) {
      const world = dragTarget.closest(".vr-cc-tree-world");
      const [kind, schoolId, practiceId, spellId] = dragTarget.dataset.treeDrag.split(":");
      const record = kind === "root" ? { node: talentTreeRoot(this.treePage) } : this.#treeCatalogEntry(kind === "spell" ? spellId : kind === "practice" ? practiceId : schoolId, kind);
      const node = kind === "spell" ? record?.spell : kind === "practice" ? record?.practice : kind === "school" ? record?.school : record?.node;
      if (!world || !node) return;
      const guideX = document.createElement("i");
      const guideY = document.createElement("i");
      const coordinate = document.createElement("output");
      guideX.className = "vr-cc-drag-guide-x";
      guideY.className = "vr-cc-drag-guide-y";
      coordinate.className = "vr-cc-drag-coordinate";
      world.append(guideX, guideY, coordinate);
      const children = kind === "practice" ? [...world.querySelectorAll("[data-tree-rank], .vr-cc-external-requirement")].map(element => ({ element, x: number(element.style.left), y: number(element.style.top) })) : [];
      const selectionKey = dragTarget.dataset.treeDrag;
      const wasSelected = this.selectedTreeNodes.has(selectionKey);
      if (!wasSelected) {
        if (!event.shiftKey) {
          this.selectedTreeNodes.clear();
          for (const selected of world.querySelectorAll("[data-tree-drag].multi-selected")) selected.classList.remove("multi-selected");
          for (const marker of world.querySelectorAll(".vr-cc-node-selection-marker")) marker.remove();
        }
        this.selectedTreeNodes.add(selectionKey);
        dragTarget.classList.add("multi-selected");
        this.#addTreeSelectionMarker(dragTarget, world);
      }
      this.treeNodeDrag = { target: dragTarget, world, scroller, kind, schoolId, practiceId, spellId, selectionKey, wasSelected, additiveSelection: event.shiftKey, startX: event.clientX, startY: event.clientY, startScrollLeft: scroller.scrollLeft, startScrollTop: scroller.scrollTop, nodeX: number(node.x), nodeY: number(node.y), x: number(node.x), y: number(node.y), moved: false, guideX, guideY, coordinate, children };
      dragTarget.classList.add("node-dragging");
      scroller.classList.add("node-moving");
      this.root.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.target.closest?.("button, input, select, textarea")) return;
    this.treePan = { scroller, x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
    scroller.classList.add("panning");
    this.root.setPointerCapture?.(event.pointerId);
  }

  #onTreePanMove(event) {
    if (this.connectionDrag) {
      const drag = this.connectionDrag;
      const end = this.#treePointerPosition(event, drag.world);
      drag.moved ||= Math.hypot(end.x - drag.start.x, end.y - drag.start.y) > 4;
      drag.preview.setAttribute("d", this.#treePointPath(drag.start, end, number(this.connectionTool.bend)));
      for (const item of this.root.querySelectorAll(".vr-cc-node-socket.drop-target")) item.classList.remove("drop-target");
      const candidate = document.elementsFromPoint(event.clientX, event.clientY).find(item => item.matches?.("[data-tree-socket]"));
      if (candidate && candidate !== drag.socket) candidate.classList.add("drop-target");
      return;
    }
    if (this.treeNodeDrag) {
      const drag = this.treeNodeDrag;
      const rect = drag.scroller.getBoundingClientRect();
      const edge = 56;
      const panX = event.clientX < rect.left + edge ? -Math.ceil((rect.left + edge - event.clientX) / 3) : event.clientX > rect.right - edge ? Math.ceil((event.clientX - (rect.right - edge)) / 3) : 0;
      const panY = event.clientY < rect.top + edge ? -Math.ceil((rect.top + edge - event.clientY) / 3) : event.clientY > rect.bottom - edge ? Math.ceil((event.clientY - (rect.bottom - edge)) / 3) : 0;
      if (panX) drag.scroller.scrollLeft = Math.max(0, drag.scroller.scrollLeft + panX);
      if (panY) drag.scroller.scrollTop = Math.max(0, drag.scroller.scrollTop + panY);
      const dx = (event.clientX - drag.startX + drag.scroller.scrollLeft - drag.startScrollLeft) / this.treeZoom;
      const dy = (event.clientY - drag.startY + drag.scroller.scrollTop - drag.startScrollTop) / this.treeZoom;
      drag.x = Math.max(0, Math.round(drag.nodeX + dx));
      drag.y = Math.max(0, Math.round(drag.nodeY + dy));
      drag.moved ||= Math.hypot(dx, dy) > 3;
      drag.target.style.left = `${drag.x}px`;
      drag.target.style.top = `${drag.y}px`;
      const selectionMarker = [...drag.world.querySelectorAll(".vr-cc-node-selection-marker")].find(marker => marker.dataset.selectionKey === drag.selectionKey);
      if (selectionMarker) { selectionMarker.style.left = `${drag.x}px`; selectionMarker.style.top = `${drag.y}px`; }
      for (const child of drag.children) { child.element.style.left = `${child.x + dx}px`; child.element.style.top = `${child.y + dy}px`; }
      drag.guideX.style.top = `${drag.y}px`;
      drag.guideY.style.left = `${drag.x}px`;
      drag.coordinate.style.left = `${drag.x + 18}px`;
      drag.coordinate.style.top = `${drag.y - 30}px`;
      drag.coordinate.textContent = `${drag.x}, ${drag.y}`;
      this.#refreshTreeLines(drag.world);
      this.#ensureTreeCanvasContains(drag.scroller, drag.x + 1200, drag.y + 900);
      return;
    }
    if (!this.treePan) return;
    this.treePan.scroller.scrollLeft = this.treePan.left - (event.clientX - this.treePan.x);
    this.treePan.scroller.scrollTop = this.treePan.top - (event.clientY - this.treePan.y);
    this.#expandTreeCanvasAtEdge(this.treePan.scroller);
  }

  #expandTreeCanvasAtEdge(scroller) {
    if (!game.user.isGM) return;
    const world = scroller.querySelector(".vr-cc-tree-world");
    const frame = scroller.querySelector(".vr-cc-tree-world-frame");
    const svg = world?.querySelector(".vr-cc-tree-links");
    if (!world || !frame || !svg) return;
    let width = number(world.dataset.worldWidth, 10000);
    let height = number(world.dataset.worldHeight, 6000);
    let changed = false;
    if (scroller.scrollLeft + scroller.clientWidth > frame.offsetWidth - 800) { width *= 2; changed = true; }
    if (scroller.scrollTop + scroller.clientHeight > frame.offsetHeight - 800) { height *= 2; changed = true; }
    if (!changed) return;
    this.treeCanvasDimensions[this.treePage] = { width, height };
    world.dataset.worldWidth = String(width);
    world.dataset.worldHeight = String(height);
    world.style.width = `${width}px`;
    world.style.height = `${height}px`;
    frame.style.width = `${width * this.treeZoom}px`;
    frame.style.height = `${height * this.treeZoom}px`;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  #ensureTreeCanvasContains(scroller, requestedWidth, requestedHeight) {
    const world = scroller.querySelector(".vr-cc-tree-world");
    const frame = scroller.querySelector(".vr-cc-tree-world-frame");
    const svg = world?.querySelector(".vr-cc-tree-links");
    if (!world || !frame || !svg) return;
    let width = number(world.dataset.worldWidth, 10000);
    let height = number(world.dataset.worldHeight, 6000);
    while (requestedWidth > width) width *= 2;
    while (requestedHeight > height) height *= 2;
    if (width === number(world.dataset.worldWidth) && height === number(world.dataset.worldHeight)) return;
    this.treeCanvasDimensions[this.treePage] = { width, height };
    world.dataset.worldWidth = String(width);
    world.dataset.worldHeight = String(height);
    world.style.width = `${width}px`;
    world.style.height = `${height}px`;
    frame.style.width = `${width * this.treeZoom}px`;
    frame.style.height = `${height * this.treeZoom}px`;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
  }

  #treePointerPosition(event, world) {
    const rect = world.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / this.treeZoom, y: (event.clientY - rect.top) / this.treeZoom };
  }

  #treePointPath(start, end, bend = 0) {
    if (!bend) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.min(360, distance * .45) * (Math.max(-100, Math.min(100, bend)) / 100);
    const nx = -dy / distance;
    const ny = dx / distance;
    return `M ${start.x} ${start.y} C ${start.x + dx / 3 + nx * offset} ${start.y + dy / 3 + ny * offset}, ${start.x + dx * 2 / 3 + nx * offset} ${start.y + dy * 2 / 3 + ny * offset}, ${end.x} ${end.y}`;
  }

  #refreshTreeLines(world) {
    const worldRect = world.getBoundingClientRect();
    const nodes = [...world.querySelectorAll("[data-tree-node-id]")];
    const geometry = id => {
      const node = nodes.find(entry => entry.dataset.treeNodeId === id);
      if (!node) return null;
      const visual = node.querySelector?.(".vr-cc-spell-glyph") ?? node;
      const rect = visual.getBoundingClientRect();
      const left = (rect.left - worldRect.left) / this.treeZoom;
      const top = (rect.top - worldRect.top) / this.treeZoom;
      const right = (rect.right - worldRect.left) / this.treeZoom;
      const bottom = (rect.bottom - worldRect.top) / this.treeZoom;
      return { left, top, right, bottom, cx: (left + right) / 2, cy: (top + bottom) / 2 };
    };
    for (const path of world.querySelectorAll(".vr-cc-tree-link[data-tree-source][data-tree-target]")) {
      const source = geometry(path.dataset.treeSource);
      const target = geometry(path.dataset.treeTarget);
      if (!source || !target) continue;
      const start = this.#treeAnchorPoint(source, path.dataset.sourceAnchor ?? "auto", target);
      const end = this.#treeAnchorPoint(target, path.dataset.targetAnchor ?? "auto", source);
      path.setAttribute("d", this.#treePointPath(start, end, number(path.dataset.lineBend)));
    }
  }

  async #onTreePanEnd(event) {
    if (this.connectionDrag) {
      const drag = this.connectionDrag;
      const targetSocket = document.elementsFromPoint(event.clientX, event.clientY).find(item => item.matches?.("[data-tree-socket]"));
      const targetLayer = targetSocket?.closest(".vr-cc-node-socket-layer");
      drag.preview.remove();
      drag.socket.classList.remove("drag-source");
      for (const item of this.root.querySelectorAll(".vr-cc-node-socket.drop-target")) item.classList.remove("drop-target");
      this.connectionDrag = null;
      this.root.releasePointerCapture?.(event.pointerId);
      if (drag.moved && targetLayer && targetLayer !== drag.layer) {
        this.connectionTool.source = drag.source;
        this.connectionTool.sourceAnchor = drag.socket.dataset.treeSocket;
        this.suppressTreeClick = true;
        setTimeout(() => { this.suppressTreeClick = false; }, 0);
        await this.#onConnectionNodeClick(targetLayer, targetSocket.dataset.treeSocket);
      }
      return;
    }
    if (this.treeNodeDrag) {
      const drag = this.treeNodeDrag;
      drag.target.classList.remove("node-dragging");
      drag.scroller.classList.remove("node-moving");
      drag.guideX.remove();
      drag.guideY.remove();
      drag.coordinate.remove();
      this.treeNodeDrag = null;
      this.root.releasePointerCapture?.(event.pointerId);
      this.suppressTreeClick = true;
      setTimeout(() => { this.suppressTreeClick = false; }, 0);
      if (drag.moved) {
        await this.#saveTreeNodePosition(drag);
      } else {
        if (drag.additiveSelection) {
          if (drag.wasSelected) this.selectedTreeNodes.delete(drag.selectionKey);
          else this.selectedTreeNodes.add(drag.selectionKey);
        } else {
          this.selectedTreeNodes.clear();
          this.selectedTreeNodes.add(drag.selectionKey);
        }
        this.#redrawTreePreservingViewport();
      }
      return;
    }
    if (!this.treePan) return;
    this.treePan.scroller.classList.remove("panning");
    this.treePan = null;
    this.root.releasePointerCapture?.(event.pointerId);
  }

  async #saveTreeNodePosition(drag) {
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const school = (catalog[this.treePage] ?? []).find(entry => entry.id === drag.schoolId);
    const practice = school?.practices?.find(entry => entry.id === drag.practiceId);
    const node = drag.kind === "root" ? catalog.roots?.[this.treePage] : drag.kind === "spell" ? practice?.spells?.find(entry => entry.id === drag.spellId) : drag.kind === "practice" ? practice : school;
    if (!node) return;
    const dx = drag.x - number(node.x);
    const dy = drag.y - number(node.y);
    node.x = drag.x;
    node.y = drag.y;
    if (drag.kind === "practice") for (const spell of node.spells ?? []) { spell.x = number(spell.x) + dx; spell.y = number(spell.y) + dy; }
    const viewport = this.#treeViewportSnapshot();
    await saveTalentTreeCatalog(catalog);
    this.#redrawTreePreservingViewport(viewport);
  }

  #catalogNodeForSelection(catalog, selectionKey) {
    const [kind, schoolId, practiceId, spellId] = String(selectionKey).split(":");
    const school = (catalog[this.treePage] ?? []).find(entry => entry.id === schoolId);
    const practice = school?.practices?.find(entry => entry.id === practiceId);
    const node = kind === "root" ? catalog.roots?.[this.treePage] : kind === "spell" ? practice?.spells?.find(entry => entry.id === spellId) : kind === "practice" ? practice : school;
    return node ? { kind, node, selectionKey } : null;
  }

  #moveSelectedCatalogNode(record, x, y) {
    const nextX = Math.max(0, Math.round(number(x, record.node.x)));
    const nextY = Math.max(0, Math.round(number(y, record.node.y)));
    const dx = nextX - number(record.node.x);
    const dy = nextY - number(record.node.y);
    record.node.x = nextX;
    record.node.y = nextY;
    if (record.kind === "practice") for (const spell of record.node.spells ?? []) {
      spell.x = number(spell.x) + dx;
      spell.y = number(spell.y) + dy;
    }
  }

  #selectedCatalogRecords(catalog) {
    return [...this.selectedTreeNodes].map(key => this.#catalogNodeForSelection(catalog, key)).filter(Boolean);
  }

  #ringSelectionRecords(catalog) {
    const root = talentTreeRoot(this.treePage);
    return this.#selectedCatalogRecords(catalog).filter(record => record.kind !== "root").sort((a, b) => Math.atan2(number(a.node.y) - number(root?.y), number(a.node.x) - number(root?.x)) - Math.atan2(number(b.node.y) - number(root?.y), number(b.node.x) - number(root?.x)));
  }

  async #saveSelectedNodeLayout(catalog, message) {
    const viewport = this.#treeViewportSnapshot();
    await saveTalentTreeCatalog(catalog);
    this.#redrawTreePreservingViewport(viewport);
    ui.notifications.info(message);
  }

  async #alignSelectedTreeNodes(axis) {
    if (!game.user.isGM || this.selectedTreeNodes.size < 2) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const records = this.#selectedCatalogRecords(catalog);
    if (records.length < 2) return ui.notifications.warn("Select at least two nodes on this canvas.");
    const property = axis === "vertical" ? "x" : "y";
    const target = Math.round(records.reduce((sum, record) => sum + number(record.node[property]), 0) / records.length);
    for (const record of records) {
      this.#moveSelectedCatalogNode(record, property === "x" ? target : record.node.x, property === "y" ? target : record.node.y);
    }
    await this.#saveSelectedNodeLayout(catalog, `Aligned ${records.length} nodes in a ${axis} line.`);
  }

  async #squareSelectedTreeNodes() {
    if (!game.user.isGM || this.selectedTreeNodes.size < 2) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const records = this.#selectedCatalogRecords(catalog).sort((a, b) => number(a.node.y) - number(b.node.y) || number(a.node.x) - number(b.node.x));
    if (records.length < 2) return;
    const columns = Math.ceil(Math.sqrt(records.length));
    const rows = Math.ceil(records.length / columns);
    const centerX = records.reduce((sum, record) => sum + number(record.node.x), 0) / records.length;
    const centerY = records.reduce((sum, record) => sum + number(record.node.y), 0) / records.length;
    const spacing = 180;
    for (let row = 0, index = 0; row < rows; row += 1) {
      const rowCount = Math.min(columns, records.length - index);
      for (let column = 0; column < rowCount; column += 1, index += 1) {
        const x = centerX + (column - (rowCount - 1) / 2) * spacing;
        const y = centerY + (row - (rows - 1) / 2) * spacing;
        this.#moveSelectedCatalogNode(records[index], x, y);
      }
    }
    await this.#saveSelectedNodeLayout(catalog, `Squared up ${records.length} nodes with equal 180-pixel center spacing.`);
  }

  async #spaceSelectedTreeNodes(axis) {
    if (!game.user.isGM || this.selectedTreeNodes.size < 3) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const property = axis === "vertical" ? "y" : "x";
    const records = this.#selectedCatalogRecords(catalog).sort((a, b) => number(a.node[property]) - number(b.node[property]));
    if (records.length < 3) return;
    const first = number(records[0].node[property]);
    const last = number(records.at(-1).node[property]);
    const interval = (last - first) / (records.length - 1);
    records.forEach((record, index) => this.#moveSelectedCatalogNode(record, property === "x" ? first + interval * index : record.node.x, property === "y" ? first + interval * index : record.node.y));
    await this.#saveSelectedNodeLayout(catalog, `Distributed ${records.length} nodes with equal ${axis} spacing.`);
  }

  async #placeSelectedTreeRing() {
    if (!game.user.isGM || this.openPracticeId) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const records = this.#ringSelectionRecords(catalog);
    if (records.length < 2) return ui.notifications.warn("Select at least two non-root nodes.");
    const root = catalog.roots?.[this.treePage] ?? talentTreeRoot(this.treePage);
    const radius = Math.max(180, Math.min(3000, number(this.treeRingTool.radius, 500)));
    const rotation = number(this.treeRingTool.rotation, -90) * Math.PI / 180;
    records.forEach((record, index) => {
      const angle = rotation + index * Math.PI * 2 / records.length;
      this.#moveSelectedCatalogNode(record, number(root.x) + Math.cos(angle) * radius, number(root.y) + Math.sin(angle) * radius);
    });
    this.treeRingTool.active = false;
    await this.#saveSelectedNodeLayout(catalog, `Placed ${records.length} nodes evenly on a ${radius}-pixel ring around ${root.name}.`);
  }

  async #onTreeContextMenu(event) {
    const target = event.target.closest?.("[data-tree-school], [data-tree-practice-card], [data-tree-rank]");
    if (!target) return;
    event.preventDefault();
    const id = target.dataset.treeSchool ?? target.dataset.treePracticeCard ?? target.dataset.treeRank;
    const kind = target.dataset.treeSchool ? "school" : target.dataset.treePracticeCard ? "practice" : "spell";
    if (kind === "practice" || kind === "spell") {
      const undone = await this.#undoCurrentTreePurchase(id, kind);
      if (undone) return;
      if (!game.user.isGM) return ui.notifications.warn("Only purchases or Spell levels added during this chargen or level-up session can be undone.");
    }
    if (!game.user.isGM) return;
    const source = this.#treeCatalogEntry(id, kind);
    if (source) this.#authorTreeNode(source);
  }

  async #undoCurrentTreePurchase(id, kind) {
    const viewport = this.#treeViewportSnapshot();
    if (kind === "spell") {
      const current = (this.state.talentTree?.leaves ?? []).find(entry => entry.id === id);
      const initialRank = Math.max(0, number((this.initialTalentTree?.leaves ?? []).find(entry => entry.id === id)?.rank));
      const currentRank = Math.max(0, number(current?.rank));
      if (!current || currentRank <= initialRank) return false;
      const nextRank = currentRank - 1;
      const ranked = new Set((this.state.talentTree?.leaves ?? []).filter(entry => number(entry.rank) > 0).map(entry => entry.id));
      const blockedBy = talentTreePage(this.treePage).flatMap(school => school.practices ?? []).flatMap(practice => practice.spells ?? []).filter(spell => ranked.has(spell.id) && (spell.requires ?? []).map(treeRequirement).some(requirement => requirement.id === id && requirement.level > nextRank));
      if (blockedBy.length) {
        ui.notifications.warn(`Undo ${blockedBy.map(spell => spell.name).join(", ")} first; ${currentRank > 1 ? `level ${nextRank}` : "removing this purchase"} would no longer meet its prerequisite.`);
        return true;
      }
      if (currentRank - 1 <= 0) this.state.talentTree.leaves = this.state.talentTree.leaves.filter(entry => entry.id !== id);
      else current.rank = currentRank - 1;
      this.treeUndoStack.length = 0;
      this.#redrawTreePreservingViewport(viewport);
      const name = this.#treeCatalogEntry(id, "spell")?.spell?.name ?? id;
      ui.notifications.info(nextRank ? `${name} returned to level ${nextRank}.` : `${name} purchase undone.`);
      return true;
    }
    const purchased = (this.state.talentTree?.branches ?? []).includes(id);
    const previouslyOwned = (this.initialTalentTree?.branches ?? []).includes(id);
    if (!purchased || previouslyOwned) return false;
    const practice = this.#treeCatalogEntry(id, "practice")?.practice;
    const purchasedPractices = new Set(this.state.talentTree?.branches ?? []);
    const dependentPractices = talentTreePage(this.treePage).flatMap(school => school.practices ?? []).filter(candidate => candidate.id !== id && purchasedPractices.has(candidate.id) && (candidate.requires ?? []).map(treeRequirement).some(requirement => requirement.id === id));
    if (dependentPractices.length) {
      ui.notifications.warn(`Undo ${dependentPractices.map(candidate => candidate.name).join(", ")} first; those Practices require ${practice?.name ?? id}.`);
      return true;
    }
    const spellIds = new Set((practice?.spells ?? []).map(spell => spell.id));
    const draftSpellLevels = (this.state.talentTree?.leaves ?? []).filter(entry => spellIds.has(entry.id) && number(entry.rank) > number((this.initialTalentTree?.leaves ?? []).find(initial => initial.id === entry.id)?.rank));
    if (draftSpellLevels.length) {
      ui.notifications.warn("Undo the current-session Spell levels in this Practice first.");
      return true;
    }
    this.state.talentTree.branches = this.state.talentTree.branches.filter(branchId => branchId !== id);
    this.treeUndoStack.length = 0;
    if (this.openPracticeId === id) this.openPracticeId = null;
    this.#draw();
    ui.notifications.info(`${practice?.name ?? id} purchase undone.`);
    return true;
  }

  #treeViewportSnapshot() {
    const board = this.root.querySelector(".vr-cc-tree-board");
    return board ? { left: board.scrollLeft, top: board.scrollTop } : (this.treeViewport[this.#treeViewportKey()] ?? { left: 0, top: 0 });
  }

  #treeViewportKey() {
    return `${this.treePage}:${this.openPracticeId ?? "main"}`;
  }

  #restoreTreeViewport() {
    const board = this.root.querySelector(".vr-cc-tree-board");
    if (!board) return;
    const key = this.#treeViewportKey();
    let viewport = this.treeViewport[key] ?? { left: 0, top: 0 };
    if (!this.treeViewportInitialized[key]) {
      const focus = this.openPracticeId ? this.#treeCatalogEntry(this.openPracticeId, "practice")?.practice : talentTreeRoot(this.treePage);
      viewport = { left: Math.max(0, number(focus?.x) * this.treeZoom - board.clientWidth / 2), top: Math.max(0, number(focus?.y) * this.treeZoom - board.clientHeight / 2) };
      this.treeViewport[key] = viewport;
      this.treeViewportInitialized[key] = true;
    }
    board.scrollLeft = viewport.left;
    board.scrollTop = viewport.top;
  }

  #redrawTreePreservingViewport(snapshot = this.#treeViewportSnapshot()) {
    const key = this.#treeViewportKey();
    this.treeViewport[key] = snapshot;
    this.#draw();
    const restore = () => {
      const board = this.root.querySelector(".vr-cc-tree-board");
      if (!board) return;
      board.scrollLeft = snapshot.left;
      board.scrollTop = snapshot.top;
    };
    restore();
    requestAnimationFrame(restore);
  }

  #connectionNodeRecord(element) {
    if (element.dataset.treeRoot) { const root = talentTreeRoot(this.treePage); return { kind: "root", id: root.id, name: root.name }; }
    if (element.dataset.treeSchool) { const entry = this.#treeCatalogEntry(element.dataset.treeSchool, "school"); return entry ? { kind: "school", id: entry.school.id, name: entry.school.name, schoolId: entry.school.id } : null; }
    if (element.dataset.treePracticeCard) { const entry = this.#treeCatalogEntry(element.dataset.treePracticeCard, "practice"); return entry ? { kind: "practice", id: entry.practice.id, name: entry.practice.name, schoolId: entry.school.id } : null; }
    if (element.dataset.treeRank) { const entry = this.#treeCatalogEntry(element.dataset.treeRank, "spell"); return entry ? { kind: "spell", id: entry.spell.id, name: entry.spell.name, schoolId: entry.school.id, practiceId: entry.practice.id } : null; }
    return null;
  }

  #authoredConnectionStyle() {
    const tool = this.connectionTool;
    return { bend: Math.max(-100, Math.min(100, number(tool.bend))), thickness: Math.max(1, Math.min(10, number(tool.thickness, 2))), sourceAnchor: tool.sourceAnchor ?? "auto", targetAnchor: tool.targetAnchor ?? "auto", pattern: tool.pattern ?? "solid", glow: Math.max(0, Math.min(3, number(tool.glow, 1))), color: /^#[0-9a-f]{6}$/i.test(tool.color ?? "") ? tool.color : "" };
  }

  async #clearCanvasConnections() {
    const practiceEntry = this.openPracticeId ? this.#treeCatalogEntry(this.openPracticeId, "practice") : null;
    const scope = practiceEntry ? `${practiceEntry.practice.name} ${this.treePage === "magic" ? "Spell" : "Skill"} canvas` : `${this.treePage === "magic" ? "Magic" : "Skills"} overview`;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Clear Canvas Connections" },
      content: `<p>Clear every visible connection on the <strong>${escape(scope)}</strong>?</p><p>This also removes prerequisite links represented by those lines. Nodes and purchases are not deleted.</p>`,
      modal: true,
      rejectClose: false
    });
    if (!confirmed) return;
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    if (practiceEntry) {
      const practice = (catalog[this.treePage] ?? []).flatMap(school => school.practices ?? []).find(entry => entry.id === practiceEntry.practice.id);
      if (!practice) return;
      for (const spell of practice.spells ?? []) {
        spell.practiceConnection = { hidden: true };
        spell.requires = [];
      }
    } else {
      for (const school of catalog[this.treePage] ?? []) {
        school.rootConnection = { hidden: true };
        for (const practice of school.practices ?? []) {
          practice.schoolConnection = { hidden: true };
          practice.requires = [];
        }
      }
    }
    const viewport = this.#treeViewportSnapshot();
    await saveTalentTreeCatalog(catalog);
    this.connectionTool.source = null;
    this.#redrawTreePreservingViewport(viewport);
    ui.notifications.info(`Cleared connections from the ${scope}.`);
  }

  async #onConnectionNodeClick(element, socket = "") {
    const selected = this.#connectionNodeRecord(element);
    if (!selected) return;
    if (!this.connectionTool.source) {
      if (socket) this.connectionTool.sourceAnchor = socket;
      this.connectionTool.source = selected;
      this.#redrawTreePreservingViewport();
      return;
    }
    const source = this.connectionTool.source;
    if (socket) this.connectionTool.targetAnchor = socket;
    if (source.id === selected.id) {
      this.connectionTool.source = null;
      this.#redrawTreePreservingViewport();
      return ui.notifications.warn("Choose two different nodes.");
    }
    const catalog = foundry.utils.deepClone(talentTreeCatalog());
    const schools = catalog[this.treePage] ?? [];
    const findSchool = id => schools.find(school => school.id === id);
    const findPractice = id => schools.flatMap(school => school.practices ?? []).find(practice => practice.id === id);
    const findSpell = id => schools.flatMap(school => school.practices ?? []).flatMap(practice => practice.spells ?? []).find(spell => spell.id === id);
    const style = this.#authoredConnectionStyle();
    const remove = this.connectionTool.operation === "remove";
    let supported = true;
    if (source.kind === "root" && selected.kind === "school") {
      const school = findSchool(selected.id);
      if (school) school.rootConnection = remove ? { hidden: true } : style;
    } else if (source.kind === "school" && selected.kind === "practice" && source.id === selected.schoolId) {
      const practice = findPractice(selected.id);
      if (practice) practice.schoolConnection = remove ? { hidden: true } : style;
    } else if (source.kind === "practice" && selected.kind === "spell" && source.id === selected.practiceId) {
      const spell = findSpell(selected.id);
      if (spell) spell.practiceConnection = remove ? { hidden: true } : style;
    } else if (source.kind === "practice" && selected.kind === "practice") {
      const practice = findPractice(selected.id);
      if (practice) {
        const requirements = (practice.requires ?? []).map(treeRequirement).filter(requirement => requirement.id !== source.id);
        if (!remove) requirements.push({ id: source.id, level: 1, line: style });
        practice.requires = requirements;
      }
    } else if (source.kind === "spell" && selected.kind === "spell") {
      const spell = findSpell(selected.id);
      if (spell) {
        const requirements = (spell.requires ?? []).map(treeRequirement).filter(requirement => requirement.id !== source.id);
        if (!remove) requirements.push({ id: source.id, level: Math.max(1, Math.min(20, number(this.connectionTool.requiredLevel, 1))), line: style });
        spell.requires = requirements;
      }
    } else supported = false;
    if (!supported) {
      this.connectionTool.source = null;
      this.#redrawTreePreservingViewport();
      return ui.notifications.warn("Connect Root to School, School to one of its Practices, Practice to Practice or one of its Spells, or Spell to Spell.");
    }
    const viewport = this.#treeViewportSnapshot();
    await saveTalentTreeCatalog(catalog);
    this.connectionTool.source = null;
    this.#redrawTreePreservingViewport(viewport);
    ui.notifications.info(remove ? "Connection removed." : "Connection saved to the shared tree catalog.");
  }

  #treeAvailable(pool) {
    const budget = pool === "talent" ? talentPointsForLevel(this.state.startingLevel) : skillPointsForLevel(this.state.startingLevel);
    const spent = this.#treeSpent()[pool];
    if (this.mode !== "levelUp") return Math.max(0, budget - spent);
    const source = this.actor.system?.[`${pool}Points`] ?? {};
    const granted = Math.max(0, budget - number(source.total));
    return Math.max(0, number(source.available) + granted - (spent - this.#treeSpent(this.initialTalentTree)[pool]));
  }

  #pushTreeUndo(label) {
    this.treeUndoStack.push({ label, tree: foundry.utils.deepClone(this.state.talentTree) });
    if (this.treeUndoStack.length > 50) this.treeUndoStack.shift();
  }

  async #confirmTreePurchase(title, body) {
    return foundry.applications.api.DialogV2.confirm({ window: { title }, content: `<p>${escape(body)}</p>`, modal: true, rejectClose: false });
  }

  #personaStep() {
    const recommendation = this.#personaRecommendation();
    const sourceList = recommendation.sources.length
      ? recommendation.sources.map(source => `${source.label}: ${source.modifiers.join(", ")}`).join(" | ")
      : "Choose a reference-backed species, origin, background, or discipline to build a recommendation.";
    return `<div class="vr-cc-persona">
      <section class="vr-cc-persona-recommendation"><div><span>Recommended Persona Index</span><p>${escape(sourceList)}</p></div><button type="button" class="vr-cc-btn" data-action="apply-persona-recommendation">Apply recommendation</button></section>
      ${PERSONA_AXES.map(axis => {
      const value = clampPersona(this.state.personaIndex[axis.key]);
      const suggested = recommendation.values[axis.key];
      return `<label class="vr-cc-axis">
        <span class="vr-cc-axis-heading"><b>${escape(axis.left)}</b><strong>${value > 0 ? "+" : ""}${value}</strong><b>${escape(axis.right)}</b></span>
        ${this.#personaPips(axis, value)}
        <span class="vr-cc-axis-controls"><input name="personaIndex.${axis.key}" type="range" min="-100" max="100" value="${value}" /><input name="personaIndex.${axis.key}" type="number" min="-100" max="100" value="${value}" /><small>Recommendation: ${suggested > 0 ? "+" : ""}${suggested}</small></span>
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
    return `<section class="vr-cc-review"><header><span>Review</span><h2>Character Build Summary</h2><p>Review the selections below, then confirm to create the character.</p></header><div class="vr-cc-review-card-grid">${rows.map(([label, value]) => `
      <button type="button" class="vr-cc-review-card" data-inspect-title="${escape(label)}" data-inspect-description="${escape(String(value || "No selection yet."))}"><span>${escape(label)}</span><strong>${escape(value || "Not selected")}</strong></button>
    `).join("")}</div></section>`;
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

  #liveBuildCards(label, entries, mapEntry = entry => entry) {
    const cards = (entries ?? []).map(mapEntry).filter(Boolean);
    return `<section class="vr-cc-live-section"><h3>${escape(label)}</h3><div class="vr-cc-live-card-grid">${cards.length ? cards.map(card => `<button type="button" class="vr-cc-reference-card vr-cc-live-card" data-inspect-title="${escape(card.title)}" data-inspect-description="${escape(card.description ?? "No description is available.")}" title="${escape(card.description ?? "No description is available.")}"><span class="vr-cc-choice-image" aria-hidden="true"><i class="fa-solid fa-id-badge"></i></span><span class="vr-cc-choice-name">${escape(card.title)}</span></button>`).join("") : "<p>None selected.</p>"}</div></section>`;
  }

  #liveBuild() {
    const name = String(this.state.name ?? "").trim() || "Your Character";
    const identity = [["Species", this.state.species], ["Origin", this.state.origin], ["Background", this.state.background], ["Discipline", this.state.discipline]]
      .filter(([, value]) => value).map(([title, value]) => ({ title: value, description: title }));
    const talents = this.state.talentTree?.leaves ?? [];
    const contacts = this.#cleanContacts();
    const personaValues = this.state.personaTouched ? this.state.personaIndex : this.#personaRecommendation().values;
    return `<header class="vr-cc-live-header"><img src="${escape(this.actor.img || this.actor.system?.portraitImage || "icons/svg/mystery-man.svg")}" alt="${escape(name)} portrait" /><div><span>Live Build</span><h2>${escape(name)}</h2></div><button type="button" class="vr-cc-icon" data-action="cancel" title="Close"><i class="fa-solid fa-xmark"></i></button></header>
      <div class="vr-cc-live-scroll">
        <section class="vr-cc-live-section"><h3>Persona Index</h3>${PERSONA_AXES.map(axis => {
          const value = clampPersona(personaValues?.[axis.key]);
          const leftPips = Math.floor(Math.max(0, -value) / 10);
          const rightPips = Math.floor(Math.max(0, value) / 10);
          return `<div class="vr-cc-live-axis"><span>${escape(axis.left)}</span><div class="vr-cc-persona-pips" data-persona-axis="${axis.key}" style="--vr-persona-position: ${((value + 100) / 2).toFixed(1)}%" aria-label="${escape(`${axis.left} to ${axis.right}: ${value}`)}"><div class="vr-cc-persona-pip-side left">${Array.from({ length: 10 }, (_, index) => `<i class="${index >= 10 - leftPips ? "active" : ""}"></i>`).join("")}</div><b aria-hidden="true"></b><div class="vr-cc-persona-pip-side right">${Array.from({ length: 10 }, (_, index) => `<i class="${index < rightPips ? "active" : ""}"></i>`).join("")}</div><em aria-hidden="true"></em></div><span>${escape(axis.right)}</span></div>`;
        }).join("")}</section>
        ${this.#liveBuildCards("Identity", identity)}
        ${this.#liveBuildCards("Perks", this.state.qualitiesTaken, entry => ({ title: entry.name, description: entry.description }))}
        ${this.#liveBuildCards("Flaws", this.state.flawsTaken, entry => ({ title: entry.name, description: entry.description }))}
        ${this.#liveBuildCards("Talents and Skills", talents, entry => ({ title: `${entry.id} · Rank ${entry.rank}`, description: "Purchased talent or skill." }))}
        ${this.#liveBuildCards("Contacts", contacts, entry => ({ title: entry.name || entry.role || "Contact", description: entry.notes || entry.disposition || entry.role }))}
        <section class="vr-cc-live-section"><h3>Attribute Modifiers</h3><p>No authored attribute modifiers are currently attached to the selected reference cards.</p></section>
      </div>`;
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
    if (this.suppressTreeClick) {
      this.suppressTreeClick = false;
      event.preventDefault();
      return;
    }
    const connectionNode = event.target.closest?.("[data-tree-root], [data-tree-school], [data-tree-practice-card], [data-tree-rank]");
    if (this.connectionTool.active && connectionNode && game.user.isGM) {
      await this.#onConnectionNodeClick(connectionNode, event.target.closest?.("[data-tree-socket]")?.dataset.treeSocket);
      return;
    }
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "toggle-tree-connect") {
      this.connectionTool.active = !this.connectionTool.active;
      if (this.connectionTool.active) this.nodeMoveMode = false;
      this.connectionTool.source = null;
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "toggle-tree-move") {
      this.nodeMoveMode = !this.nodeMoveMode;
      if (this.nodeMoveMode) { this.connectionTool.active = false; this.connectionTool.source = null; }
      else { this.selectedTreeNodes.clear(); this.treeRingTool.active = false; }
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "align-tree-horizontal" || action === "align-tree-vertical") {
      await this.#alignSelectedTreeNodes(action === "align-tree-vertical" ? "vertical" : "horizontal");
      return;
    }
    if (action === "square-tree-nodes") {
      await this.#squareSelectedTreeNodes();
      return;
    }
    if (action === "space-tree-horizontal" || action === "space-tree-vertical") {
      await this.#spaceSelectedTreeNodes(action === "space-tree-vertical" ? "vertical" : "horizontal");
      return;
    }
    if (action === "preview-tree-ring") {
      this.treeRingTool.active = true;
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "cancel-tree-ring") {
      this.treeRingTool.active = false;
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "place-tree-ring") {
      await this.#placeSelectedTreeRing();
      return;
    }
    if (action === "clear-node-selection") {
      this.selectedTreeNodes.clear();
      this.treeRingTool.active = false;
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "clear-connection-color") {
      this.connectionTool.color = "";
      const color = this.root.querySelector('[name="connectionTool.color"]');
      if (color) color.value = "#ffffff";
      return;
    }
    if (action === "clear-connection-selection") {
      this.connectionTool.source = null;
      this.#redrawTreePreservingViewport();
      return;
    }
    if (action === "clear-canvas-connections") {
      if (game.user.isGM) await this.#clearCanvasConnections();
      return;
    }
    if (action === "undo-tree-purchase") {
      const previous = this.treeUndoStack.pop();
      if (!previous) return;
      this.state.talentTree = foundry.utils.deepClone(previous.tree);
      const closePractice = this.openPracticeId && !(this.state.talentTree.branches ?? []).includes(this.openPracticeId);
      if (closePractice) { this.openPracticeId = null; this.#draw(); }
      else this.#redrawTreePreservingViewport();
      ui.notifications.info(`Undid ${previous.label}.`);
      return;
    }
    if (button.dataset.treeGroup) {
      const group = button.dataset.treeGroup;
      if (this.openTreeGroups.has(group)) this.openTreeGroups.delete(group);
      else this.openTreeGroups.add(group);
      this.#draw();
      return;
    }
    if (button.dataset.treeGroupStep !== undefined) {
      this.#saveVisibleInputs();
      this.step = number(button.dataset.treeGroupStep);
      this.#draw();
      return;
    }
    if (button.dataset.treePage) {
      this.treeViewport[this.#treeViewportKey()] = this.#treeViewportSnapshot();
      this.treePage = button.dataset.treePage === "magic" ? "magic" : "skills";
      this.openPracticeId = null;
      this.selectedTreeNodes.clear();
      this.treeRingTool.active = false;
      this.connectionTool.source = null;
      if (this.treeViewportInitialized[this.#treeViewportKey()]) this.#redrawTreePreservingViewport(this.treeViewport[this.#treeViewportKey()]);
      else this.#draw();
      return;
    }
    if (action === "close-practice-canvas") {
      this.treeViewport[this.#treeViewportKey()] = this.#treeViewportSnapshot();
      this.openPracticeId = null;
      this.selectedTreeNodes.clear();
      this.treeRingTool.active = false;
      this.#draw();
      return;
    }
    if (action === "add-tree-node") {
      if (game.user.isGM) this.#authorTreeNode();
      return;
    }
    if (action === "tree-zoom-in" || action === "tree-zoom-out") {
      this.treeZoom = Math.max(.65, Math.min(1.75, this.treeZoom + (action === "tree-zoom-in" ? .1 : -.1)));
      this.#draw();
      return;
    }
    if (action === "cancel-tree-node") {
      this.authorNode = null;
      this.#draw();
      return;
    }
    if (action === "save-tree-node") {
      await this.#saveAuthoredTreeNode();
      return;
    }
    if (action === "delete-tree-node") {
      await this.#deleteAuthoredTreeNode();
      return;
    }
    if (action === "manage-tree-traits") {
      this.traitEditorOpen = true;
      this.#draw();
      return;
    }
    if (action === "close-tree-traits") {
      this.traitEditorOpen = false;
      this.#draw();
      return;
    }
    if (action === "retire-tree-trait") {
      const traits = foundry.utils.deepClone(game.settings.get(game.system.id, "actionTraits") ?? []);
      const trait = traits[number(button.dataset.index, -1)];
      if (trait) trait.retired = !trait.retired;
      await game.settings.set(game.system.id, "actionTraits", traits);
      this.#draw();
      return;
    }
    if (action === "delete-tree-trait") {
      const traits = foundry.utils.deepClone(game.settings.get(game.system.id, "actionTraits") ?? []);
      traits.splice(number(button.dataset.index, -1), 1);
      await game.settings.set(game.system.id, "actionTraits", traits);
      this.#draw();
      return;
    }
    if (action === "add-tree-trait") {
      await this.#addTreeTrait();
      return;
    }
    if (action === "save-tree-traits") {
      await this.#saveTreeTraits();
      return;
    }
    if (button.dataset.inspectTitle) {
      const panel = this.root.querySelector(".vr-cc-info");
      if (panel) panel.innerHTML = `<div class="vr-cc-info-heading"><span>Selection</span><h2>${escape(button.dataset.inspectTitle)}</h2></div><div class="vr-cc-reference"><p>${escape(button.dataset.inspectDescription)}</p></div>`;
      return;
    }
    if (Object.hasOwn(button.dataset, "step")) {
      this.#saveVisibleInputs();
      const steps = this.#steps;
      const nextStep = number(button.dataset.step);
      if (nextStep > 0 && !this.#hasStartingLevel()) {
        ui.notifications.warn("Choose a starting level before continuing character generation.");
        return;
      }
      if (steps[this.step]?.key === "level" && nextStep > this.step) await this.#applyStartingLevel();
      this.animateNavigation = this.#stepGroupLabel(steps[this.step]) !== this.#stepGroupLabel(steps[nextStep]);
      this.step = nextStep;
      this.#draw();
      return;
    }
    if (button.dataset.pathChoice) {
      if (this.pathTransitioning) return;
      this.#choosePath(button.dataset.pathChoice, button.dataset.value ?? "");
      return;
    }
    if (button.dataset.treePractice) {
      const entry = this.#treeCatalogEntry(button.dataset.treePractice, "practice");
      if ((this.state.talentTree.branches ?? []).includes(button.dataset.treePractice)) {
        if (!this.openPracticeId) {
          this.treeViewport[this.#treeViewportKey()] = this.#treeViewportSnapshot();
          this.openPracticeId = button.dataset.treePractice;
          this.selectedTreeNodes.clear();
          this.treeRingTool.active = false;
          this.connectionTool.source = null;
          this.#draw();
        }
        return;
      }
      const requirementsMet = (entry?.practice?.requires ?? []).every(value => (this.state.talentTree.branches ?? []).includes(treeRequirement(value).id));
      if (!requirementsMet) return ui.notifications.warn("Purchase every prerequisite Practice first.");
      const talentCost = Math.max(1, number(entry?.practice?.talentCost, 1));
      if (!entry || this.#treeAvailable("talent") < talentCost) return ui.notifications.warn("Not enough Talent Points to purchase this Practice.");
      if (!await this.#confirmTreePurchase("Purchase Practice", `Purchase ${entry.practice.name} for ${talentCost} Talent Point${talentCost === 1 ? "" : "s"}? This unlocks access but grants no Spell or Skill levels.`)) return;
      this.#pushTreeUndo(`purchase of ${entry.practice.name}`);
      this.state.talentTree.branches.push(entry.practice.id);
      this.treeViewport[this.#treeViewportKey()] = this.#treeViewportSnapshot();
      this.openPracticeId = entry.practice.id;
      this.selectedTreeNodes.clear();
      this.treeRingTool.active = false;
      this.#draw();
      return;
    }
    if (button.dataset.treeRank) {
      const entry = (this.state.talentTree.leaves ?? []).find(candidate => candidate.id === button.dataset.treeRank);
      const catalog = this.#treeCatalogEntry(button.dataset.treeRank, "spell");
      const spell = catalog?.spell;
      if (!spell || !(this.state.talentTree.branches ?? []).includes(catalog.practice.id)) return ui.notifications.warn("Purchase this Spell's Practice first.");
      const unmet = (spell.requires ?? []).map(treeRequirement).filter(requirement => number((this.state.talentTree.leaves ?? []).find(candidate => candidate.id === requirement.id)?.rank) < requirement.level);
      if (unmet.length) return ui.notifications.warn(`Prerequisites not met: ${unmet.map(requirement => `${this.#treeCatalogEntry(requirement.id, "spell")?.spell?.name ?? requirement.id} level ${requirement.level}`).join(", ")}.`);
      if (number(entry?.rank) >= Math.max(1, number(spell.maxRank, 1))) return;
      if (!entry) {
        const talentCost = Math.max(1, number(spell.talentCost, 1));
        if (this.#treeAvailable("talent") < talentCost) return ui.notifications.warn(`Not enough Talent Points to purchase this Spell (${talentCost} required).`);
        if (!await this.#confirmTreePurchase(`Purchase ${this.treePage === "magic" ? "Spell" : "Skill"}`, `Purchase ${spell.name} at level 1 for ${talentCost} Talent Point${talentCost === 1 ? "" : "s"}?`)) return;
        this.#pushTreeUndo(`purchase of ${spell.name}`);
        this.state.talentTree.leaves.push({ id: spell.id, rank: 1 });
      } else {
        const skillCost = Math.max(0, number(spell.rankCost, skillPointCostForLevel(this.state.startingLevel)));
        if (this.#treeAvailable("skill") < skillCost) return ui.notifications.warn(`Not enough Skill Points to increase this Spell (${skillCost} required).`);
        this.#pushTreeUndo(`${spell.name} level ${number(entry.rank) + 1}`);
        entry.rank = Math.max(1, number(entry.rank)) + 1;
      }
      this.#draw();
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
    if (action === "previous" || action === "next") {
      this.#saveVisibleInputs();
      const steps = this.#steps;
      if (action === "next" && steps[this.step]?.key === "level" && !this.#hasStartingLevel()) {
        ui.notifications.warn("Choose a starting level before continuing character generation.");
        return;
      }
      if (action === "next" && steps[this.step]?.key === "level") await this.#applyStartingLevel();
      const nextStep = Math.max(0, Math.min(steps.length - 1, this.step + (action === "next" ? 1 : -1)));
      this.animateNavigation = this.#stepGroupLabel(steps[this.step]) !== this.#stepGroupLabel(steps[nextStep]);
      this.step = nextStep;
      this.#draw();
      return;
    }
    if (action === "add-contact") {
      this.#saveVisibleInputs();
      this.state.contacts.push({ name: "", role: "", disposition: "", notes: "" });
      this.state.contactFocus = this.state.contacts.length - 1;
      this.#draw();
      return;
    }
    if (button.dataset.contactChoice !== undefined) {
      this.#saveVisibleInputs();
      this.state.contactFocus = number(button.dataset.contactChoice);
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
    if (action === "set-qf-type" || action === "set-qf-pillar" || action === "set-qf-tier") {
      const value = button.dataset.qfFilter ?? "all";
      if (action === "set-qf-type") this.state.qualityFlawTypeFilter = ["all", "quality", "flaw"].includes(value) ? value : "all";
      if (action === "set-qf-pillar") this.state.qualityFlawPillarFilter = ["all", ...QUALITY_FLAW_PILLARS].includes(value) ? value : "all";
      if (action === "set-qf-tier") this.state.qualityFlawTierFilter = ["all", ...QUALITY_FLAW_TIERS].includes(value) ? value : "all";
      this.#draw();
      return;
    }
    if (action === "focus-qf-choice") {
      this.state.qualityFlawFocus = {
        kind: button.dataset.qfKind === "flaw" ? "flaw" : "quality",
        tier: QUALITY_FLAW_TIERS.includes(button.dataset.qfTier) ? button.dataset.qfTier : "Minor",
        points: Math.max(1, number(button.dataset.qfPoints, 1)),
        pillar: QUALITY_FLAW_PILLARS.includes(button.dataset.qfPillar) ? button.dataset.qfPillar : "Physical"
      };
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
      this.state.personaTouched = true;
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
    applyState();
    this.#draw();
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
    if (input.name.startsWith("treeRingTool.")) {
      const output = input.parentElement?.querySelector("output");
      if (output) output.textContent = input.name.endsWith("radius") ? `${number(input.value)} px` : `${number(input.value)}°`;
      this.#decorateTreeRingPreview();
      return;
    }
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
    if (["authorNode.nodeKind", "authorNode.schoolId", "authorNode.type"].includes(input.name) && event.type === "change") {
      if (input.name === "authorNode.type" && this.authorNode?.type === "ability") { this.authorNode.actions = 0; this.authorNode.shape = "hex"; }
      this.#draw();
      return;
    }
    if (input.name.startsWith("personaIndex.")) {
      const value = clampPersona(input.value);
      this.#setStateValue(input.name, value);
      this.state.personaTouched = true;
      for (const field of this.root.querySelectorAll(`[name="${input.name}"]`)) field.value = value;
      this.#refreshLivePersonaPips();
      this.#refreshInfoPanel();
      return;
    }
    if (["archetype", "profession"].includes(input.name)) {
      if (input.name === "archetype") {
        this.state.profession = "";
        this.state.discipline = "";
      } else this.state.discipline = "";
      this.#draw();
    } else {
      this.#refreshInfoPanel();
      this.#refreshLiveBuild();
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
    if (!isSafePropertyPath(path)) return;
    if (path.startsWith("authorNode.")) {
      if (this.authorNode) foundry.utils.setProperty(this.authorNode, path.slice("authorNode.".length), value);
      return;
    }
    if (path.startsWith("connectionTool.")) {
      foundry.utils.setProperty(this.connectionTool, path.slice("connectionTool.".length), value);
      return;
    }
    if (path.startsWith("treeRingTool.")) {
      foundry.utils.setProperty(this.treeRingTool, path.slice("treeRingTool.".length), value);
      return;
    }
    if (path.startsWith("traitLabels.") || path === "newTraitLabel") return;
    foundry.utils.setProperty(this.state, path, value);
  }

  async #confirm() {
    this.#saveVisibleInputs();
    if (this.mode === "levelUp") return this.#confirmLevelUp();
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
    const treeSpent = this.#treeSpent();
    const talentSpent = Math.min(talentBudget, treeSpent.talent);
    const skillSpent = Math.min(skillBudget, treeSpent.skill);
    const update = {
      name,
      "system.level": 1,
      "system.experience.max": xpForLevel(1),
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
      "system.talentTree": this.state.talentTree ?? { branches: [], leaves: [] },
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
    await this.#grantTreeItems();
    ui.notifications.info(`${name} character generation complete.`);
    this.close({ renderSheet: true });
  }

  async #grantTreeItems() {
    const treeNodeId = item => item.flags?.[game.system.id]?.treeNodeId ?? item.flags?.veilrunner?.treeNodeId;
    const existingItems = new Map(this.actor.items.filter(item => treeNodeId(item)).map(item => [treeNodeId(item), item]));
    const existing = new Set(existingItems.keys());
    const rankUpdates = (this.state.talentTree?.leaves ?? []).map(purchase => ({ purchase, item: existingItems.get(purchase.id) })).filter(entry => entry.item && number(entry.item.system?.currentLevel, 1) !== number(entry.purchase.rank, 1)).map(({ purchase, item }) => ({ _id: item.id, "system.currentLevel": Math.max(1, number(purchase.rank, 1)) }));
    const documents = (this.state.talentTree?.leaves ?? [])
      .map(purchase => ({ purchase, catalog: this.#treeCatalogEntry(purchase.id, "leaf") })).filter(entry => entry.catalog)
      .filter(entry => !existing.has(entry.catalog.leaf.id)).map(({ purchase, catalog: { leaf, practice, school, page } }) => ({
        name: leaf.name, type: "action", img: leaf.img || "icons/svg/light.svg",
        system: {
          activationKind: leaf.type === "ability" ? "ability" : "action", category: leaf.category || "actions", actionType: leaf.category === "reactions" ? "reaction" : "standard", actions: leaf.type === "ability" ? 0 : Math.max(1, number(leaf.actions, 1)),
          currentLevel: Math.min(Math.max(1, number(leaf.maxRank, 1)), Math.max(1, number(purchase.rank, 1))), maxLevel: Math.max(1, number(leaf.maxRank, 1)), traits: leaf.traits ?? [],
          resourceCosts: leaf.resourceCosts ?? { mana: 0, stamina: 0, health: 0 }, effects: leaf.effects ?? [],
          tree: { enabled: true, page, school: school.name, practice: practice.name, x: number(leaf.x, 0), y: number(leaf.y, 0), requires: (leaf.requires ?? []).map(value => { const requirement = treeRequirement(value); return `${requirement.id}:${requirement.level}`; }), talentCost: Math.max(1, number(leaf.talentCost, 1)), rankCost: Math.max(0, number(leaf.rankCost, 1)), requiredLevel: Math.max(1, number(leaf.requiredLevel, 1)) },
          description: leaf.description ?? ""
        }, flags: { [game.system.id]: { treeNodeId: leaf.id } }
      }));
    if (documents.length) await this.actor.createEmbeddedDocuments("Item", documents);
    if (rankUpdates.length) await this.actor.updateEmbeddedDocuments("Item", rankUpdates);
  }

  async #confirmLevelUp() {
    const currentLevel = Math.max(1, number(this.actor.system?.level, 1));
    const nextLevel = currentLevel + 1;
    const xp = Math.max(0, number(this.actor.system?.experience?.value));
    const max = xpForLevel(currentLevel);
    if (xp < max) return ui.notifications.warn("This character does not have enough XP to level up.");
    const pool = (key, budget, spent) => ({ total: Math.max(number(this.actor.system?.[key]?.total), budget), available: Math.max(0, Math.max(number(this.actor.system?.[key]?.total), budget) - spent) });
    const attributes = pool("attributePoints", attributePointsForLevel(nextLevel), this.#attributePointCost());
    const treeDelta = this.#treeSpent();
    const initialTree = this.#treeSpent(this.initialTalentTree);
    const talents = pool("talentPoints", talentPointsForLevel(nextLevel), number(this.actor.system?.talentPoints?.total) - number(this.actor.system?.talentPoints?.available) + treeDelta.talent - initialTree.talent);
    const skills = pool("skillPoints", skillPointsForLevel(nextLevel), number(this.actor.system?.skillPoints?.total) - number(this.actor.system?.skillPoints?.available) + treeDelta.skill - initialTree.skill);
    const applied = await applyHeroLevelUp(this.actor, {
      "system.level": nextLevel,
      "system.attributes": this.state.attributes,
      "system.qualitiesTaken": this.state.qualitiesTaken,
      "system.flawsTaken": this.state.flawsTaken,
      "system.talentTree": this.state.talentTree ?? { branches: [], leaves: [] },
      "system.attributePoints.total": attributes.total, "system.attributePoints.available": attributes.available,
      "system.talentPoints.total": talents.total, "system.talentPoints.available": talents.available,
      "system.skillPoints.total": skills.total, "system.skillPoints.available": skills.available
    });
    if (!applied) return;
    await this.#grantTreeItems();
    ui.notifications.info(`${this.actor.name} reached Level ${nextLevel}.`);
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
