const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { completedXpBeforeLevel, xpForLevel } from "../data/xp.mjs";
import { attributePointsForLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { VEILRUNNER_PROFESSIONS, findDiscipline } from "../data/professions.mjs";
import { openCharacterCreation } from "../apps/character-creation.mjs";
import { openPlayerDatapad } from "../apps/datapad.mjs";
import { buildPartyOverview, findPartyActorForFolder, findPartyForHero, getPartyMembers } from "../helpers/party.mjs";

const EQUIPMENT_SLOTS = [
  "helmet", "back", "neck", "mainHand", "shoulders", "offHand",
  "chest", "waist", "arms", "legs", "hands", "feet"
];

const DETAILS_CATEGORIES = [
  { key: "party", icon: "fa-solid fa-users", label: "VEILRUNNER.Party" },
  { key: "skills", icon: "fa-solid fa-crosshairs", label: "VEILRUNNER.Skills" },
  { key: "biography", icon: "fa-solid fa-book-open", label: "VEILRUNNER.Biography" },
  { key: "reputation", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.Reputation" },
  { key: "relationships", icon: "fa-solid fa-people-arrows", label: "VEILRUNNER.Relationships" },
  { key: "conditions", icon: "fa-solid fa-triangle-exclamation", label: "VEILRUNNER.Conditions" },
  { key: "customEffects", icon: "fa-solid fa-hexagon-nodes", label: "VEILRUNNER.CustomEffects" }
];
const DETAILS_SUBTABS = DETAILS_CATEGORIES.map(category => category.key);

const SECTIONS = ["character", "actions", "inventory", "datapad", "settings"];
const CHARACTER_SUBTABS = ["stats", "progression", "details", "biography"];
const ACTIONS_SUBTABS = ["favorites", "actions", "abilities", "reactions", "magic", "tech"];
const INVENTORY_CATEGORIES = [
  { key: "all", icon: "fa-solid fa-layer-group", label: "VEILRUNNER.InventoryCategory.all" },
  { key: "weapon", icon: "fa-solid fa-gun", label: "VEILRUNNER.InventoryCategory.weapon" },
  { key: "ammo", icon: "fa-solid fa-box-open", label: "VEILRUNNER.InventoryCategory.ammo" },
  { key: "armor", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.InventoryCategory.armor" },
  { key: "consumable", icon: "fa-solid fa-flask", label: "VEILRUNNER.InventoryCategory.consumable" },
  { key: "tech", icon: "fa-solid fa-microchip", label: "VEILRUNNER.InventoryCategory.tech" },
  { key: "keyItem", icon: "fa-solid fa-key", label: "VEILRUNNER.InventoryCategory.keyItem" },
  { key: "junk", icon: "fa-solid fa-recycle", label: "VEILRUNNER.InventoryCategory.junk" }
];
const INVENTORY_SUBTABS = INVENTORY_CATEGORIES.map(category => category.key);
const INVENTORY_FILTERS = {
  all: [
    { key: "all", icon: "fa-solid fa-layer-group", label: "VEILRUNNER.InventoryFilter.all" }
  ],
  weapon: [
    { key: "allWeapons", icon: "fa-solid fa-crosshairs", label: "VEILRUNNER.WeaponFilter.allWeapons" },
    { key: "melee", icon: "fa-solid fa-hand-fist", label: "VEILRUNNER.WeaponFilter.melee" },
    { key: "shortBlades", icon: "fa-solid fa-scissors", label: "VEILRUNNER.WeaponFilter.shortBlades" },
    { key: "longBlades", icon: "fa-solid fa-slash", label: "VEILRUNNER.WeaponFilter.longBlades" },
    { key: "pistols", icon: "fa-solid fa-gun", label: "VEILRUNNER.WeaponFilter.pistols" },
    { key: "smgs", icon: "fa-solid fa-bolt", label: "VEILRUNNER.WeaponFilter.smgs" },
    { key: "assaultRifles", icon: "fa-solid fa-person-rifle", label: "VEILRUNNER.WeaponFilter.assaultRifles" },
    { key: "heavyRifles", icon: "fa-solid fa-weight-hanging", label: "VEILRUNNER.WeaponFilter.heavyRifles" }
  ],
  ammo: [
    { key: "ammoAll", icon: "fa-solid fa-box-open", label: "VEILRUNNER.WeaponFilter.ammoAll" },
    { key: "ammoBallistic", icon: "fa-solid fa-circle-dot", label: "VEILRUNNER.WeaponFilter.ammoBallistic" },
    { key: "ammoEnergy", icon: "fa-solid fa-atom", label: "VEILRUNNER.WeaponFilter.ammoEnergy" },
    { key: "ammoLaser", icon: "fa-solid fa-sun", label: "VEILRUNNER.WeaponFilter.ammoLaser" }
  ],
  armor: [
    { key: "armorAll", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.ArmorFilter.allArmor" },
    { key: "armorLight", icon: "fa-solid fa-shield", label: "VEILRUNNER.ArmorFilter.lightArmor" },
    { key: "armorMedium", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.ArmorFilter.mediumArmor" },
    { key: "armorHeavy", icon: "fa-solid fa-user-shield", label: "VEILRUNNER.ArmorFilter.heavyArmor" }
  ]
};
const ABOUT_SUBTABS = ["party", "skills", "biography", "reputation", "relationships", "conditions", "customEffects"];
const PARTY_NAME_MAX_LENGTH = 18;
const RESOURCE_POOLS = ["health", "mana", "stamina", "armor", "shields", "barriers"];
const VALUE_RESOURCES = ["tempHealth", "inspiration", "resolve", "dying", "wounded"];
const QUALITY_FLAW_TIERS = ["Minor", "Moderate", "Significant", "Major", "Extreme"];
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
const PRONOUN_OPTIONS = [
  { value: "", label: "VEILRUNNER.Pronouns.unspecified" },
  { value: "sheHer", label: "VEILRUNNER.Pronouns.sheHer" },
  { value: "heHim", label: "VEILRUNNER.Pronouns.heHim" },
  { value: "theyThem", label: "VEILRUNNER.Pronouns.theyThem" },
  { value: "sheThey", label: "VEILRUNNER.Pronouns.sheThey" },
  { value: "heThey", label: "VEILRUNNER.Pronouns.heThey" },
  { value: "zeHir", label: "VEILRUNNER.Pronouns.zeHir" },
  { value: "custom", label: "VEILRUNNER.Pronouns.custom" }
];
const PERSONA_AXES = [
  {
    key: "criminalLawful",
    leftLabel: "VEILRUNNER.PersonaAxis.Criminal",
    rightLabel: "VEILRUNNER.PersonaAxis.Lawful"
  },
  {
    key: "ruthlessEmpathy",
    leftLabel: "VEILRUNNER.PersonaAxis.Ruthless",
    rightLabel: "VEILRUNNER.PersonaAxis.Empathy"
  },
  {
    key: "individualCollectivist",
    leftLabel: "VEILRUNNER.PersonaAxis.Individual",
    rightLabel: "VEILRUNNER.PersonaAxis.Collectivist"
  }
];
const ATTRIBUTE_GROUPS = [
  {
    key: "physical",
    label: "VEILRUNNER.AttributeGroup.Physical",
    attributes: ["strength", "dexterity", "agility", "reaction"]
  },
  {
    key: "mental",
    label: "VEILRUNNER.AttributeGroup.Mental",
    attributes: ["intelligence", "wisdom", "focus", "logic"]
  },
  {
    key: "social",
    label: "VEILRUNNER.AttributeGroup.Social",
    attributes: ["charisma", "perception"]
  }
];

function tabAnimationClass(from, to) {
  if (from === to) return "";
  return `tab-panel-enter tab-panel-enter-${to > from ? "right" : "left"}`;
}

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

function storedHeroExperience(actor) {
  const sourceValue = foundry.utils.getProperty(actor?._source, "system.experience.value");
  const preparedValue = foundry.utils.getProperty(actor?.system, "experience.value");
  const value = Number(sourceValue ?? preparedValue ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

async function updateHeroLevel(actor, update) {
  if (game.user.isGM || actor.isOwner) return actor.update(update);
  game.socket?.emit(`system.${game.system.id}`, {
    type: "veilrunnerLevelUp",
    actorId: actor.id,
    userId: game.user.id
  });
}

/** Crop dialog. */
function clampCropNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePortraitCrop(crop = {}) {
  return {
    x: clampCropNumber(crop.x, -100, 200, 50),
    y: clampCropNumber(crop.y, -100, 200, 50),
    zoom: clampCropNumber(crop.zoom, 1, 5, 1),
    rotation: clampCropNumber(crop.rotation, -180, 180, 0),
    flipX: Boolean(crop.flipX)
  };
}

function activatePortraitCrop(event, dialog) {
  const root = dialog.element?.querySelector(".vr-portrait-crop-dialog");
  if (!root) return;

  const preview = root.querySelector(".vr-portrait-crop-preview");
  const xInput = root.querySelector('[name="cropX"]');
  const yInput = root.querySelector('[name="cropY"]');
  const zoomInput = root.querySelector('[name="cropZoom"]');
  const rotationInput = root.querySelector('[name="cropRotation"]');
  const flipInput = root.querySelector('[name="cropFlipX"]');
  if (!preview || !xInput || !yInput || !zoomInput || !rotationInput || !flipInput) return;

  const defaults = {
    cropX: "50",
    cropY: "50",
    cropZoom: "1",
    cropRotation: "0",
    cropFlipX: false
  };
  const valueOutputs = root.querySelectorAll("[data-crop-value]");

  const formatCropValue = input => {
    if (input.name === "cropZoom") return `${Number(input.value).toFixed(2)}x`;
    if (input.name === "cropRotation") return `${input.value}deg`;
    return `${input.value}%`;
  };

  const syncVerticalSliderLength = () => {
    const rect = preview.getBoundingClientRect();
    root.style.setProperty("--crop-vertical-slider-length", `${Math.max(220, rect.height)}px`);
  };

  const apply = () => {
    const cropX = clampCropNumber(xInput.value, -100, 200, 50);
    const cropY = clampCropNumber(yInput.value, -100, 200, 50);
    const cropZoom = clampCropNumber(zoomInput.value, 1, 5, 1);
    const cropRotation = clampCropNumber(rotationInput.value, -180, 180, 0);
    preview.style.setProperty("--crop-x", `${cropX}%`);
    preview.style.setProperty("--crop-y", `${cropY}%`);
    preview.style.setProperty("--crop-pan-x", `${50 - cropX}%`);
    preview.style.setProperty("--crop-pan-y", `${50 - cropY}%`);
    preview.style.setProperty("--crop-zoom", cropZoom);
    preview.style.setProperty("--crop-rotation", `${cropRotation}deg`);
    preview.style.setProperty("--crop-flip-x", flipInput.checked ? -1 : 1);
    valueOutputs.forEach(output => {
      const input = root.querySelector(`[name="${output.dataset.cropValue}"]`);
      if (input) output.textContent = formatCropValue(input);
    });
  };
  for (const input of [xInput, yInput, zoomInput, rotationInput, flipInput]) input.addEventListener("input", apply);
  root.querySelectorAll("[data-crop-reset]").forEach(button => {
    button.addEventListener("click", () => {
      const input = root.querySelector(`[name="${button.dataset.cropReset}"]`);
      if (!input) return;
      if (input.type === "checkbox") input.checked = defaults[input.name];
      else input.value = defaults[input.name];
      apply();
    });
  });
  syncVerticalSliderLength();
  if (globalThis.ResizeObserver) {
    const resizeObserver = new ResizeObserver(syncVerticalSliderLength);
    resizeObserver.observe(preview);
  } else {
    window.addEventListener("resize", syncVerticalSliderLength);
  }

  let drag = null;
  preview.addEventListener("pointerdown", (pointerEvent) => {
    drag = { x: Number(xInput.value), y: Number(yInput.value), startX: pointerEvent.clientX, startY: pointerEvent.clientY };
    preview.setPointerCapture(pointerEvent.pointerId);
  });
  preview.addEventListener("pointermove", (pointerEvent) => {
    if (!drag) return;
    const rect = preview.getBoundingClientRect();
    xInput.value = Math.max(-100, Math.min(200, drag.x - ((pointerEvent.clientX - drag.startX) / rect.width) * 100));
    yInput.value = Math.max(-100, Math.min(200, drag.y - ((pointerEvent.clientY - drag.startY) / rect.height) * 100));
    apply();
  });
  preview.addEventListener("pointerup", () => { drag = null; });
}

/** Level-up canvas dialog. */
function activateLevelUpCanvas(event, dialog) {
  const canvas = dialog.element?.querySelector(".vr-level-up-canvas");
  if (!canvas) return;

  const level = Number(canvas.dataset.level ?? 0);
  const nextLevel = Number(canvas.dataset.nextLevel ?? level + 1);
  const xp = Number(canvas.dataset.xp ?? 0);
  const max = Number(canvas.dataset.max ?? 0);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const draw = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const { width, height } = rect;
    const centerX = width / 2;
    const centerY = height / 2;
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, Math.max(width, height) * 0.62);
    gradient.addColorStop(0, "rgba(34, 211, 238, 0.32)");
    gradient.addColorStop(0.45, "rgba(168, 85, 247, 0.18)");
    gradient.addColorStop(1, "rgba(8, 9, 16, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * 2 * i) / 28;
      const distance = 72 + (i % 4) * 17;
      const x = centerX + Math.cos(angle) * distance;
      const y = centerY + Math.sin(angle) * distance;
      ctx.fillStyle = i % 3 === 0 ? "rgba(34, 211, 238, 0.85)" : "rgba(168, 85, 247, 0.62)";
      ctx.beginPath();
      ctx.arc(x, y, i % 5 === 0 ? 2.6 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(centerX, centerY - 8);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(18, 20, 28, 0.96)";
    ctx.strokeStyle = "rgba(34, 211, 238, 0.95)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(34, 211, 238, 0.78)";
    ctx.shadowBlur = 22;
    ctx.beginPath();
    ctx.rect(-46, -46, 92, 92);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#f3f4f8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 42px Inter, Signika, sans-serif";
    ctx.fillText(String(nextLevel), centerX, centerY - 8);

    ctx.fillStyle = "rgba(243, 244, 248, 0.74)";
    ctx.font = "700 13px Inter, Signika, sans-serif";
    ctx.fillText(`${game.i18n.localize("VEILRUNNER.Level")} ${level} -> ${nextLevel}`, centerX, height - 58);
    ctx.fillStyle = "rgba(34, 211, 238, 0.9)";
    ctx.fillText(`${xp} / ${max} ${game.i18n.localize("VEILRUNNER.XP")}`, centerX, height - 36);
  };

  draw();
  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  dialog.element.addEventListener("close", () => observer.disconnect(), { once: true });
}

const healthStatus = (percent) => {
  const key = percent === 0 ? "Unconscious"
    : percent <= 25 ? "BadlyInjured" : percent <= 50 ? "Weakened" : "Uninjured";
  return game.i18n.localize(`VEILRUNNER.Status.Health.${key}`);
};
const armorStatus = (percent) => {
  const key = percent === 0 ? "None"
    : percent === 100 ? "Full" : percent <= 50 ? "Breaking" : "Weakened";
  return game.i18n.localize(`VEILRUNNER.Status.Armor.${key}`);
};
const shieldStatus = (pool) => {
  const value = Number(pool?.value ?? 0);
  const max = Number(pool?.max ?? 0);
  const key = max <= 0 ? "None" : value <= 0 ? "Off" : "Active";
  return game.i18n.localize(`VEILRUNNER.Status.Shield.${key}`);
};
const barrierStatus = (percent) => {
  const key = percent === 0 ? "None" : percent <= 50 ? "Weakened" : "Active";
  return game.i18n.localize(`VEILRUNNER.Status.Barrier.${key}`);
};
const truncateText = (value, maxLength) => {
  const text = String(value ?? "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
};

function clampPersonaValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(-100, Math.min(100, Math.round(number)));
}

function getFilePickerClass() {
  // FilePicker moved under Foundry's v13 application namespace. Do not touch
  // the deprecated global: merely reading it emits a compatibility warning.
  return foundry.applications?.apps?.FilePicker?.implementation
    ?? foundry.applications?.apps?.FilePicker
    ?? null;
}

async function renderFilePicker(picker) {
  if (typeof picker.browse === "function") return picker.browse();

  try {
    return picker.render(true);
  } catch (err) {
    return picker.render({ force: true });
  }
}

function normalizeInventoryToken(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getInventoryFilters(category) {
  return INVENTORY_FILTERS[category] ?? INVENTORY_FILTERS.all;
}

function getValidInventoryFilter(category, filter) {
  const filters = getInventoryFilters(category);
  return filters.some(entry => entry.key === filter) ? filter : filters[0]?.key ?? "all";
}

function detectInventoryFilterKey(item, category) {
  const system = item.system ?? {};
  const explicit = normalizeInventoryToken(
    system.weaponCategory
    ?? system.weaponType
    ?? system.armorCategory
    ?? system.armorType
    ?? system.subcategory
    ?? system.subCategory
    ?? system.ammoType
  );
  const haystack = normalizeInventoryToken(`${item.name} ${item.type} ${category} ${explicit}`);

  if (haystack.includes("laserammo") || haystack.includes("laserround") || haystack.includes("lasercell")) return "ammoLaser";
  if (haystack.includes("energyammo") || haystack.includes("energycell") || haystack.includes("battery")) return "ammoEnergy";
  if (haystack.includes("ballisticammo") || haystack.includes("ballisticround") || haystack.includes("bullet") || haystack.includes("slug")) return "ammoBallistic";
  if (haystack.includes("ammo") || haystack.includes("ammunition") || haystack.includes("round") || haystack.includes("magazine")) return "ammoAll";
  if (category === "armor") {
    const armorType = normalizeInventoryToken(system.armorType ?? explicit);
    if (armorType === "heavy" || haystack.includes("heavyarmor")) return "armorHeavy";
    if (armorType === "medium" || haystack.includes("mediumarmor")) return "armorMedium";
    if (armorType === "light" || haystack.includes("lightarmor")) return "armorLight";
    return "armorAll";
  }

  if (haystack.includes("heavyrifle") || haystack.includes("heavyrifles")) return "heavyRifles";
  if (haystack.includes("assaultrifle")) return "assaultRifles";
  if (haystack.includes("smg") || haystack.includes("submachine")) return "smgs";
  if (haystack.includes("pistol") || haystack.includes("sidearm")) return "pistols";
  if (haystack.includes("longblade") || haystack.includes("sword") || haystack.includes("katana")) return "longBlades";
  if (haystack.includes("shortblade") || haystack.includes("knife") || haystack.includes("dagger")) return "shortBlades";
  if (haystack.includes("melee") || haystack.includes("club") || haystack.includes("baton")) return "melee";
  return category === "weapon" ? "allWeapons" : "";
}

function inventoryItemMatchesFilter(item, filter) {
  if (filter === "all") return true;
  const inventoryFilterKey = item.inventoryFilterKey;
  if (!inventoryFilterKey) return false;
  if (filter === "allWeapons") return true;
  if (filter === "ammoAll") return inventoryFilterKey.startsWith("ammo");
  if (filter === "armorAll") return inventoryFilterKey.startsWith("armor");
  return inventoryFilterKey === filter;
}

/** Hero sheet. */
export default class VeilrunnerHeroSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static BASE_WIDTH = 890;
  static BASE_HEIGHT = 1018;
  static DRAWER_WIDTH = 300;
  static DRAWER_ANIMATION_MS = 800;
  static #portraitEditorsByUser = new Map();

  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "actor", "hero"],
    position: {
      width: VeilrunnerHeroSheet.BASE_WIDTH,
      height: VeilrunnerHeroSheet.BASE_HEIGHT
    },
    window: { resizable: false, title: "", icon: false },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      setSection: VeilrunnerHeroSheet.#onSetSection,
      setSubTab: VeilrunnerHeroSheet.#onSetSubTab,
      toggleInventoryFilters: VeilrunnerHeroSheet.#onToggleInventoryFilters,
      setInventoryWeaponFilter: VeilrunnerHeroSheet.#onSetInventoryWeaponFilter,
      rollAction: VeilrunnerHeroSheet.#onRollAction,
      rollInitiative: VeilrunnerHeroSheet.#onRollInitiative,
      sendQualityFlawToChat: VeilrunnerHeroSheet.#onSendQualityFlawToChat,
      setEquipTab: VeilrunnerHeroSheet.#onSetEquipTab,
      unequip: VeilrunnerHeroSheet.#onUnequip,
      toggleEditMode: VeilrunnerHeroSheet.#onToggleEditMode,
      setAppearanceImage: VeilrunnerHeroSheet.#onSetAppearanceImage,
      setPortraitImage: VeilrunnerHeroSheet.#onSetPortraitImage,
      setEquipmentImage: VeilrunnerHeroSheet.#onSetEquipmentImage,
      setTokenImage: VeilrunnerHeroSheet.#onSetTokenImage,
      setStatusTrack: VeilrunnerHeroSheet.#onSetStatusTrack,
      toggleEquipment: VeilrunnerHeroSheet.#onToggleEquipment,
      toggleDetails: VeilrunnerHeroSheet.#onToggleDetails,
      openCharacterCreation: VeilrunnerHeroSheet.#onOpenCharacterCreation,
      openPlayerDatapad: VeilrunnerHeroSheet.#onOpenPlayerDatapad,
      openLevelCanvas: VeilrunnerHeroSheet.#onOpenLevelCanvas,
      openPartyActor: VeilrunnerHeroSheet.#onOpenPartyActor,
      openPartyItem: VeilrunnerHeroSheet.#onOpenPartyItem
    }
  };

  static PARTS = {
    header: { template: "systems/veilrunner/templates/actor/hero/parts/header.hbs" },
    equipment: {
      template: "systems/veilrunner/templates/actor/hero/parts/equipment.hbs",
      templates: ["systems/veilrunner/templates/actor/hero/parts/equip-slot.hbs"]
    },
    main: { template: "systems/veilrunner/templates/actor/hero/parts/main.hbs" },
    details: { template: "systems/veilrunner/templates/actor/hero/parts/details.hbs" }
  };

  section = "character";
  subTabs = {
    character: "stats",
    actions: "actions",
    inventory: "all",
    about: "skills"
  };
  inventoryWeaponFilter = "all";
  inventoryFiltersOpen = false;
  equipTab = "equipped";

  #equipmentOpen = false;
  #lastEquipmentOpen = false;
  #animateEquipment = false;
  #detailsOpen = false;
  #lastDetailsOpen = false;
  #animateDetails = false;
  #detailsClosing = false;
  #detailsCloseTimeout = null;
  #editMode = false;
  #debouncedRender = foundry.utils.debounce(() => this.render(), 50);
  #hookIds = [];
  #pendingNavAnimation = null;
  #pendingMainTabAnimation = "";
  #pendingDetailsTabAnimation = "";
  #pendingEquipmentTabAnimation = "";

  /* Lifecycle */

  /** @override */
  async _onFirstRender(context, options) {
    await super._onFirstRender(context, options);
    this.#bindPartyHooks();
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#applyCarryWeightState(context);
    this.#bindPersonaAxisControls();
    this.#bindInventoryFilterScroll();
    this.#bindStatusTrackControls();
    this.#bindProfessionFilters();
    this.#bindIdentitySelect();
    this.#applyDrawerState();
    this.#playPendingNavAnimation();
    this.#clearPendingTabAnimations();
  }

  /** Keep the CSS-only carry-weight footer synchronized with the inventory state. */
  #applyCarryWeightState(context) {
    const content = this.element?.querySelector(".window-content");
    if (!content) return;

    const isInventory = context.section === "inventory";
    const weight = Number(context.inventoryCarryWeightKg) || 0;
    const capacity = Number(context.inventoryCarryCapacityKg) || 0;
    const percent = Math.max(0, Math.min(100, Number(context.inventoryCarryWeightPercent) || 0));

    content.classList.toggle("inventory-carry-visible", isInventory);
    content.style.setProperty("--inventory-carry-percent", `${percent}%`);
    content.dataset.carryWeight = `${weight} kg / ${capacity} kg`;
    content.setAttribute("aria-label", isInventory ? `Carry Weight: ${weight} kg / ${capacity} kg` : "");
  }

  /** @override */
  async _onClose(options) {
    this.#unbindPartyHooks();
    await super._onClose(options);
  }

  /** Nav FLIP. */
  #playPendingNavAnimation() {
    const anim = this.#pendingNavAnimation;
    this.#pendingNavAnimation = null;
    if (!anim) return;

    const nav = this.element?.querySelector(anim.selector);
    const indicator = nav?.querySelector(".nav-indicator");
    if (!indicator || !anim.total) return;

    const fromIndex = anim.from >= 0 ? anim.from : anim.to;

    indicator.classList.add("snapping");
    indicator.style.setProperty("--nav-width", `${100 / anim.total}%`);
    indicator.style.setProperty("--nav-offset", `${fromIndex * 100}%`);
    void indicator.offsetWidth;
    requestAnimationFrame(() => {
      indicator.classList.remove("snapping");
      indicator.style.setProperty("--nav-offset", `${anim.to * 100}%`);
    });
  }

  /** Horizontal filter bar wheel support. */
  #bindInventoryFilterScroll() {
    const filterBar = this.element?.querySelector(".inventory-weapon-filters");
    if (!filterBar) return;
    filterBar.addEventListener("wheel", event => {
      if (filterBar.scrollWidth <= filterBar.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      filterBar.scrollLeft += delta;
    }, { passive: false });
  }

  /** Right-click removes a status point; the standard sheet action adds one. */
  #bindStatusTrackControls() {
    this.element?.querySelectorAll('[data-action="setStatusTrack"]').forEach(button => {
      button.addEventListener("contextmenu", event => VeilrunnerHeroSheet.#onSetStatusTrack.call(this, event, button));
    });
  }

  /** Live filtering for archetype -> profession -> discipline selects. */
  #bindProfessionFilters() {
    const root = this.element?.querySelector(".profession-details-box");
    if (!root) return;
    const archetypeSelect = root.querySelector('select[name="system.archetype"]');
    const professionSelect = root.querySelector('select[name="system.profession"]');
    const disciplineSelect = root.querySelector('select[name="system.discipline"]');
    if (!archetypeSelect || !professionSelect || !disciplineSelect) return;

    const records = professionTreeRecords();
    const option = (value, label = value) => new Option(label, value);
    const replaceOptions = (select, options, selected) => {
      select.replaceChildren(option("", select.dataset.placeholder || ""));
      for (const entry of options) select.add(option(entry));
      select.value = options.includes(selected) ? selected : "";
    };
    const syncProfessions = () => {
      const archetype = normalizeArchetype(archetypeSelect.value);
      const professions = records
        .filter(record => !archetype || record.archetype === archetype)
        .map(record => record.profession)
        .sort((a, b) => a.localeCompare(b));
      replaceOptions(professionSelect, professions, professionSelect.value);
      syncDisciplines();
    };
    const syncDisciplines = () => {
      const record = records.find(entry => entry.profession === professionSelect.value);
      const disciplines = (record?.disciplines ?? []).slice().sort((a, b) => a.localeCompare(b));
      replaceOptions(disciplineSelect, disciplines, disciplineSelect.value);
    };
    const updateSelection = () => {
      const archetype = normalizeArchetype(archetypeSelect.value);
      const record = records.find(entry => entry.profession === professionSelect.value);
      const profession = record && (!archetype || record.archetype === archetype) ? professionSelect.value : "";
      const discipline = profession && record.disciplines.includes(disciplineSelect.value) ? disciplineSelect.value : "";
      return this.actor.update({
        "system.archetype": archetype,
        "system.profession": profession,
        "system.discipline": discipline
      });
    };

    archetypeSelect.addEventListener("change", async () => {
      syncProfessions();
      await updateSelection();
    });
    professionSelect.addEventListener("change", async () => {
      syncDisciplines();
      await updateSelection();
    });
    disciplineSelect.addEventListener("change", updateSelection);
  }

  /** Keep the identity dropdown persisted across immediate re-renders. */
  #bindIdentitySelect() {
    const pronounsSelect = this.element?.querySelector('select[name="system.pronouns"]');
    if (!pronounsSelect) return;

    pronounsSelect.addEventListener("change", async event => {
      event.stopPropagation();
      await this.actor.update({ "system.pronouns": pronounsSelect.value });
    });
  }

  #clearPendingTabAnimations() {
    this.#pendingMainTabAnimation = "";
    this.#pendingDetailsTabAnimation = "";
    this.#pendingEquipmentTabAnimation = "";
  }

  #bindPersonaAxisControls() {
    for (const field of this.element?.querySelectorAll(".persona-axis-field") ?? []) {
      const range = field.querySelector(".persona-axis-range");
      const input = field.querySelector(".persona-axis-value-input");
      if (!range || !input) continue;

      range.addEventListener("input", () => {
        input.value = range.value;
      });

      input.addEventListener("input", () => {
        range.value = input.value;
      });

      input.addEventListener("change", () => {
        const value = clampPersonaValue(input.value);
        input.value = value;
        range.value = value;
        range.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }

  #applyDrawerState() {
    const wc = this.element?.querySelector(".window-content");
    const detailsCloseStarted = this.#animateDetails && this.#lastDetailsOpen && !this.#detailsOpen;
    if (this.#detailsOpen) this.#detailsClosing = false;
    else if (detailsCloseStarted) this.#detailsClosing = true;

    const detailsClosing = this.#detailsClosing;
    const width = VeilrunnerHeroSheet.BASE_WIDTH
      + (this.#detailsOpen ? VeilrunnerHeroSheet.DRAWER_WIDTH : 0);

    this.#setSheetWidth(width);
    if (wc) {
      wc.classList.toggle("details-open", this.#detailsOpen);
      wc.classList.toggle("details-closing", detailsClosing);
    }

    const equipmentPart = this.element?.querySelector('[data-application-part="equipment"]');
    if (equipmentPart) {
      this.#pinEquipmentWidth(equipmentPart);
      this.#slideEquipmentDrawer(equipmentPart);
    }

    const detailsPart = this.element?.querySelector('[data-application-part="details"]');
    if (detailsPart) this.#slideDetailsDrawer(detailsPart, detailsClosing);
  }

  #setSheetWidth(width) {
    try {
      this.setPosition({ width });
    } catch (err) {
      console.warn("Veilrunner | setPosition failed, forcing frame width directly", err);
    }
    if (this.element) this.element.style.width = `${width}px`;
  }

  #slideEquipmentDrawer(equipmentPart) {
    const closedTransform = "translateX(calc(-100% - 2px))";
    const openTransform = "translateX(0)";
    const target = this.#equipmentOpen ? openTransform : closedTransform;
    const animate = this.#animateEquipment && this.#lastEquipmentOpen !== this.#equipmentOpen;
    this.#animateEquipment = false;
    this.#lastEquipmentOpen = this.#equipmentOpen;

    equipmentPart.classList.toggle("open", this.#equipmentOpen);

    if (!animate) {
      equipmentPart.style.transition = "none";
      equipmentPart.style.transform = target;
      void equipmentPart.offsetWidth;
      equipmentPart.style.transition = "";
      return;
    }

    const from = this.#equipmentOpen ? closedTransform : openTransform;
    equipmentPart.style.transition = "none";
    equipmentPart.style.transform = from;
    void equipmentPart.offsetWidth;
    equipmentPart.style.transition = "";
    requestAnimationFrame(() => {
      equipmentPart.style.transform = target;
    });
  }

  #slideDetailsDrawer(detailsPart, detailsClosing) {
    const closedClip = "inset(0 100% 0 0)";
    const openClip = "inset(0 0 0 0)";
    const target = this.#detailsOpen ? openClip : closedClip;
    const animate = this.#animateDetails && this.#lastDetailsOpen !== this.#detailsOpen;
    this.#animateDetails = false;
    this.#lastDetailsOpen = this.#detailsOpen;
    if (animate || this.#detailsOpen) window.clearTimeout(this.#detailsCloseTimeout);
    detailsPart.style.visibility = this.#detailsOpen || detailsClosing ? "visible" : "hidden";

    if (!animate) {
      detailsPart.style.transition = "none";
      detailsPart.style.clipPath = target;
      void detailsPart.offsetWidth;
      detailsPart.style.transition = "";
      return;
    }

    const from = this.#detailsOpen ? closedClip : openClip;
    detailsPart.style.transition = "none";
    detailsPart.style.clipPath = from;
    void detailsPart.offsetWidth;
    detailsPart.style.transition = "";
    requestAnimationFrame(() => {
      detailsPart.style.clipPath = target;
    });

    if (!detailsClosing) return;

    this.#detailsCloseTimeout = window.setTimeout(() => {
      if (this.#detailsOpen) return;
      this.#detailsClosing = false;
      this.element?.querySelector(".window-content")?.classList.remove("details-open", "details-closing");
      detailsPart.style.visibility = "hidden";
      detailsPart.style.clipPath = closedClip;
      this.#setSheetWidth(VeilrunnerHeroSheet.BASE_WIDTH);
    }, VeilrunnerHeroSheet.DRAWER_ANIMATION_MS);
  }

  #pinEquipmentWidth(equipmentPart) {
    const heroColumn = this.element?.querySelector(".hero-column");
    const content = this.element?.querySelector(".window-content");
    const heroRect = heroColumn?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const reference = heroRect && contentRect ? heroRect.right - contentRect.left : heroColumn?.offsetWidth;
    if (!reference) return;
    equipmentPart.style.setProperty("--vr-equipment-width", `${Math.round(reference)}px`);
  }

  /** Party hooks. */
  #bindPartyHooks() {
    const id = Hooks.on("updateActor", (doc) => {
      if (!this.rendered) return;
      if (doc.id === this.actor.id || ["hero", "party"].includes(doc.type)) this.#debouncedRender();
    });
    this.#hookIds.push(["updateActor", id]);
    const itemId = Hooks.on("updateItem", (item) => {
      if (!this.rendered) return;
      if (item.parent?.type === "party") this.#debouncedRender();
    });
    this.#hookIds.push(["updateItem", itemId]);
    for (const hook of ["createItem", "deleteItem"]) {
      const hookId = Hooks.on(hook, (item) => {
        if (!this.rendered) return;
        if (item.parent?.type === "party") this.#debouncedRender();
      });
      this.#hookIds.push([hook, hookId]);
    }
  }

  #unbindPartyHooks() {
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
  }

  /* Context */

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system ?? {};

    if (system.resources?.shield && !Object.prototype.hasOwnProperty.call(system.resources, "shields")) {
      system.resources.shields = system.resources.shield;
    }

    const professionRecords = professionTreeRecords();
    for (const pack of game.packs.values()) {
      const label = String(pack.metadata.label ?? pack.collection ?? "").toLowerCase();
      if (!/(profession|discipline)/i.test(label)) continue;
      try {
        const documents = await pack.getDocuments();
        for (const document of documents) {
          const profession = document.system?.profession || "";
          const discipline = document.system?.discipline || "";
          const archetype = normalizeArchetype(document.system?.archetype || PROFESSION_ARCHETYPES[profession]);
          if (profession && discipline) {
            let record = professionRecords.find(entry => entry.profession === profession);
            if (!record) {
              record = { archetype, profession, disciplines: [] };
              professionRecords.push(record);
            }
            if (!record.archetype && archetype) record.archetype = archetype;
            if (!record.disciplines.includes(discipline)) record.disciplines.push(discipline);
          }
        }
      } catch {
        // Ignore unloaded or inaccessible compendium packs.
      }
    }
    const selectedProfession = findDiscipline(system.profession, system.discipline);
    const selectedProfessionRecord = professionRecords.find(record => record.profession === system.profession);
    const characterArchetype = normalizeArchetype(system.archetype || selectedProfessionRecord?.archetype || PROFESSION_ARCHETYPES[system.profession]);
    const archetypeProfessionRecords = professionRecords
      .filter(record => !characterArchetype || record.archetype === characterArchetype)
      .sort((a, b) => a.profession.localeCompare(b.profession));
    const selectedDisciplineOptions = (selectedProfessionRecord?.disciplines ?? [])
      .slice()
      .sort((a, b) => a.localeCompare(b));

    const healthPercent = Number(system.percent?.health ?? 0);
    const healthColor = healthPercent <= 25
      ? "linear-gradient(90deg, #7f1d1d 0%, #ef4444 70%, #f87171 100%)"
      : healthPercent <= 50
        ? "linear-gradient(90deg, #93370d 0%, #f59e0b 100%)"
        : `hsl(${Math.round(Math.max(0, Math.min(120, (healthPercent / 100) * 120)))}, 76%, 34%)`;
    const healthMax = Number(system.resources?.health?.max || 1);
    const tempHealthValue = Number(system.resources?.tempHealth?.value || 0);
    const hasTempHealth = tempHealthValue > 0;
    const rawTempHealthPercent = healthMax > 0 ? Math.round((tempHealthValue / healthMax) * 100) : 0;
    const tempHealthPercent = Math.max(0, Math.min(100 - healthPercent, rawTempHealthPercent));
    const trackPoints = (value, max = 3) => {
      const current = Math.max(0, Math.min(max, Number(value) || 0));
      return Array.from({ length: max }, (_, index) => ({
        value: index + 1,
        active: index < current
      }));
    };
    const inspiration = Number(system.resources?.inspiration?.value || 0);
    const inspirationDots = Array.from({ length: Math.max(0, inspiration) }, (_, index) => index);
    const resolveValue = Number(system.resources?.resolve?.value || 0);
    const dyingValue = Number(system.resources?.dying?.value || 0);
    const woundedValue = Number(system.resources?.wounded?.value || 0);
    const experienceValue = storedHeroExperience(actor);
    const experienceMax = xpForLevel(system.level);
    const levelUpAvailable = experienceMax > 0 && experienceValue >= experienceMax;
    const xpToNextLevel = Math.max(0, experienceMax - experienceValue);
    const completedLevelXp = completedXpBeforeLevel(system.level);
    const totalXpEarned = Number(system.experience?.total ?? system.experience?.earned ?? completedLevelXp + experienceValue);

    context.actor = actor;
    context.inspirationDots = inspirationDots;
    context.resolvePoints = trackPoints(resolveValue);
    context.dyingPoints = trackPoints(dyingValue);
    context.woundedPoints = trackPoints(woundedValue);
    context.system = system;
    context.characterArchetype = characterArchetype;
    context.archetypeOptions = ARCHETYPE_OPTIONS.map(archetype => ({ archetype, active: archetype === characterArchetype }));
    context.professionOptions = archetypeProfessionRecords.map(record => ({
      profession: record.profession,
      active: record.profession === system.profession
    }));
    context.disciplineOptions = selectedDisciplineOptions.map(discipline => ({
      discipline,
      active: discipline === system.discipline
    }));
    context.pronounOptions = PRONOUN_OPTIONS.map(option => ({
      ...option,
      active: option.value === system.pronouns
    }));
    context.pronounsLabel = game.i18n.localize(PRONOUN_OPTIONS.find(option => option.value === system.pronouns)?.label ?? "VEILRUNNER.Pronouns.unspecified");
    context.selectedProfessionReference = selectedProfession;
    context.personaAxes = PERSONA_AXES.map(axis => {
      const value = clampPersonaValue(system.personaIndex?.[axis.key]);
      return {
        ...axis,
        path: `system.personaIndex.${axis.key}`,
        value,
        percent: (value + 100) / 2
      };
    });
    context.healthColor = healthColor;
    context.healthPercent = healthPercent;
    context.tempHealthValue = tempHealthValue;
    context.hasTempHealth = hasTempHealth;
    context.experienceValue = experienceValue;
    context.tempHealthPercent = tempHealthPercent;
    context.experiencePercent = Math.max(0, Math.min(100, Number(system.percent?.experience ?? 0)));
    context.experienceGlow = context.experiencePercent / 100;
    context.levelUpAvailable = levelUpAvailable;
    context.xpToNextLevel = xpToNextLevel;
    context.totalXpEarned = totalXpEarned;
    context.section = this.section;
    context.subTabs = this.subTabs;
    context.equipTab = this.equipTab;
    context.mainTabAnimationClass = this.#pendingMainTabAnimation;
    context.detailsTabAnimationClass = this.#pendingDetailsTabAnimation;
    context.equipmentTabAnimationClass = this.#pendingEquipmentTabAnimation;
    context.equipmentOpen = this.#equipmentOpen;
    context.detailsOpen = this.#detailsOpen;
    context.editMode = this.#editMode;
    context.canEditPortrait = actor.isOwner;
    context.appearanceImage = system.appearanceImage || actor.img;
    context.portraitImage = system.portraitImage || actor.img;
    context.equipmentImage = system.equipmentImage || context.appearanceImage || context.portraitImage;
    const sheetOptions = {
      showPartyList: system.sheetOptions?.showPartyList !== false,
      onlyActiveResourceBars: Boolean(system.sheetOptions?.onlyActiveResourceBars)
    };
    const resourceIsActive = key => Number(system.resources?.[key]?.max ?? system.resources?.[key]?.value ?? 0) > 0;
    context.showArmorResource = this.#editMode || !sheetOptions.onlyActiveResourceBars || resourceIsActive("armor");
    context.showShieldsResource = this.#editMode || !sheetOptions.onlyActiveResourceBars || resourceIsActive("shields");
    context.showBarriersResource = this.#editMode || !sheetOptions.onlyActiveResourceBars || resourceIsActive("barriers");
    context.showPartyList = sheetOptions.showPartyList;
    context.sheetOptions = sheetOptions;
    context.portraitCrop = {
      x: Number(system.portraitCrop?.x ?? 50),
      y: Number(system.portraitCrop?.y ?? 50),
      zoom: Number(system.portraitCrop?.zoom ?? 1),
      rotation: Number(system.portraitCrop?.rotation ?? 0),
      flipX: Boolean(system.portraitCrop?.flipX)
    };
    context.isGM = game.user.isGM;
    const entriesForTier = (entries, tier) => (entries ?? [])
      .map((entry, sourceIndex) => ({
        name: String(entry?.name ?? "").trim(),
        description: String(entry?.description ?? "").trim() || "No description entered.",
        sourceIndex
      }))
      .filter(entry => entry.name && String(entries?.[entry.sourceIndex]?.tier ?? "Minor") === tier);
    context.qualityFlawTiers = QUALITY_FLAW_TIERS.map(label => ({
      label,
      perks: entriesForTier(system.qualitiesTaken, label),
      flaws: entriesForTier(system.flawsTaken, label)
    }));
    context.attributeGroups = ATTRIBUTE_GROUPS.map(group => ({
      ...group,
      heading: group.key[0].toUpperCase() + group.key.slice(1),
      attributes: group.attributes.map(key => ({
        key,
        path: `system.attributes.${group.key}.${key}`,
        label: game.i18n.localize(`VEILRUNNER.Attribute.${key}`),
        hint: game.i18n.localize(`VEILRUNNER.AttributeHint.${key}`),
        value: Number(system.attributes?.[group.key]?.[key] ?? 0)
      }))
    }));
    const agility = Math.max(0, Number(system.attributes?.physical?.agility) || 0);
    const reaction = Math.max(0, Number(system.attributes?.physical?.reaction) || 0);
    const perception = Math.max(0, Number(system.attributes?.social?.perception) || 0);
    context.combatStats = [
      { label: "Actions", value: 2 + Math.floor(agility / 10), rule: "2 base + 1 per 10 Agility" },
      { label: "Reactions", value: Math.floor(reaction / 10), rule: "1 per 10 Reaction" },
      {
        label: "Initiative",
        value: reaction + perception,
        rule: "Reaction + Perception + modifiers + 1d10",
        initiative: true,
        initiativeFormula: `${reaction} + ${perception} + 1d10`
      },
      {
        label: "Movement",
        value: "0 m",
        rule: "Movement will incorporate encumbrance, species, and perk/flaw modifiers."
      }
    ];
    context.saves = [
      { label: "Fortitude", path: "system.saves.fortitude", value: Math.max(0, Number(system.saves?.fortitude) || 0) },
      { label: "Willpower", path: "system.saves.willpower", value: Math.max(0, Number(system.saves?.willpower) || 0) },
      { label: "Reflex", path: "system.saves.reflex", value: Math.max(0, Number(system.saves?.reflex) || 0) }
    ];

    context.sectionIndex = SECTIONS.indexOf(this.section);
    context.sectionCount = SECTIONS.length;
    context.sectionIndicatorWidth = 100 / context.sectionCount;
    context.sectionIndicatorOffset = context.sectionIndex * 100;
    const subList = this.section === "character" ? CHARACTER_SUBTABS
      : this.section === "actions" ? ACTIONS_SUBTABS
      : this.section === "inventory" ? INVENTORY_SUBTABS
      : this.section === "datapad" ? ABOUT_SUBTABS
      : null;
    context.subNavList = subList;
    context.subTabIndex = subList ? subList.indexOf(this.section === "datapad" ? this.subTabs.about : this.subTabs[this.section]) : -1;
    context.subTabCount = subList ? subList.length : 0;
    context.subTabIndicatorWidth = context.subTabCount ? 100 / context.subTabCount : 0;
    context.subTabIndicatorOffset = context.subTabIndex * 100;

    const sortedItems = [...actor.items.contents].sort((a, b) => a.sort - b.sort);
    context.actions = sortedItems.filter(i => i.type === "action");
    context.favoriteActions = context.actions.filter(i => i.system?.favorite);
    context.standardActions = context.actions.filter(i => {
      const category = i.system?.category || "actions";
      return category === "actions" && i.system?.actionType !== "reaction";
    });
    context.reactionActions = context.actions.filter(i => {
      const category = i.system?.category || "actions";
      return category === "reactions" || (category === "actions" && i.system?.actionType === "reaction");
    });
    context.magicActions = context.actions.filter(i => i.system?.category === "magic");
    context.techActions = context.actions.filter(i => i.system?.category === "tech");
    context.abilities = sortedItems.filter(i => i.type === "ability");
    context.featuredAbilities = context.abilities.filter(i => i.system?.featured);
    context.favoriteItems = [...context.favoriteActions, ...context.featuredAbilities]
      .sort((a, b) => a.sort - b.sort);
    context.inventoryCategories = INVENTORY_CATEGORIES.map(category => ({
      ...category,
      active: category.key === this.subTabs.inventory
    }));
    context.inventoryCategory = this.subTabs.inventory;
    const activeInventoryFilter = getValidInventoryFilter(this.subTabs.inventory, this.inventoryWeaponFilter);
    const inventoryFilters = getInventoryFilters(this.subTabs.inventory);
    context.inventoryWeaponFilters = inventoryFilters.map(filter => ({
      ...filter,
      active: filter.key === activeInventoryFilter
    }));
    context.inventoryWeaponFilter = activeInventoryFilter;
    context.hasInventoryFilters = inventoryFilters.length > 1;
    context.inventoryFiltersOpen = this.inventoryFiltersOpen && context.hasInventoryFilters;
    context.inventoryItems = sortedItems
      .map(item => {
        const category = item.type === "treasure" ? item.system?.category || "junk" : item.type;
        const inventoryFilterKey = detectInventoryFilterKey(item, category);
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          category,
          inventoryFilterKey,
          typeLabel: item.type === "treasure"
            ? game.i18n.localize(`VEILRUNNER.InventoryCategory.${category}`)
            : game.i18n.localize(`TYPES.Item.${item.type}`)
        };
      })
      .filter(item => this.subTabs.inventory === "all"
        || item.category === this.subTabs.inventory
        || (this.subTabs.inventory === "ammo" && item.inventoryFilterKey.startsWith("ammo")))
      .filter(item => inventoryItemMatchesFilter(item, activeInventoryFilter));
    context.inventoryCarryWeightKg = Math.round(sortedItems
      .filter(item => ["treasure", "armor", "accessory"].includes(item.type))
      .reduce((total, item) => {
        const weight = Math.max(0, Number(item.system?.weight) || 0);
        const quantity = item.type === "treasure" ? Math.max(0, Number(item.system?.quantity) || 0) : 1;
        return total + (weight * quantity);
      }, 0) * 100) / 100;
    context.inventoryCarryCapacityKg = 5 + (Math.max(1, Number(system.attributes?.physical?.strength) || 1) * 2);
    context.inventoryCarryWeightPercent = Math.min(100, (context.inventoryCarryWeightKg / context.inventoryCarryCapacityKg) * 100);

    const equipmentData = system.equipment ?? {};
    context.equipmentSlots = EQUIPMENT_SLOTS.map(slot => {
      const itemId = equipmentData[slot];
      const item = itemId ? actor.items.get(itemId) : null;
      return { slot, label: game.i18n.localize(`VEILRUNNER.Slot.${slot}`), item };
    });
    const quickEquipSource = Array.isArray(system.quickEquip) ? system.quickEquip : [];
    context.quickEquip = quickEquipSource
      .slice(0, 4)
      .map(id => actor.items.get(id))
      .filter(Boolean);
    context.panActive = Boolean(system.networkLinked);
    context.panStatus = game.i18n.localize(`VEILRUNNER.PAN.${context.panActive ? "On" : "Off"}`);

    const party = findPartyForHero(actor);
    context.partyOverview = buildPartyOverview(party, { currentHero: actor });
    context.partyMembers = getPartyMembers(party)
      .filter(member => member.id !== actor.id)
      .map(member => {
        const resources = member.system.resources;
        const linked = Boolean(system.networkLinked && member.system.networkLinked);
        const percent = member.system.percent ?? {};
        return {
          id: member.id,
          name: member.name,
          displayName: truncateText(member.name, PARTY_NAME_MAX_LENGTH),
          img: member.system.appearanceImage || member.img,
          linked,
          health: linked ? `${resources.health.value} / ${resources.health.max}` : healthStatus(percent.health ?? 0),
          armor: linked ? `${resources.armor.value} / ${resources.armor.max}` : armorStatus(percent.armor ?? 0),
          shields: linked ? `${(resources.shields ?? resources.shield)?.value || 0} / ${(resources.shields ?? resources.shield)?.max || 0}` : shieldStatus(resources.shields ?? resources.shield),
          barriers: linked ? `${resources.barriers.value} / ${resources.barriers.max}` : barrierStatus(percent.barriers ?? 0)
        };
      });

    const detailsCategory = DETAILS_SUBTABS.includes(this.subTabs.about) ? this.subTabs.about : "party";
    context.category = detailsCategory;
    context.categories = DETAILS_CATEGORIES.map(c => ({ ...c, active: c.key === detailsCategory }));
    const skillCategoriesSource = Array.isArray(system.skillCategories) ? system.skillCategories : [];
    context.skillCategories = skillCategoriesSource.map(cat => ({
      ...cat,
      skills: (Array.isArray(cat.skills) ? cat.skills : []).map(skill => ({
        ...skill,
        dotsArray: Array.from({ length: 5 }, (_, i) => i < (skill.dots || 0))
      }))
    }));
    context.biography = system.biography || "";
    context.conditions = Array.isArray(system.conditions) ? system.conditions : [];
    context.reputation = Array.isArray(system.reputation) ? system.reputation : [];
    context.relationships = Array.isArray(system.relationships) ? system.relationships : [];
    context.customEffects = Array.isArray(system.customEffects) ? system.customEffects : [];
    context.customEffectsCount = context.customEffects.length;

    return context;
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const object = formData.object ?? {};
    const normalizeNumber = (path) => {
      const current = Number(foundry.utils.getProperty(this.actor, path) ?? 0);
      const fallback = Number.isFinite(current) ? current : 0;
      const hasFlat = Object.hasOwn(object, path);
      const hasNested = foundry.utils.hasProperty(object, path);
      if (!hasFlat && !hasNested) return;

      const raw = hasFlat ? object[path] : foundry.utils.getProperty(object, path);
      const number = Number(raw);
      const value = raw === "" || raw == null || !Number.isFinite(number) ? fallback : number;

      if (hasFlat) object[path] = value;
      foundry.utils.setProperty(object, path, value);
    };

    normalizeNumber("system.level");
    normalizeNumber("system.experience.value");
    normalizeNumber("system.experience.max");
    normalizeNumber("system.attributePoints.available");
    normalizeNumber("system.attributePoints.total");
    normalizeNumber("system.talentPoints.available");
    normalizeNumber("system.talentPoints.total");
    normalizeNumber("system.skillPoints.available");
    normalizeNumber("system.skillPoints.total");
    for (const key of RESOURCE_POOLS) {
      normalizeNumber(`system.resources.${key}.value`);
      normalizeNumber(`system.resources.${key}.max`);
    }
    for (const key of VALUE_RESOURCES) normalizeNumber(`system.resources.${key}.value`);
    for (const axis of PERSONA_AXES) {
      const path = `system.personaIndex.${axis.key}`;
      normalizeNumber(path);
      const hasFlat = Object.hasOwn(object, path);
      const hasNested = foundry.utils.hasProperty(object, path);
      if (!hasFlat && !hasNested) continue;
      const value = clampPersonaValue(hasFlat ? object[path] : foundry.utils.getProperty(object, path));
      if (hasFlat) object[path] = value;
      foundry.utils.setProperty(object, path, value);
    }
    for (const group of ATTRIBUTE_GROUPS) {
      for (const key of group.attributes) normalizeNumber(`system.attributes.${group.key}.${key}`);
    }

    const submitData = super._prepareSubmitData(event, form, formData);
    const submittedLevel = foundry.utils.hasProperty(submitData, "system.level")
      ? Number(foundry.utils.getProperty(submitData, "system.level"))
      : Number(this.actor.system?.level ?? 1);
    foundry.utils.setProperty(submitData, "system.experience.max", xpForLevel(submittedLevel));
    for (const key of RESOURCE_POOLS) {
      const valuePath = `system.resources.${key}.value`;
      const maxPath = `system.resources.${key}.max`;
      if (!foundry.utils.hasProperty(submitData, valuePath)) continue;

      const submittedValue = Number(foundry.utils.getProperty(submitData, valuePath) ?? 0);
      const submittedMax = foundry.utils.hasProperty(submitData, maxPath)
        ? Number(foundry.utils.getProperty(submitData, maxPath) ?? 0)
        : Number(foundry.utils.getProperty(this.actor, maxPath) ?? 0);
      if (Number.isFinite(submittedValue) && Number.isFinite(submittedMax) && submittedValue > submittedMax) {
        foundry.utils.setProperty(submitData, maxPath, submittedValue);
      }
    }
    if (foundry.utils.hasProperty(submitData, "system.resources.shields.value")) {
      foundry.utils.setProperty(submitData, "system.resources.shield.value",
        foundry.utils.getProperty(submitData, "system.resources.shields.value"));
    }
    if (foundry.utils.hasProperty(submitData, "system.resources.shields.max")) {
      foundry.utils.setProperty(submitData, "system.resources.shield.max",
        foundry.utils.getProperty(submitData, "system.resources.shields.max"));
    }
    const submittedArchetype = normalizeArchetype(foundry.utils.hasProperty(submitData, "system.archetype")
      ? String(foundry.utils.getProperty(submitData, "system.archetype") ?? "")
      : String(this.actor.system?.archetype ?? ""));
    const submittedProfession = foundry.utils.hasProperty(submitData, "system.profession")
      ? String(foundry.utils.getProperty(submitData, "system.profession") ?? "")
      : String(this.actor.system?.profession ?? "");
    const submittedDiscipline = foundry.utils.hasProperty(submitData, "system.discipline")
      ? String(foundry.utils.getProperty(submitData, "system.discipline") ?? "")
      : String(this.actor.system?.discipline ?? "");
    if (foundry.utils.hasProperty(submitData, "system.archetype")) {
      foundry.utils.setProperty(submitData, "system.archetype", submittedArchetype);
    }
    const submittedExtraProfession = EXTRA_PROFESSION_TREE.find(entry => entry.profession === submittedProfession);
    const submittedProfessionArchetype = normalizeArchetype(PROFESSION_ARCHETYPES[submittedProfession] || submittedExtraProfession?.archetype);
    if (submittedArchetype && submittedProfession && submittedProfessionArchetype && submittedProfessionArchetype !== submittedArchetype) {
      foundry.utils.setProperty(submitData, "system.profession", "");
      foundry.utils.setProperty(submitData, "system.discipline", "");
    } else if (submittedProfession) {
      const profession = VEILRUNNER_PROFESSIONS.find(entry => entry.name === submittedProfession);
      const validDisciplines = profession?.disciplines.map(entry => entry.name) ?? submittedExtraProfession?.disciplines ?? [];
      if (validDisciplines.length && submittedDiscipline && !validDisciplines.includes(submittedDiscipline)) {
        foundry.utils.setProperty(submitData, "system.discipline", "");
      }
    }
    return submitData;
  }

  /* Actions */

  static #onSetSection(event, target) {
    const to = SECTIONS.indexOf(target.dataset.section);
    const from = SECTIONS.indexOf(this.section);
    if (to < 0 || to === from) return;
    this.section = target.dataset.section;
    this.#pendingNavAnimation = { selector: ".bottom-nav", from, to, total: SECTIONS.length };
    this.#pendingMainTabAnimation = tabAnimationClass(from, to);
    this.render({ parts: ["main"] });
  }

  static #onSetSubTab(event, target) {
    const { section, tab } = target.dataset;
    const fromDetailsPanel = section === "about" && !!target.closest(".details-panel");
    const list = section === "character" ? CHARACTER_SUBTABS
      : section === "actions" ? ACTIONS_SUBTABS
      : section === "inventory" ? INVENTORY_SUBTABS
      : fromDetailsPanel ? DETAILS_SUBTABS
      : ABOUT_SUBTABS;
    const currentTab = fromDetailsPanel && !DETAILS_SUBTABS.includes(this.subTabs[section]) ? "party" : this.subTabs[section];
    const from = list.indexOf(currentTab);
    const to = list.indexOf(tab);
    if (to < 0 || to === from) return;
    this.subTabs[section] = tab;
    if (section === "inventory") this.inventoryWeaponFilter = getValidInventoryFilter(tab, this.inventoryWeaponFilter);
    if (section === "inventory" && getInventoryFilters(tab).length <= 1) this.inventoryFiltersOpen = false;
    if (!fromDetailsPanel) this.#pendingNavAnimation = { selector: ".sub-nav-row", from, to, total: list.length };
    if (section === "about") this.#pendingDetailsTabAnimation = tabAnimationClass(from, to);
    else this.#pendingMainTabAnimation = tabAnimationClass(from, to);
    const parts = section === "about"
      ? (fromDetailsPanel ? ["details"] : ["main", "details"])
      : ["main"];
    this.render({ parts });
  }

  static #onToggleInventoryFilters(event, target) {
    if (getInventoryFilters(this.subTabs.inventory).length <= 1) return;
    this.inventoryFiltersOpen = !this.inventoryFiltersOpen;
    target.classList.toggle("active", this.inventoryFiltersOpen);
    target.setAttribute("aria-expanded", this.inventoryFiltersOpen ? "true" : "false");
    const row = target.closest(".inventory-filter-row");
    row?.classList.toggle("open", this.inventoryFiltersOpen);
    row?.querySelector(".inventory-filter-drawer")?.classList.toggle("open", this.inventoryFiltersOpen);
  }

  static #onSetInventoryWeaponFilter(event, target) {
    const filter = target.dataset.filter;
    if (!getInventoryFilters(this.subTabs.inventory).some(entry => entry.key === filter) || this.inventoryWeaponFilter === filter) return;
    this.inventoryWeaponFilter = filter;
    this.#pendingMainTabAnimation = "";
    this.render({ parts: ["main"] });
  }

  static async #onRollAction(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    if (item.hasRoll) await item.roll();
    else ui.notifications.info(`${item.name} used.`);
  }

  static async #onRollInitiative(event) {
    event.preventDefault();
    const reaction = Math.max(0, Number(this.actor.system.attributes?.physical?.reaction) || 0);
    const perception = Math.max(0, Number(this.actor.system.attributes?.social?.perception) || 0);
    const roll = await new Roll("1d10 + @reaction + @perception", { reaction, perception }).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      flavor: `${foundry.utils.escapeHTML(this.actor.name)} — Initiative (Reaction + Perception + 1d10)`
    });
  }

  static async #onSendQualityFlawToChat(event, target) {
    event.preventDefault();
    const kind = target.dataset.qualityFlawKind === "flaw" ? "flaw" : "perk";
    const sourceIndex = Number(target.dataset.qualityFlawIndex);
    const entries = kind === "flaw" ? this.actor.system.flawsTaken : this.actor.system.qualitiesTaken;
    const entry = entries?.[sourceIndex];
    if (!entry?.name) return;
    const name = foundry.utils.escapeHTML(entry.name);
    const description = foundry.utils.escapeHTML(entry.description || "No description entered.");
    const typeLabel = kind === "flaw" ? "Flaw" : "Perk";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${foundry.utils.escapeHTML(this.actor.name)} is using ${typeLabel}: ${name}</strong></p><p>${description}</p>`
    });
  }

  static async #onOpenPartyActor(event, target) {
    const row = target.closest("[data-actor-id], [data-folder-id]");
    const actorId = row?.dataset.actorId;
    const folderId = row?.dataset.folderId;
    let actor = actorId ? game.actors.get(actorId) : null;
    if (!actor && folderId && game.user.isGM) {
      const folder = game.folders?.get(folderId) ?? game.folders?.find(folder => folder.id === folderId);
      if (!folder) return;
      actor = findPartyActorForFolder(folder, { requirePermission: false })
        ?? await Actor.create({
          name: folder.name,
          type: "party",
          img: "icons/svg/group.svg",
          folder: folder.id,
          ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
          flags: { veilrunner: { partyFolder: folder.id } }
        });
    }
    actor?.sheet?.render(true);
  }

  static #onOpenPartyItem(event, target) {
    const party = findPartyForHero(this.actor);
    const item = party?.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet?.render(true);
  }

  static #onSetEquipTab(event, target) {
    const tabs = ["equipped", "appearance"];
    const from = tabs.indexOf(this.equipTab);
    const to = tabs.indexOf(target.dataset.tab);
    if (to < 0 || to === from) return;
    this.equipTab = target.dataset.tab;
    this.#pendingEquipmentTabAnimation = tabAnimationClass(from, to);
    this.render({ parts: ["equipment"] });
  }

  static async #onUnequip(event, target) {
    const slot = target.closest("[data-slot]")?.dataset.slot;
    if (!slot) return;
    await this.actor.update({ [`system.equipment.${slot}`]: "" });
  }

  static #onToggleEditMode() {
    this.#editMode = !this.#editMode;
    this.render();
  }

  static async #onSetStatusTrack(event, target) {
    event?.preventDefault();
    event?.stopPropagation();

    const key = target.dataset.track;
    if (!["resolve", "dying", "wounded"].includes(key)) return;

    const currentValue = Math.max(0, Math.min(3, Number(this.actor.system.resources?.[key]?.value) || 0));
    const delta = event?.type === "contextmenu" ? -1 : 1;
    const nextValue = Math.max(0, Math.min(3, currentValue + delta));
    await this.actor.update({ [`system.resources.${key}.value`]: nextValue });
  }

  static async #onSetAppearanceImage(event) {
    event?.preventDefault();
    event?.stopPropagation();

    try {
      const FilePickerClass = getFilePickerClass();
      if (!FilePickerClass) throw new Error("FilePicker is not available.");

      const current = this.actor.system.appearanceImage || this.actor.img;
      const picker = new FilePickerClass({
        type: "image",
        current,
        callback: async (path) => {
          const currentPortrait = this.actor.system.portraitImage || this.actor.system.appearanceImage || this.actor.img;
          const crop = await this.#promptPortraitCrop(path, { useExistingCrop: path === currentPortrait });
          const update = {
            img: path,
            "prototypeToken.texture.src": path,
            "system.appearanceImage": path,
            "system.portraitImage": path,
            "system.equipmentImage": path
          };
          if (crop) Object.assign(update, {
            "system.portraitCrop.x": crop.x,
            "system.portraitCrop.y": crop.y,
            "system.portraitCrop.zoom": crop.zoom,
            "system.portraitCrop.rotation": crop.rotation,
            "system.portraitCrop.flipX": crop.flipX
          });
          await this.actor.update(update);
        }
      });
      await renderFilePicker(picker);
    } catch (err) {
      console.error("Veilrunner | Failed to open portrait image picker", err);
      ui.notifications.error(game.i18n.localize("VEILRUNNER.ImagePickerFailed"));
    }
  }

  static async #onSetPortraitImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.actor.isOwner) return;

    await this.#pickImage(this.actor.system.portraitImage || this.actor.img, async (path) => {
      const crop = await this.#promptPortraitCrop(path, { useExistingCrop: path === this.actor.system.portraitImage });
      const update = { "system.portraitImage": path };
      if (crop) Object.assign(update, {
        "system.portraitCrop.x": crop.x,
        "system.portraitCrop.y": crop.y,
        "system.portraitCrop.zoom": crop.zoom,
        "system.portraitCrop.rotation": crop.rotation,
        "system.portraitCrop.flipX": crop.flipX
      });
      await this.actor.update(update);
    });
  }

  static async #onSetEquipmentImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    await this.#pickImage(this.actor.system.equipmentImage || this.actor.system.appearanceImage || this.actor.img,
      path => this.actor.update({ "system.equipmentImage": path }));
  }

  static async #onSetTokenImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    await this.#pickImage(this.actor.prototypeToken?.texture?.src || this.actor.img,
      path => this.actor.update({ "prototypeToken.texture.src": path }));
  }

  async #pickImage(current, callback) {
    try {
      const FilePickerClass = getFilePickerClass();
      if (!FilePickerClass) throw new Error("FilePicker is not available.");
      const picker = new FilePickerClass({ type: "image", current, callback });
      await renderFilePicker(picker);
    } catch (err) {
      console.error("Veilrunner | Failed to open image picker", err);
      ui.notifications.error(game.i18n.localize("VEILRUNNER.ImagePickerFailed"));
    }
  }

  async #promptPortraitCrop(path, { useExistingCrop = true } = {}) {
    const userId = game.user?.id ?? "local";
    const activeEditor = VeilrunnerHeroSheet.#portraitEditorsByUser.get(userId);
    if (activeEditor) {
      activeEditor.dialog?.bringToFront?.();
      activeEditor.dialog?.element?.focus?.();
      return null;
    }

    const existingCrop = this.actor.system.portraitCrop ?? {};
    const crop = normalizePortraitCrop(useExistingCrop ? existingCrop : undefined);
    const safePath = foundry.utils.escapeHTML(path);
    const editorState = { dialog: null };
    VeilrunnerHeroSheet.#portraitEditorsByUser.set(userId, editorState);
    const cleanupEditor = () => {
      if (VeilrunnerHeroSheet.#portraitEditorsByUser.get(userId) === editorState) {
        VeilrunnerHeroSheet.#portraitEditorsByUser.delete(userId);
      }
    };

    try {
      const prompt = foundry.applications.api.DialogV2.prompt({
        classes: ["veilrunner", "vr-portrait-editor"],
        window: { title: game.i18n.localize("VEILRUNNER.PortraitEditor") },
        // The preview needs enough width to keep its vertical and horizontal
        // pan controls directly beside/below it, with the other controls below.
        position: { width: 500 },
        rejectClose: false,
        render: (event, dialog) => {
          editorState.dialog = dialog;
          activatePortraitCrop(event, dialog);
        },
        content: `<div class="veilrunner vr-portrait-crop-dialog">
          <p>${game.i18n.localize("VEILRUNNER.PortraitEditorHint")}</p>
          <div class="vr-portrait-crop-stage">
            <div class="vr-portrait-crop-preview" style="--crop-x:${crop.x}%;--crop-y:${crop.y}%;--crop-zoom:${crop.zoom};--crop-rotation:${crop.rotation}deg;--crop-flip-x:${crop.flipX ? -1 : 1}"><img src="${safePath}" alt="" /></div>
            <div class="vr-portrait-crop-axis vertical" aria-label="${game.i18n.localize("VEILRUNNER.CropVertical")}">
              <button type="button" data-crop-reset="cropY" title="Reset ${game.i18n.localize("VEILRUNNER.CropVertical")}"><i class="fa-solid fa-rotate-left"></i></button>
              <label>${game.i18n.localize("VEILRUNNER.CropVertical")}<input name="cropY" type="range" min="-100" max="200" value="${crop.y}" /></label>
              <output class="vr-portrait-crop-value" data-crop-value="cropY">${crop.y}%</output>
            </div>
            <div class="vr-portrait-crop-axis horizontal" aria-label="${game.i18n.localize("VEILRUNNER.CropHorizontal")}">
              <button type="button" data-crop-reset="cropX" title="Reset ${game.i18n.localize("VEILRUNNER.CropHorizontal")}"><i class="fa-solid fa-rotate-left"></i></button>
              <label><input name="cropX" type="range" min="-100" max="200" value="${crop.x}" /></label>
              <output class="vr-portrait-crop-value" data-crop-value="cropX">${crop.x}%</output>
            </div>
          </div>
          <div class="vr-portrait-crop-option vr-portrait-crop-option-range">
            <button type="button" data-crop-reset="cropFlipX" title="Reset ${game.i18n.localize("VEILRUNNER.CropFlipHorizontal")}"><i class="fa-solid fa-rotate-left"></i></button>
            <label for="crop-flip-x" class="vr-portrait-flip">${game.i18n.localize("VEILRUNNER.CropFlipHorizontal")}</label>
            <input id="crop-flip-x" name="cropFlipX" type="checkbox" ${crop.flipX ? "checked" : ""} />
          </div>
          <div class="vr-portrait-crop-option vr-portrait-crop-option-range">
            <button type="button" data-crop-reset="cropZoom" title="Reset ${game.i18n.localize("VEILRUNNER.CropZoom")}"><i class="fa-solid fa-rotate-left"></i></button>
            <label><span>${game.i18n.localize("VEILRUNNER.CropZoom")}</span><input name="cropZoom" type="range" min="1" max="5" step="0.05" value="${crop.zoom}" /></label>
            <output class="vr-portrait-crop-value" data-crop-value="cropZoom">${Number(crop.zoom).toFixed(2)}x</output>
          </div>
          <div class="vr-portrait-crop-option vr-portrait-crop-option-range">
            <button type="button" data-crop-reset="cropRotation" title="Reset ${game.i18n.localize("VEILRUNNER.CropRotation")}"><i class="fa-solid fa-rotate-left"></i></button>
            <label><span>${game.i18n.localize("VEILRUNNER.CropRotation")}</span><input name="cropRotation" type="range" min="-180" max="180" step="1" value="${crop.rotation}" /></label>
            <output class="vr-portrait-crop-value" data-crop-value="cropRotation">${crop.rotation}deg</output>
          </div>
        </div>`,
        ok: {
          label: game.i18n.localize("VEILRUNNER.SaveCrop"),
          callback: (event, button) => ({
            x: clampCropNumber(button.form.elements.cropX.value, -100, 200, 50),
            y: clampCropNumber(button.form.elements.cropY.value, -100, 200, 50),
            zoom: clampCropNumber(button.form.elements.cropZoom.value, 1, 5, 1),
            rotation: clampCropNumber(button.form.elements.cropRotation.value, -180, 180, 0),
            flipX: button.form.elements.cropFlipX.checked
          })
        }
      });
      prompt.then(cleanupEditor, cleanupEditor);
      return prompt;
    } catch (err) {
      cleanupEditor();
      throw err;
    }
  }

  static #onToggleEquipment() {
    this.#equipmentOpen = !this.#equipmentOpen;
    this.#animateEquipment = true;
    this.render({ parts: ["equipment", "main"] });
  }

  static #onToggleDetails() {
    this.#detailsOpen = !this.#detailsOpen;
    this.#animateDetails = true;
    this.render({ parts: ["details"] });
  }

  static async #onOpenLevelCanvas() {
    const system = this.actor.system ?? {};
    const level = Number(system.level ?? 0);
    const xp = storedHeroExperience(this.actor);
    const max = xpForLevel(level);
    if (max <= 0 || xp < max) return;

    const nextLevel = level + 1;
    const pointPoolUpdate = (pool, budget) => {
      const current = this.actor.system?.[pool] ?? {};
      const total = Math.max(Number(current.total) || 0, budget);
      const spent = Math.max(0, (Number(current.total) || 0) - (Number(current.available) || 0));
      return { total, available: Math.max(0, total - spent) };
    };
    const attributePoints = pointPoolUpdate("attributePoints", attributePointsForLevel(nextLevel));
    const talentPoints = pointPoolUpdate("talentPoints", talentPointsForLevel(nextLevel));
    const skillPoints = pointPoolUpdate("skillPoints", skillPointsForLevel(nextLevel));
    const update = {
      "system.level": nextLevel,
      "system.experience.value": xp - max,
      "system.experience.max": xpForLevel(nextLevel),
      "system.attributePoints.total": attributePoints.total,
      "system.attributePoints.available": attributePoints.available,
      "system.talentPoints.total": talentPoints.total,
      "system.talentPoints.available": talentPoints.available,
      "system.skillPoints.total": skillPoints.total,
      "system.skillPoints.available": skillPoints.available
    };
    await updateHeroLevel(this.actor, update);

    foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("VEILRUNNER.LevelUpCanvas") },
      rejectClose: false,
      render: activateLevelUpCanvas,
      content: `<div class="vr-level-up-dialog">
        <canvas class="vr-level-up-canvas" aria-label="${game.i18n.localize("VEILRUNNER.LevelUpReady")}" data-level="${level}" data-next-level="${level + 1}" data-xp="${xp}" data-max="${max}"></canvas>
      </div>`,
      ok: { label: game.i18n.localize("VEILRUNNER.Close") }
    });
  }

  static #onOpenCharacterCreation() {
    openCharacterCreation(this.actor);
  }

  static #onOpenPlayerDatapad() {
    openPlayerDatapad();
  }

}
