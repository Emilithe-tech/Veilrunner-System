const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { completedXpBeforeLevel, xpForLevel } from "../data/xp.mjs";
import { attributePointsForLevel, skillPointsForLevel, talentPointsForLevel } from "../data/progression.mjs";
import { VEILRUNNER_PROFESSIONS, findDiscipline } from "../data/professions.mjs";
import { openCharacterCreation } from "../apps/character-creation.mjs";
import { openPlayerDatapad } from "../apps/datapad.mjs";
import { buildPartyOverview, findPartyActorForFolder, findPartyForHero, getPartyMembers } from "../helpers/party.mjs";
import { bringVeilrunnerApplicationToFront } from "../helpers/application-layer.mjs";
import { equipPhysicalItem, itemAcceptsEquipmentSlot, unequipPhysicalItem } from "../items/equipment.mjs";
import { resolveActorActions } from "../data/item/identity.mjs";
import { applyItemWear } from "../items/durability.mjs";
import { equipmentBySlot, itemRequiredSlots } from "../rules/item-rules.mjs";
import { EQUIPMENT_SLOT_COLUMNS, PHYSICAL_ITEM_TYPES, WEAPON_TYPE_GROUPS, itemRarityData, normalizeWeaponType } from "../data/item/physical.mjs";

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
const ACTION_DAMAGE_TYPES = ["pyro", "hydro", "cryo", "floral", "geo", "aero", "electric", "sonic", "light", "void", "slashing", "bludgeoning", "piercing"];
const ACTION_DAMAGE_ICONS = {
  pyro: "fa-solid fa-fire",
  hydro: "fa-solid fa-droplet",
  cryo: "fa-solid fa-snowflake",
  floral: "fa-solid fa-leaf",
  geo: "fa-solid fa-mountain",
  aero: "fa-solid fa-wind",
  electric: "fa-solid fa-bolt",
  sonic: "fa-solid fa-wave-square",
  light: "fa-solid fa-sun",
  void: "fa-solid fa-circle",
  slashing: "fa-solid fa-sword",
  bludgeoning: "fa-solid fa-hammer",
  piercing: "fa-solid fa-crosshairs"
};
const ACTION_SUBTAB_LABELS = {
  favorites: "VEILRUNNER.Favorites",
  actions: "VEILRUNNER.Actions",
  abilities: "VEILRUNNER.Abilities",
  reactions: "VEILRUNNER.Reactions",
  magic: "VEILRUNNER.Magic",
  tech: "VEILRUNNER.Tech"
};
const SETTINGS_SUBTABS = ["ui", "other"];
const INVENTORY_CATEGORIES = [
  { key: "all", icon: "fa-solid fa-layer-group", label: "VEILRUNNER.InventoryCategory.all" },
  { key: "weapon", icon: "fa-solid fa-gun", label: "VEILRUNNER.InventoryCategory.weapon" },
  { key: "ammo", icon: "fa-solid fa-box-open", label: "VEILRUNNER.InventoryCategory.ammo" },
  { key: "armor", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.InventoryCategory.armor" },
  { key: "equipment", icon: "fa-solid fa-toolbox", label: "VEILRUNNER.InventoryCategory.equipment" },
  { key: "consumable", icon: "fa-solid fa-flask", label: "VEILRUNNER.InventoryCategory.consumable" },
  { key: "tech", icon: "fa-solid fa-microchip", label: "VEILRUNNER.InventoryCategory.tech" },
  { key: "keyItem", icon: "fa-solid fa-key", label: "VEILRUNNER.InventoryCategory.keyItem" },
  { key: "junk", icon: "fa-solid fa-recycle", label: "VEILRUNNER.InventoryCategory.junk" }
];
const INVENTORY_SUBTABS = INVENTORY_CATEGORIES.map(category => category.key);
const WEAPON_FILTER_GROUPS = WEAPON_TYPE_GROUPS.map(group => ({
  key: group.key,
  icon: group.icon,
  label: `VEILRUNNER.WeaponFilter.${group.key}`,
  filters: group.types.map(key => ({ key, label: `VEILRUNNER.WeaponFilter.${key}` }))
}));
const INVENTORY_FILTERS = {
  all: [
    { key: "all", icon: "fa-solid fa-layer-group", label: "VEILRUNNER.InventoryFilter.all" }
  ],
  weapon: [
    { key: "allWeapons", icon: "fa-solid fa-layer-group", label: "VEILRUNNER.WeaponFilter.allWeapons" },
    ...WEAPON_FILTER_GROUPS.map(group => ({ key: group.key, icon: group.icon, label: group.label, group: true })),
    ...WEAPON_FILTER_GROUPS.flatMap(group => group.filters)
  ],
  ammo: [
    { key: "ammoAll", icon: "fa-solid fa-box-open", label: "VEILRUNNER.WeaponFilter.ammoAll" },
    { key: "ammoArrows", icon: "fa-solid fa-bow-arrow", label: "VEILRUNNER.WeaponFilter.ammoArrows" },
    { key: "ammoBallistic", icon: "fa-solid fa-circle-dot", label: "VEILRUNNER.WeaponFilter.ammoBallistic" },
    { key: "ammoEnergy", icon: "fa-solid fa-atom", label: "VEILRUNNER.WeaponFilter.ammoEnergy" },
    { key: "ammoLaser", icon: "fa-solid fa-sun", label: "VEILRUNNER.WeaponFilter.ammoLaser" }
  ],
  armor: [
    { key: "armorAll", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.ArmorFilter.allArmor" },
    { key: "armorLight", icon: "fa-solid fa-shield", label: "VEILRUNNER.ArmorFilter.lightArmor" },
    { key: "armorMedium", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.ArmorFilter.mediumArmor" },
    { key: "armorHeavy", icon: "fa-solid fa-user-shield", label: "VEILRUNNER.ArmorFilter.heavyArmor" },
    { key: "armorShields", icon: "fa-solid fa-shield", label: "VEILRUNNER.ArmorFilter.shields" },
    { key: "armorGreatShields", icon: "fa-solid fa-shield-halved", label: "VEILRUNNER.ArmorFilter.greatShields" }
  ]
};
const ABOUT_SUBTABS = ["party", "skills", "biography", "reputation", "relationships", "conditions", "customEffects"];
const PARTY_NAME_MAX_LENGTH = 18;
const RESOURCE_POOLS = ["health", "mana", "stamina", "armor", "shields", "barriers"];
const VALUE_RESOURCES = ["tempHealth", "inspiration", "resolve", "dying", "wounded"];
const QUALITY_FLAW_TIERS = ["Minor", "Moderate", "Significant", "Major", "Extreme"];
const ARCHETYPE_OPTIONS = ["Physique", "Armament", "Magic", "Technical", "Social"];
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
  { archetype: "Technical", profession: "Hardware", disciplines: ["Siliconsmith", "Gridtech", "Fabricator", "Signal Engineer"] },
  { archetype: "Technical", profession: "Software", disciplines: ["Cyber Tech", "Programmer", "Comforcer", "Netrunner"] },
  { archetype: "Technical", profession: "Mechanic", disciplines: ["Auto-Mechanic", "Cyber-mechanic"] },
  { archetype: "Technical", profession: "Vehicle Pilot", disciplines: ["Ground Operator", "Walker Operator", "Marine Operator", "Aerial Operator", "Astromech Operator", "Space Operator"] },
  { archetype: "Technical", profession: "Drone Operator", disciplines: ["Humanoid", "Multipedal", "Aquatic", "Aerial", "Astromech", "Stationary"] },
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
  return archetype === "Tech" ? "Technical" : archetype;
}

function normalizeUiColor(value, fallback) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
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

  if (category === "ammo") {
    if (haystack.includes("laserammo") || haystack.includes("laserround") || haystack.includes("lasercell")) return "ammoLaser";
    if (haystack.includes("energyammo") || haystack.includes("energycell") || haystack.includes("battery")) return "ammoEnergy";
    if (haystack.includes("arrow") || haystack.includes("bolt")) return "ammoArrows";
    if (haystack.includes("ballisticammo") || haystack.includes("ballisticround") || haystack.includes("bullet") || haystack.includes("slug")) return "ammoBallistic";
    return "ammoAll";
  }
  if (category === "armor") {
    const armorType = normalizeInventoryToken(system.armorType ?? explicit);
    if (armorType === "greatshields" || haystack.includes("greatshield")) return "armorGreatShields";
    if (armorType === "shields" || haystack.includes("shield")) return "armorShields";
    if (armorType === "heavy" || haystack.includes("heavyarmor")) return "armorHeavy";
    if (armorType === "medium" || haystack.includes("mediumarmor")) return "armorMedium";
    if (armorType === "light" || haystack.includes("lightarmor")) return "armorLight";
    return "armorAll";
  }

  const canonicalWeaponType = normalizeWeaponType(system.weaponType ?? system.weaponCategory);
  if (WEAPON_TYPE_GROUPS.some(group => group.types.includes(canonicalWeaponType))) return canonicalWeaponType;

  if (haystack.includes("marksmanrifle") || haystack.includes("heavyrifle")) return "marksmanRifle";
  if (haystack.includes("sniperrifle") || haystack.includes("sniper")) return "sniperRifle";
  if (haystack.includes("assaultrifle")) return "assaultRifle";
  if (haystack.includes("shotgun")) return "shotgun";
  if (haystack.includes("projector") || haystack.includes("heavycannon") || haystack.includes("cannon")) return "projector";
  if (haystack.includes("machinegun") || haystack.includes("lightmachinegun") || haystack.includes("lmg")) return "machineGun";
  if (haystack.includes("launcher") || haystack.includes("bazooka") || haystack.includes("rpg")) return "launcher";
  if (haystack.includes("grimoire") || haystack.includes("greatstaff") || haystack.includes("greatstave")) return "grimoire";
  if (haystack.includes("wand")) return "wand";
  if (haystack.includes("scepter") || haystack.includes("sceptre")) return "scepter";
  if (haystack.includes("polearm") || haystack.includes("spear") || haystack.includes("halberd")) return "polearm";
  if (haystack.includes("staff") || haystack.includes("stave")) return "staff";
  if (haystack.includes("unarmed") || haystack.includes("fist") || haystack.includes("knuckle")) return "unarmed";
  if (haystack.includes("heavyblade") || haystack.includes("greatsword") || haystack.includes("claymore")) return "heavyBlade";
  if (haystack.includes("coil") || haystack.includes("flexible") || haystack.includes("whip") || haystack.includes("flail")) return "coil";
  if (haystack.includes("thrown") || haystack.includes("javelin") || haystack.includes("shuriken")) return "thrown";
  if (haystack.includes("bow") || haystack.includes("crossbow")) return "bow";
  if (haystack.includes("taser") || haystack.includes("stungun")) return "taser";
  if (haystack.includes("smg") || haystack.includes("submachine")) return "smg";
  if (haystack.includes("pistol") || haystack.includes("sidearm")) return "pistol";
  if (haystack.includes("longblade") || haystack.includes("sword") || haystack.includes("katana")) return "longBlade";
  if (haystack.includes("shortblade") || haystack.includes("knife") || haystack.includes("dagger")) return "shortBlade";
  if (haystack.includes("club") || haystack.includes("baton") || haystack.includes("mace") || haystack.includes("hammer") || haystack.includes("maul")) return "blunt";
  if (haystack.includes("melee")) return "unarmed";
  return category === "weapon" ? "allWeapons" : "";
}

function inventoryItemMatchesFilter(item, filter) {
  if (filter === "all") return true;
  const inventoryFilterKey = item.inventoryFilterKey;
  if (!inventoryFilterKey) return false;
  if (filter === "allWeapons") return true;
  const weaponGroup = WEAPON_FILTER_GROUPS.find(group => group.key === filter);
  if (weaponGroup) return weaponGroup.filters.some(entry => entry.key === inventoryFilterKey);
  if (filter === "ammoAll") return inventoryFilterKey.startsWith("ammo");
  if (filter === "armorAll") return inventoryFilterKey.startsWith("armor");
  return inventoryFilterKey === filter;
}

/** Hero sheet. */
export default class VeilrunnerHeroSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static MAIN_WIDTH = 890;
  static SIDE_GUTTER = 24;
  static BASE_WIDTH = VeilrunnerHeroSheet.MAIN_WIDTH + (VeilrunnerHeroSheet.SIDE_GUTTER * 2);
  static BASE_HEIGHT = 1018;
  static DRAWER_WIDTH = 260;
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
      setInventoryLayout: VeilrunnerHeroSheet.#onSetInventoryLayout,
      equipInventoryItem: VeilrunnerHeroSheet.#onEquipInventoryItem,
      throwInventoryItem: VeilrunnerHeroSheet.#onThrowInventoryItem,
      useInventoryItem: VeilrunnerHeroSheet.#onUseInventoryItem,
      showInventoryItemDetails: VeilrunnerHeroSheet.#onShowInventoryItemDetails,
      closeInventoryItemDetails: VeilrunnerHeroSheet.#onCloseInventoryItemDetails,
      toggleSheetOption: VeilrunnerHeroSheet.#onToggleSheetOption,
      togglePan: VeilrunnerHeroSheet.#onTogglePan,
      setInventoryWeaponFilter: VeilrunnerHeroSheet.#onSetInventoryWeaponFilter,
      setActionView: VeilrunnerHeroSheet.#onSetActionView,
      setActionCardSort: VeilrunnerHeroSheet.#onSetActionCardSort,
      sortActionList: VeilrunnerHeroSheet.#onSortActionList,
      showActionDetails: VeilrunnerHeroSheet.#onShowActionDetails,
      sendActionToChat: VeilrunnerHeroSheet.#onSendActionToChat,
      rollAction: VeilrunnerHeroSheet.#onRollAction,
      executeFirearmAction: VeilrunnerHeroSheet.#onExecuteFirearmAction,
      rollInitiative: VeilrunnerHeroSheet.#onRollInitiative,
      sendQualityFlawToChat: VeilrunnerHeroSheet.#onSendQualityFlawToChat,
      setEquipTab: VeilrunnerHeroSheet.#onSetEquipTab,
      openEquipmentTab: VeilrunnerHeroSheet.#onOpenEquipmentTab,
      unequip: VeilrunnerHeroSheet.#onUnequip,
      toggleEditMode: VeilrunnerHeroSheet.#onToggleEditMode,
      setAppearanceImage: VeilrunnerHeroSheet.#onSetAppearanceImage,
      setCharacterBackgroundImage: VeilrunnerHeroSheet.#onSetCharacterBackgroundImage,
      setPortraitImage: VeilrunnerHeroSheet.#onSetPortraitImage,
      setEquipmentImage: VeilrunnerHeroSheet.#onSetEquipmentImage,
      setEquipmentBackgroundImage: VeilrunnerHeroSheet.#onSetEquipmentBackgroundImage,
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
    main: {
      template: "systems/veilrunner/templates/actor/hero/parts/main.hbs",
      templates: [
        "systems/veilrunner/templates/actor/hero/parts/drawer-handles.hbs",
        "systems/veilrunner/templates/actor/hero/parts/top-nav.hbs"
      ]
    },
    details: { template: "systems/veilrunner/templates/actor/hero/parts/details.hbs" }
  };

  section = "character";
  subTabs = {
    character: "stats",
    actions: "actions",
    inventory: "all",
    about: "skills",
    settings: "ui"
  };
  inventoryWeaponFilter = "all";
  inventoryFiltersOpen = false;
  inventoryLayout = "list";
  inventorySearch = "";
  inventoryDetailsItemId = null;
  equipTab = "equipped";
  actionCardSort = "name-asc";
  actionListSort = { key: "name", direction: "asc" };
  actionDetailsItemId = null;
  actionDetailsDrawer = false;
  #clearActionDetailsAfterClose = false;

  #equipmentOpen = false;
  #lastEquipmentOpen = false;
  #animateEquipment = false;
  #detailsOpen = false;
  #lastDetailsOpen = false;
  #animateDetails = false;
  #detailsClosing = false;
  #detailsCloseTimeout = null;
  #sheetRevealTimeout = null;
  #detailsFrameWidth = VeilrunnerHeroSheet.BASE_WIDTH;
  #drawerHandleTop = { left: 50, right: 50 };
  #editMode = false;
  #debouncedRender = foundry.utils.debounce(() => this.render(), 50);
  #hookIds = [];
  #inventoryItemContextMenu = null;
  #inventoryItemContextDismiss = null;
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
  _getFrameButtons(options) {
    const buttons = super._getFrameButtons(options);
    buttons.unshift({
      action: "toggleEditMode",
      icon: `fa-solid ${this.#editMode ? "fa-toggle-on" : "fa-toggle-off"}`,
      label: "VEILRUNNER.EditMode"
    });
    return buttons;
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.element && !this.element.dataset.veilrunnerFrontBinding) {
      this.element.dataset.veilrunnerFrontBinding = "true";
      this.element.addEventListener("pointerdown", () => bringVeilrunnerApplicationToFront(this.element, this), { passive: true });
    }
    this.#syncFrameEditToggle();
    this.#bindPersonaAxisControls();
    this.#bindInventoryItemContextMenu();
    this.#bindInventorySearch();
    this.#bindStatusTrackControls();
    this.#bindProfessionFilters();
    this.#bindIdentitySelect();
    this.#bindUiCustomization();
    this.#bindPartyMemberSheetOpeners();
    this.#bindActionWorkspaceControls();
    this.#applySheetPalette(context.sheetOptions);
    this.#syncPartyListScroll();
    this.#applyDrawerState();
    this.#bindDrawerHandleDragging();
    this.#playPendingNavAnimation();
    this.#clearPendingTabAnimations();
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    // Display-only option buttons update their affected elements directly.
    // Do not let their actor update recreate the main application part.
    if (options?.veilrunnerPreserveMainPosition) return;
    return super._onUpdate(changed, options, userId);
  }

  /** @override */
  async _onClose(options) {
    this.#closeInventoryItemContextMenu();
    this.#unbindPartyHooks();
    await super._onClose(options);
  }

  #syncFrameEditToggle(source) {
    const buttons = new Set();
    const addButtons = root => {
      if (!root) return;
      if (root.matches?.("[data-action='toggleEditMode']")) buttons.add(root);
      for (const button of root.querySelectorAll?.("[data-action='toggleEditMode']") ?? []) buttons.add(button);
    };

    addButtons(source);
    let root = this.element;
    while (root) {
      addButtons(root);
      if (root.matches?.(".application, .app, .window-app")) break;
      root = root.parentElement;
    }
    for (const button of buttons) {
      const control = button.closest("li") ?? button;
      control.classList?.toggle("active", this.#editMode);
      button.classList?.toggle("active", this.#editMode);
      control.dataset.editMode = this.#editMode ? "on" : "off";
      button.dataset.editMode = this.#editMode ? "on" : "off";
      button.setAttribute?.("aria-pressed", this.#editMode ? "true" : "false");
      button.classList.remove("fa-toggle-on", "fa-toggle-off");
      button.classList.add("fa-solid", this.#editMode ? "fa-toggle-on" : "fa-toggle-off");
    }
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

  /** Right-click an owned inventory item to access destructive item actions. */
  #bindInventoryItemContextMenu() {
    const root = this.element;
    if (!root || root.dataset.veilrunnerInventoryContextBinding) return;
    root.dataset.veilrunnerInventoryContextBinding = "true";
    root.addEventListener("contextmenu", event => this.#onInventoryItemContextMenu(event));
  }

  /** Filter rendered inventory rows without recreating the sheet on every keystroke. */
  #bindInventorySearch() {
    const input = this.element?.querySelector("[data-inventory-search]");
    if (!input || input.dataset.veilrunnerSearchBinding) return;
    input.dataset.veilrunnerSearchBinding = "true";
    input.addEventListener("input", () => {
      this.inventorySearch = input.value;
      const query = normalizeInventoryToken(input.value);
      for (const row of this.element.querySelectorAll(".inventory-item-row")) {
        row.hidden = Boolean(query) && !normalizeInventoryToken(row.textContent).includes(query);
      }
    });
  }

  #onInventoryItemContextMenu(event) {
    if (this.section !== "inventory" || !this.actor.isOwner) return;
    const row = event.target.closest?.(".inventory-item-row[data-item-id]");
    const item = this.actor.items.get(row?.dataset.itemId);
    if (!item?.isOwner) return;

    event.preventDefault();
    event.stopPropagation();
    this.#openInventoryItemContextMenu(event, item);
  }

  #openInventoryItemContextMenu(event, item) {
    this.#closeInventoryItemContextMenu();
    const menu = document.createElement("menu");
    menu.className = "vr-inventory-item-context-menu";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i><span>Remove</span>';
    remove.addEventListener("click", async () => {
      this.#closeInventoryItemContextMenu();
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Remove Item" },
        content: `<p>Remove <strong>${foundry.utils.escapeHTML(item.name)}</strong> from this character?</p>`,
        modal: true
      });
      if (!confirmed || !this.actor.isOwner || !item.isOwner) return;
      try {
        await item.delete();
      } catch (error) {
        console.error("Veilrunner | Failed to remove inventory item", error);
        ui.notifications.error(`Could not remove ${item.name}.`);
      }
    });
    menu.append(remove);
    menu.addEventListener("contextmenu", innerEvent => innerEvent.preventDefault());
    document.body.append(menu);
    this.#inventoryItemContextMenu = menu;
    this.#inventoryItemContextDismiss = dismissEvent => {
      if (!menu.contains(dismissEvent.target)) this.#closeInventoryItemContextMenu();
    };
    document.addEventListener("pointerdown", this.#inventoryItemContextDismiss, true);
  }

  #closeInventoryItemContextMenu() {
    this.#inventoryItemContextMenu?.remove();
    this.#inventoryItemContextMenu = null;
    if (this.#inventoryItemContextDismiss) document.removeEventListener("pointerdown", this.#inventoryItemContextDismiss, true);
    this.#inventoryItemContextDismiss = null;
  }

  /** Select elements do not use the application's button action listener. */
  #bindActionWorkspaceControls() {
    const sort = this.element?.querySelector("select[data-action='setActionCardSort']");
    if (!sort) return;
    sort.addEventListener("change", event => VeilrunnerHeroSheet.#onSetActionCardSort.call(this, event, sort));
  }

  /** Enable Party-list scrolling only when the rendered member rows overflow its available space. */
  #syncPartyListScroll() {
    const list = this.element?.querySelector(".party-member-list");
    if (!list) return;

    requestAnimationFrame(() => {
      list.classList.toggle("is-scrollable", list.scrollHeight > list.clientHeight + 1);
    });
  }

  /** Open a visible party member's sheet from their name or sheet icon. */
  #bindPartyMemberSheetOpeners() {
    for (const name of this.element?.querySelectorAll(".party-member-name[data-actor-id]") ?? []) {
      name.addEventListener("dblclick", event => {
        event.preventDefault();
        game.actors.get(name.dataset.actorId)?.sheet?.render(true);
      });
    }
    for (const button of this.element?.querySelectorAll(".party-member-sheet-open[data-actor-id]") ?? []) {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        game.actors.get(button.dataset.actorId)?.sheet?.render(true);
      });
    }
  }

  /** Preview UI palette choices as they are adjusted, before the form persists them. */
  #bindUiCustomization() {
    const mainPanel = this.element?.querySelector(".main-panel");
    if (!mainPanel) return;
    const defaultColors = {
      uiColor: "#101216",
      categoryHighlightColor: "#a855f7",
      characterBorderColor: "#66717d",
      characterBackgroundColor: "#000000",
      manaTextColor: "#60a5fa",
      staminaTextColor: "#f59e0b",
      levelUpColor: "#22d3ee",
      earnedXpColor: "#22d3ee",
      totalXpColor: "#12141c",
      levelUpGlowColor: "#22d3ee",
      panOffColor: "#ff0000",
      panOnColor: "#00ff49",
      panInterferenceColor: "#fbbf24"
    };
    const colorProperties = {
      categoryHighlightColor: "--vr-accent",
      panOffColor: "--vr-pan-off",
      panOnColor: "--vr-pan-on",
      panInterferenceColor: "--vr-pan-interference",
      characterBorderColor: "--vr-character-border",
      characterBackgroundColor: "--vr-character-background",
      manaTextColor: "--vr-mana-text",
      staminaTextColor: "--vr-stamina-text",
      levelUpColor: "--vr-level-up",
      earnedXpColor: "--vr-earned-xp",
      totalXpColor: "--vr-total-xp",
      levelUpGlowColor: "--vr-level-up-glow"
    };
    const persistentUiOptionKeys = new Set(["uiColor", "colorVision", ...Object.keys(colorProperties)]);
    const updateUiOption = (key, value) => this.actor.update({ [`system.sheetOptions.${key}`]: value }, {
      render: false,
      veilrunnerPreserveMainPosition: true
    });
    mainPanel.querySelectorAll("button[data-reset-ui-color], button[data-reset-ui-slider]").forEach(button => {
      const resetTitle = button.title || "Reset to default";
      button.replaceChildren(Object.assign(document.createElement("i"), { className: "fa-solid fa-rotate-left" }));
      button.title = resetTitle;
      button.setAttribute("aria-label", resetTitle);
    });
    const sliderDescriptors = {
      levelUpBrightness: value => (Math.max(0.25, Math.min(2, Number(value) || 1))).toFixed(2),
      levelUpIntensity: value => (Math.max(0.25, Math.min(2, Number(value) || 1))).toFixed(2),
      levelUpGlowIntensity: value => (Math.max(0.25, Math.min(2, Number(value) || 1))).toFixed(2)
    };
    mainPanel.querySelectorAll("[data-ui-preview]").forEach(control => {
      const preview = () => {
        const key = control.dataset.uiPreview;
        const property = colorProperties[key];
        if (property) mainPanel.style.setProperty(property, normalizeUiColor(control.value, mainPanel.style.getPropertyValue(property)));
        if (key === "levelUpBrightness") mainPanel.style.setProperty("--vr-level-brightness", Math.max(0.25, Math.min(2, Number(control.value) || 1)));
        if (key === "levelUpIntensity") mainPanel.style.setProperty("--vr-level-rate-duration", `${1.35 / Math.max(0.25, Math.min(2, Number(control.value) || 1))}s`);
        if (key === "levelUpGlowIntensity") mainPanel.style.setProperty("--vr-level-intensity", Math.max(0.25, Math.min(2, Number(control.value) || 1)));
        if (sliderDescriptors[key]) {
          mainPanel.querySelectorAll(`[data-ui-value="${key}"]`).forEach(output => {
            output.value = sliderDescriptors[key](control.value);
          });
        }
        const values = Object.fromEntries(Array.from(mainPanel.querySelectorAll("[data-ui-preview]"))
          .map(entry => [entry.dataset.uiPreview, entry.value]));
        this.#applySheetPalette(values);
      };
      control.addEventListener("input", preview);
      control.addEventListener("change", async event => {
        preview();
        const key = control.dataset.uiPreview;
        if (!persistentUiOptionKeys.has(key)) return;
        // These controls normally submit through the sheet form, which rerenders it
        // and resets its scroll position. Persist them like the option buttons instead.
        event.stopPropagation();
        await updateUiOption(key, control.value);
      });
    });
    mainPanel.querySelectorAll("[data-reset-ui-color]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const key = button.dataset.resetUiColor;
        const color = defaultColors[key];
        const input = mainPanel.querySelector(`[data-ui-preview="${key}"]`);
        if (!color || !input) return;
        input.value = color;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        await updateUiOption(key, color);
      });
    });
    mainPanel.querySelectorAll("[data-reset-theme]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: game.i18n.localize("VEILRUNNER.ResetThemeTitle") },
          content: `<p>${game.i18n.localize("VEILRUNNER.ResetThemeConfirm")}</p>`,
          yes: { label: game.i18n.localize("VEILRUNNER.ResetTheme"), callback: () => true },
          no: { label: game.i18n.localize("VEILRUNNER.Cancel"), callback: () => false },
          rejectClose: false
        });
        if (!confirmed) return;
        const defaults = {
          ...defaultColors,
          colorVision: "default",
          levelUpBrightness: 1,
          levelUpIntensity: 1,
          levelUpGlowIntensity: 1
        };
        const update = Object.fromEntries(Object.entries(defaults)
          .map(([key, value]) => [`system.sheetOptions.${key}`, value]));
        await this.actor.update(update);
      });
    });
    mainPanel.querySelectorAll("[data-ui-value]").forEach(input => {
      input.addEventListener("change", async () => {
        const key = input.dataset.uiValue;
        const slider = mainPanel.querySelector(`input[type="range"][data-ui-preview="${key}"]`);
        if (!slider || !sliderDescriptors[key]) return;
        slider.value = sliderDescriptors[key](input.value);
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await this.actor.update({ [`system.sheetOptions.${key}`]: Number(slider.value) });
      });
    });
    mainPanel.querySelectorAll("[data-reset-ui-slider]").forEach(button => {
      button.addEventListener("click", async event => {
        event.preventDefault();
        const key = button.dataset.resetUiSlider;
        const slider = mainPanel.querySelector(`input[type="range"][data-ui-preview="${key}"]`);
        if (!slider || !sliderDescriptors[key]) return;
        slider.value = "1";
        slider.dispatchEvent(new Event("input", { bubbles: true }));
        await this.actor.update({ [`system.sheetOptions.${key}`]: 1 });
      });
    });
  }

  /** Apply the saved accessibility and UI palette to the complete application, including its header and scrollbars. */
  #applySheetPalette(options = {}) {
    const root = this.element;
    if (!root) return;
    const colorVision = ["default", "protanopia", "deuteranopia", "tritanopia"].includes(options.colorVision) ? options.colorVision : "default";
    const uiColor = normalizeUiColor(options.uiColor, "#101216");
    root.classList.remove("color-vision-default", "color-vision-protanopia", "color-vision-deuteranopia", "color-vision-tritanopia");
    root.classList.add(`color-vision-${colorVision}`);
    root.style.setProperty("--vr-ui-color", uiColor);
    root.style.setProperty("--vr-accent", normalizeUiColor(options.categoryHighlightColor, "#a855f7"));
    root.style.setProperty("--vr-pan-off", normalizeUiColor(options.panOffColor, "#ff0000"));
    root.style.setProperty("--vr-pan-on", normalizeUiColor(options.panOnColor, "#00ff49"));
    root.style.setProperty("--vr-pan-interference", normalizeUiColor(options.panInterferenceColor, "#fbbf24"));
    const resourcePalette = {
      default: { health: "#f87171", mana: "#60a5fa", stamina: "#f59e0b", armor: "#cbd5e1", shields: "#22d3ee", barriers: "#c084fc" },
      protanopia: { health: "#d6a35f", mana: "#4c78d1", stamina: "#2aa7a0", armor: "#d0d7df", shields: "#2aa7a0", barriers: "#4c78d1" },
      deuteranopia: { health: "#d5895d", mana: "#457b9d", stamina: "#e9c46a", armor: "#d0d7df", shields: "#457b9d", barriers: "#e9c46a" },
      tritanopia: { health: "#d85f6f", mana: "#2f8fce", stamina: "#e08a4f", armor: "#d0d7df", shields: "#2f8fce", barriers: "#e08a4f" }
    }[colorVision];
    root.style.setProperty("--vr-resource-health", resourcePalette.health);
    root.style.setProperty("--vr-resource-mana", resourcePalette.mana);
    root.style.setProperty("--vr-resource-stamina", resourcePalette.stamina);
    root.style.setProperty("--vr-resource-armor", resourcePalette.armor);
    root.style.setProperty("--vr-resource-shields", resourcePalette.shields);
    root.style.setProperty("--vr-resource-barriers", resourcePalette.barriers);
  }

  /** Update defensive-bar visibility in place, avoiding a main-panel redraw and scroll reset. */
  #syncResourceBarVisibility() {
    const options = this.actor.system.sheetOptions ?? {};
    const resourceIsActive = key => Number(this.actor.system.resources?.[key]?.max ?? this.actor.system.resources?.[key]?.value ?? 0) > 0;
    const visible = {
      armor: this.#editMode || options.showAllResourceBars || options.showArmorResourceBar || resourceIsActive("armor"),
      shields: this.#editMode || options.showAllResourceBars || options.showShieldsResourceBar || resourceIsActive("shields"),
      barriers: this.#editMode || options.showAllResourceBars || options.showBarriersResourceBar || resourceIsActive("barriers")
    };
    this.element?.querySelectorAll("[data-resource-bar]").forEach(bar => {
      bar.closest(".stat")?.toggleAttribute("hidden", !visible[bar.dataset.resourceBar]);
    });
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

      const updatePips = rawValue => {
        const value = clampPersonaValue(rawValue);
        const left = Math.floor(Math.max(0, -value) / 10);
        const right = Math.floor(Math.max(0, value) / 10);
        const pips = field.querySelector(".persona-axis-pips");
        pips?.style.setProperty("--persona-position", `${(value + 100) / 2}%`);
        pips?.querySelectorAll(".left i").forEach((pip, index) => pip.classList.toggle("active", index >= 10 - left));
        pips?.querySelectorAll(".right i").forEach((pip, index) => pip.classList.toggle("active", index < right));
      };

      range.addEventListener("input", () => {
        input.value = range.value;
        updatePips(range.value);
      });

      input.addEventListener("input", () => {
        range.value = input.value;
        updatePips(input.value);
      });

      input.addEventListener("change", () => {
        const value = clampPersonaValue(input.value);
        input.value = value;
        range.value = value;
        updatePips(value);
        range.dispatchEvent(new Event("change", { bubbles: true }));
      });
    }
  }

  #applyDrawerState() {
    const wc = this.element?.querySelector(".window-content");
    const detailsAnimating = this.#animateDetails && this.#lastDetailsOpen !== this.#detailsOpen;
    const detailsCloseStarted = this.#animateDetails && this.#lastDetailsOpen && !this.#detailsOpen;
    if (this.#detailsOpen) this.#detailsClosing = false;
    else if (detailsCloseStarted) this.#detailsClosing = true;

    const detailsClosing = this.#detailsClosing;
    const detailsVisible = this.#detailsOpen || detailsClosing;
    const width = VeilrunnerHeroSheet.BASE_WIDTH
      + (detailsVisible ? VeilrunnerHeroSheet.DRAWER_WIDTH : 0);

    // Foundry repaints grid parts while its application frame changes width. Expand once
    // before opening, then keep the closed drawer visually concealed in that reserved space.
    if (detailsAnimating && this.#detailsOpen) {
      this.#detailsFrameWidth = width;
      this.#setSheetWidth(width);
    }

    // Restore the Foundry window chrome in the drawer's closing transition, not
    // after it has finished. This keeps the header controls in sync with the drawer.
    if (detailsCloseStarted) {
      this.#detailsFrameWidth = VeilrunnerHeroSheet.BASE_WIDTH;
      this.#setSheetFrameWidth(this.#detailsFrameWidth);
    }

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
    if (detailsPart) {
      const headerPart = this.element?.querySelector('[data-application-part="header"]');
      const headerHeight = `${headerPart?.offsetHeight ?? 0}px`;
      detailsPart.style.setProperty("--vr-header-height", headerHeight);
      wc?.style.setProperty("--vr-header-height", headerHeight);
      this.#slideDetailsDrawer(detailsPart, detailsClosing, detailsAnimating, width);
    }
    else this.#setSheetWidth(this.#detailsFrameWidth);
  }

  #setSheetWidth(width) {
    try {
      this.setPosition({ width });
    } catch (err) {
      console.warn("Veilrunner | setPosition failed, forcing frame width directly", err);
    }
    this.#setSheetFrameWidth(width);
  }

  #setSheetFrameWidth(width) {
    if (this.position) this.position.width = width;
    if (this.options?.position) this.options.position.width = width;
    const frame = this.#sheetFrameElement();
    if (frame) frame.style.width = `${width}px`;
    for (const header of this.#windowHeaders()) header.style.width = `${width}px`;
  }

  #animateSheetReveal(reveal) {
    const elements = this.#sheetRevealElements();
    if (!elements.length) return;

    const concealedRight = VeilrunnerHeroSheet.DRAWER_WIDTH - VeilrunnerHeroSheet.SIDE_GUTTER;
    const concealed = `inset(0 ${concealedRight}px 0 0)`;
    const from = reveal ? concealed : "inset(0)";
    const target = reveal ? "inset(0)" : concealed;

    window.clearTimeout(this.#sheetRevealTimeout);
    for (const element of elements) {
      element.style.transition = "none";
      element.style.clipPath = from;
      void element.offsetWidth;
      element.style.transition = `clip-path ${VeilrunnerHeroSheet.DRAWER_ANIMATION_MS}ms ease`;
    }
    requestAnimationFrame(() => {
      for (const element of elements) element.style.clipPath = target;
    });
    this.#sheetRevealTimeout = window.setTimeout(() => {
      for (const element of elements) {
        element.style.removeProperty("transition");
        if (reveal) element.style.removeProperty("clip-path");
      }
    }, VeilrunnerHeroSheet.DRAWER_ANIMATION_MS);
  }

  #resetSheetReveal() {
    window.clearTimeout(this.#sheetRevealTimeout);
    for (const element of this.#sheetRevealElements()) {
      element.style.removeProperty("transition");
      element.style.removeProperty("clip-path");
    }
  }

  #setSheetReveal(revealed) {
    const elements = this.#sheetRevealElements();
    if (!revealed) {
      for (const header of this.#windowHeaders()) {
        header.style.width = `${VeilrunnerHeroSheet.BASE_WIDTH}px`;
      }
    }
    if (!elements.length) return;
    const concealedRight = VeilrunnerHeroSheet.DRAWER_WIDTH - VeilrunnerHeroSheet.SIDE_GUTTER;
    for (const element of elements) {
      element.style.transition = "none";
      if (revealed || this.#detailsFrameWidth === VeilrunnerHeroSheet.BASE_WIDTH) element.style.removeProperty("clip-path");
      else element.style.clipPath = `inset(0 ${concealedRight}px 0 0)`;
      void element.offsetWidth;
      element.style.removeProperty("transition");
    }
  }

  #sheetRevealElements() {
    return [];
  }

  #windowHeaders() {
    const frame = this.#sheetFrameElement();
    const application = this.element?.closest(".application, .app, .window-app");
    return [...new Set([
      frame?.querySelector(":scope > .window-header"),
      this.element?.querySelector(".window-header"),
      application?.querySelector(":scope > .window-header")
    ].filter(Boolean))];
  }

  #bindDrawerHandleDragging() {
    const main = this.element?.querySelector('[data-application-part="main"]');
    if (!main) return;

    for (const handle of main.querySelectorAll(".drawer-handle")) {
      const side = handle.classList.contains("handle-left") ? "left" : "right";
      handle.style.setProperty("--vr-drawer-handle-top", `${this.#drawerHandleTop[side]}%`);

      let drag = null;
      let moved = false;
      handle.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const mainRect = main.getBoundingClientRect();
        const handleRect = handle.getBoundingClientRect();
        drag = {
          startY: event.clientY,
          startCenter: handleRect.top - mainRect.top + (handleRect.height / 2),
          mainRect
        };
        moved = false;
      });
      handle.addEventListener("pointermove", event => {
        if (!drag) return;
        const distance = event.clientY - drag.startY;
        if (Math.abs(distance) > 3 && !moved) {
          moved = true;
          handle.classList.add("is-dragging");
          handle.setPointerCapture(event.pointerId);
        }
        if (!moved) return;
        const halfHeight = handle.offsetHeight / 2;
        const center = Math.max(halfHeight, Math.min(drag.mainRect.height - halfHeight, drag.startCenter + distance));
        this.#drawerHandleTop[side] = (center / drag.mainRect.height) * 100;
        handle.style.setProperty("--vr-drawer-handle-top", `${this.#drawerHandleTop[side]}%`);
      });
      const finishDrag = event => {
        if (!drag) return;
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        handle.classList.remove("is-dragging");
        if (moved) {
          handle.addEventListener("click", cancelClick, { capture: true, once: true });
        }
        drag = null;
      };
      handle.addEventListener("pointerup", finishDrag);
      handle.addEventListener("pointercancel", finishDrag);
      const cancelClick = event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        moved = false;
      };
    }
  }

  #sheetFrameElement() {
    return this.element?.closest(".application, .app, .window-app") ?? this.element;
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

  #slideDetailsDrawer(detailsPart, detailsClosing, animate, sheetWidth) {
    const closedTransform = "translateX(calc(-100% - 2px))";
    const openTransform = "translateX(0)";
    this.#animateDetails = false;
    this.#lastDetailsOpen = this.#detailsOpen;
    if (animate || this.#detailsOpen) window.clearTimeout(this.#detailsCloseTimeout);
    detailsPart.style.visibility = this.#detailsOpen || detailsClosing ? "visible" : "hidden";

    if (!animate) {
      detailsPart.style.transition = "none";
      detailsPart.style.transform = this.#detailsOpen ? openTransform : closedTransform;
      void detailsPart.offsetWidth;
      detailsPart.style.transition = "";
      if (this.#detailsOpen) {
        this.#detailsFrameWidth = sheetWidth;
        this.#resetSheetReveal();
        this.#setSheetWidth(sheetWidth);
      } else {
        this.#setSheetReveal(false);
        this.#setSheetWidth(this.#detailsFrameWidth);
      }
      return;
    }

    detailsPart.style.transition = "none";
    detailsPart.style.transform = this.#detailsOpen ? closedTransform : openTransform;
    void detailsPart.offsetWidth;
    detailsPart.style.transition = "";
    requestAnimationFrame(() => {
      detailsPart.style.transform = this.#detailsOpen ? openTransform : closedTransform;
    });

    if (!detailsClosing) return;

    this.#detailsCloseTimeout = window.setTimeout(() => {
      if (this.#detailsOpen) return;
      if (this.#clearActionDetailsAfterClose) {
        this.actionDetailsItemId = null;
        this.actionDetailsDrawer = false;
        this.#clearActionDetailsAfterClose = false;
      }
      this.#detailsClosing = false;
      const windowContent = this.element?.querySelector(".window-content");
      windowContent?.classList.remove("details-open", "details-closing");
      windowContent?.classList.add("details-reserved");
      detailsPart.style.visibility = "hidden";
      detailsPart.style.transition = "none";
      detailsPart.style.transform = closedTransform;
      void detailsPart.offsetWidth;
      detailsPart.style.transition = "";
    }, VeilrunnerHeroSheet.DRAWER_ANIMATION_MS);
  }

  #pinEquipmentWidth(equipmentPart) {
    const heroColumn = this.element?.querySelector(".hero-column");
    const content = this.element?.querySelector(".window-content");
    const heroRect = heroColumn?.getBoundingClientRect();
    const contentRect = content?.getBoundingClientRect();
    const indicatorOffset = 10;
    let reference = 0;
    if (heroRect && contentRect) reference = heroRect.right - contentRect.left + indicatorOffset;
    else if (heroColumn?.offsetWidth) reference = heroColumn.offsetWidth + indicatorOffset;
    if (!reference) return;
    equipmentPart.style.setProperty("--vr-equipment-width", `${Math.round(reference)}px`);
  }

  /** Party hooks. */
  #bindPartyHooks() {
    const id = Hooks.on("updateActor", (doc, change, options) => {
      if (!this.rendered) return;
      if (options?.veilrunnerPreserveMainPosition) return;
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
    const clampedHealthPercent = Math.max(0, Math.min(100, healthPercent));
    const healthHue = Math.round((clampedHealthPercent / 100) * 120);
    const healthLightness = Math.round(50 - ((clampedHealthPercent / 100) * 10));
    const healthColor = `hsl(${healthHue}, 88%, ${healthLightness}%)`;
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
    context.resolvePoints = trackPoints(resolveValue, 5);
    context.dyingPoints = trackPoints(dyingValue);
    context.woundedPoints = trackPoints(woundedValue);
    context.system = system;
    context.characterArchetype = characterArchetype;
    context.disciplineInitial = String(system.discipline ?? "").trim().charAt(0).toUpperCase() || "?";
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
    context.personaAxes = PERSONA_AXES.map((axis, index) => {
      const value = clampPersonaValue(system.personaIndex?.[axis.key]);
      const left = Math.floor(Math.max(0, -value) / 10);
      const right = Math.floor(Math.max(0, value) / 10);
      return {
        ...axis,
        index,
        path: `system.personaIndex.${axis.key}`,
        value,
        signedValue: value > 0 ? `+${value}` : String(value),
        percent: (value + 100) / 2,
        leftPips: Array.from({ length: 10 }, (_, pip) => ({ active: pip >= 10 - left })),
        rightPips: Array.from({ length: 10 }, (_, pip) => ({ active: pip < right }))
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
    context.equipmentBackgroundImage = system.equipmentBackgroundImage || "";
    context.characterBackgroundImage = system.characterBackgroundImage || "";
    const storedUiColor = normalizeUiColor(system.sheetOptions?.uiColor, "#101216");
    const storedHidePartyList = foundry.utils.getProperty(actor._source, "system.sheetOptions.hidePartyList");
    const sheetOptions = {
      // Preserve the former positive setting for existing heroes while the UI uses the clearer hide toggle.
      hidePartyList: typeof storedHidePartyList === "boolean" ? storedHidePartyList : system.sheetOptions?.showPartyList === false,
      showAllPartyResources: Boolean(system.sheetOptions?.showAllPartyResources),
      showAllResourceBars: Boolean(system.sheetOptions?.showAllResourceBars),
      showArmorResourceBar: Boolean(system.sheetOptions?.showArmorResourceBar),
      showShieldsResourceBar: Boolean(system.sheetOptions?.showShieldsResourceBar),
      showBarriersResourceBar: Boolean(system.sheetOptions?.showBarriersResourceBar),
      actionsView: system.sheetOptions?.actionsView === "list" ? "list" : "card",
      colorVision: ["default", "protanopia", "deuteranopia", "tritanopia"].includes(system.sheetOptions?.colorVision) ? system.sheetOptions.colorVision : "default",
      // The earlier UI-color control used the category purple as its implicit default.
      // Treat that legacy value as the new subdued-black default unless the player selects another color.
      uiColor: storedUiColor.toLowerCase() === "#a855f7" ? "#101216" : storedUiColor,
      categoryHighlightColor: normalizeUiColor(system.sheetOptions?.categoryHighlightColor, "#a855f7"),
      panOffColor: normalizeUiColor(system.sheetOptions?.panOffColor, "#ff0000"),
      panOnColor: normalizeUiColor(system.sheetOptions?.panOnColor, "#00ff49"),
      panInterferenceColor: normalizeUiColor(system.sheetOptions?.panInterferenceColor, "#fbbf24")
      ,characterBorderColor: normalizeUiColor(system.sheetOptions?.characterBorderColor, "#66717d")
      ,characterBackgroundColor: normalizeUiColor(system.sheetOptions?.characterBackgroundColor, "#000000")
      ,characterBackgroundColorEnabled: Boolean(system.sheetOptions?.characterBackgroundColorEnabled ?? true)
      ,manaTextColor: normalizeUiColor(system.sheetOptions?.manaTextColor, "#60a5fa")
      ,staminaTextColor: normalizeUiColor(system.sheetOptions?.staminaTextColor, "#f59e0b")
      ,levelUpColor: normalizeUiColor(system.sheetOptions?.levelUpColor, "#22d3ee")
      ,earnedXpColor: normalizeUiColor(system.sheetOptions?.earnedXpColor, "#22d3ee")
      ,totalXpColor: normalizeUiColor(system.sheetOptions?.totalXpColor, "#12141c")
      ,levelUpGlowColor: normalizeUiColor(system.sheetOptions?.levelUpGlowColor, "#22d3ee")
      ,levelUpBrightness: Math.max(0.25, Math.min(2, Number(system.sheetOptions?.levelUpBrightness) || 1))
      ,levelUpRate: Math.max(0.25, Math.min(2, Number.isFinite(Number(system.sheetOptions?.levelUpIntensity)) ? Number(system.sheetOptions.levelUpIntensity) : 1))
      ,levelUpGlowIntensity: Math.max(0.25, Math.min(2, Number.isFinite(Number(system.sheetOptions?.levelUpGlowIntensity)) ? Number(system.sheetOptions.levelUpGlowIntensity) : 1))
    };
    sheetOptions.levelUpRateDuration = 1.35 / sheetOptions.levelUpRate;
    sheetOptions.levelUpBrightnessDescriptor = sheetOptions.levelUpBrightness.toFixed(2);
    sheetOptions.levelUpRateDescriptor = sheetOptions.levelUpRate.toFixed(2);
    sheetOptions.levelUpGlowIntensityDescriptor = sheetOptions.levelUpGlowIntensity.toFixed(2);
    const resourceIsActive = key => Number(system.resources?.[key]?.max ?? system.resources?.[key]?.value ?? 0) > 0;
    context.showArmorResource = this.#editMode || sheetOptions.showAllResourceBars || sheetOptions.showArmorResourceBar || resourceIsActive("armor");
    context.showShieldsResource = this.#editMode || sheetOptions.showAllResourceBars || sheetOptions.showShieldsResourceBar || resourceIsActive("shields");
    context.showBarriersResource = this.#editMode || sheetOptions.showAllResourceBars || sheetOptions.showBarriersResourceBar || resourceIsActive("barriers");
    context.showPartyList = !sheetOptions.hidePartyList;
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
      },
      { label: "Mana Capacity", value: Math.max(0, Number(system.resources?.mana?.max) || 0), rule: "Maximum Mana capacity." },
      { label: "Stamina Capacity", value: Math.max(0, Number(system.resources?.stamina?.max) || 0), rule: "Maximum Stamina capacity." }
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
      : this.section === "settings" ? SETTINGS_SUBTABS
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
      return i.system?.activationKind !== "ability" && category === "actions" && i.system?.actionType !== "reaction";
    });
    context.reactionActions = context.actions.filter(i => {
      const category = i.system?.category || "actions";
      return i.system?.activationKind !== "ability" && (category === "reactions" || (category === "actions" && i.system?.actionType === "reaction"));
    });
    context.magicActions = context.actions.filter(i => i.system?.activationKind !== "ability" && i.system?.category === "magic");
    context.techActions = context.actions.filter(i => i.system?.activationKind !== "ability" && i.system?.category === "tech");
    context.abilities = sortedItems.filter(i => i.type === "ability" || (i.type === "action" && i.system?.activationKind === "ability"));
    context.featuredAbilities = context.abilities.filter(i => i.system?.featured);
    context.favoriteItems = [...context.favoriteActions, ...context.featuredAbilities]
      .sort((a, b) => a.sort - b.sort);
    const actionItems = this.subTabs.actions === "favorites" ? context.favoriteItems
      : this.subTabs.actions === "actions" ? context.standardActions
      : this.subTabs.actions === "abilities" ? context.abilities
      : this.subTabs.actions === "reactions" ? context.reactionActions
      : this.subTabs.actions === "magic" ? context.magicActions
      : context.techActions;
    const actionTypeLabel = this.subTabs.actions === "magic"
      ? "VEILRUNNER.ActionWorkspace.MagicType"
      : "VEILRUNNER.ActionWorkspace.DamageType";
    const actionMetadata = item => {
      const isAbility = item.type === "ability" || item.system?.activationKind === "ability";
      const damageType = ACTION_DAMAGE_TYPES.includes(item.system?.damageType) ? item.system.damageType : "";
      const maxLevel = Math.max(1, Number(item.system?.maxLevel) || 1);
      const currentLevel = Math.min(maxLevel, Math.max(1, Number(item.system?.currentLevel) || 1));
      const damageDice = Math.max(0, Number(item.system?.damageDice) || 0);
      const damageDie = Math.max(2, Number(item.system?.damageDie) || 6);
      const damageLevelInterval = Math.max(1, Number(item.system?.damageLevelInterval) || 3);
      const damageMultiplier = 1 + Math.floor((currentLevel - 1) / damageLevelInterval);
      const damageValue = damageDice ? `${damageDice * damageMultiplier}d${damageDie}` : "";
      return {
        id: item.id,
        img: item.img,
        name: item.name,
        description: item.system?.description ?? "",
        actionCount: Math.max(0, Number(item.system?.actions) || 0),
        currentLevel,
        maxLevel,
        type: damageType,
        typeLabel: damageType ? game.i18n.localize(`VEILRUNNER.DamageTrait.${damageType}`) : game.i18n.localize("VEILRUNNER.None"),
        typeLabelKey: item.system?.category === "magic"
          ? "VEILRUNNER.ActionWorkspace.MagicType"
          : "VEILRUNNER.ActionWorkspace.DamageType",
        damageValue,
        damageIcon: damageType && damageValue ? ACTION_DAMAGE_ICONS[damageType] : "",
        damageTooltip: damageValue
          ? `${damageValue} ${damageType ? game.i18n.localize(`VEILRUNNER.DamageTrait.${damageType}`) : ""}`.trim()
          : game.i18n.localize("VEILRUNNER.None"),
        traitsText: (item.system?.traits ?? []).join(" · "),
        cost: [
          Number(item.system?.resourceCosts?.mana) > 0 ? `${item.system.resourceCosts.mana} Mana` : "",
          Number(item.system?.resourceCosts?.stamina) > 0 ? `${item.system.resourceCosts.stamina} Stamina` : "",
          Number(item.system?.resourceCosts?.health) > 0 ? `${item.system.resourceCosts.health} Health` : ""
        ].filter(Boolean).join(" · ") || (isAbility ? String(item.system?.recharge ?? "") : String(item.system?.cost ?? "")),
        costLabel: isAbility ? "VEILRUNNER.ActionWorkspace.Recharge" : "VEILRUNNER.ActionWorkspace.Cost"
      };
    };
    const compareActionItems = (left, right, key, direction = "asc") => {
      const multiplier = direction === "desc" ? -1 : 1;
      const value = item => key === "actions" ? item.actionCount : key === "cost"
        ? item.cost : key === "type" ? item.typeLabel : item.name;
      return String(value(left)).localeCompare(String(value(right)), undefined, { numeric: true, sensitivity: "base" }) * multiplier;
    };
    const generatedFirearmActions = ["favorites", "actions"].includes(this.subTabs.actions) ? resolveActorActions(actor) : [];
    const actionWorkspaceItems = [...actionItems.map(actionMetadata), ...generatedFirearmActions];
    if (sheetOptions.actionsView === "card") {
      const sort = this.actionCardSort;
      if (sort === "type") actionWorkspaceItems.sort((a, b) => compareActionItems(a, b, "type"));
      else if (sort === "cost") actionWorkspaceItems.sort((a, b) => compareActionItems(a, b, "cost"));
      else actionWorkspaceItems.sort((a, b) => compareActionItems(a, b, "name", sort === "name-desc" ? "desc" : "asc"));
    } else {
      actionWorkspaceItems.sort((a, b) => compareActionItems(a, b, this.actionListSort.key, this.actionListSort.direction));
    }
    context.actionWorkspace = {
      heading: ACTION_SUBTAB_LABELS[this.subTabs.actions],
      view: sheetOptions.actionsView,
      cardSort: this.actionCardSort,
      listSort: this.actionListSort,
      items: actionWorkspaceItems,
      emptyLabel: {
        favorites: "VEILRUNNER.NoFavorites", actions: "VEILRUNNER.NoActions", abilities: "VEILRUNNER.NoAbilities",
        reactions: "VEILRUNNER.NoReactions", magic: "VEILRUNNER.NoMagic", tech: "VEILRUNNER.NoTech"
      }[this.subTabs.actions],
      typeLabel: actionTypeLabel,
      selected: actionWorkspaceItems.find(item => item.id === this.actionDetailsItemId) ?? null
    };
    const actionDetailsItem = this.actionDetailsItemId ? actor.items.get(this.actionDetailsItemId) : null;
    context.actionDetailsDrawer = this.actionDetailsDrawer && Boolean(actionDetailsItem);
    context.actionDetails = context.actionDetailsDrawer ? actionMetadata(actionDetailsItem) : null;
    context.inventoryCategories = INVENTORY_CATEGORIES.map(category => ({
      ...category,
      active: category.key === this.subTabs.inventory
    }));
    context.inventoryCategory = this.subTabs.inventory;
    const activeInventoryFilter = getValidInventoryFilter(this.subTabs.inventory, this.inventoryWeaponFilter);
    const inventoryFilters = getInventoryFilters(this.subTabs.inventory);
    context.inventoryWeaponFilters = inventoryFilters.filter(filter => !filter.group).map(filter => ({
      ...filter,
      active: filter.key === activeInventoryFilter
    }));
    context.inventoryWeaponFilter = activeInventoryFilter;
    context.inventoryMainFilters = (this.subTabs.inventory === "weapon"
      ? inventoryFilters.filter(filter => filter.key === "allWeapons" || filter.group)
      : inventoryFilters
    ).map(filter => ({
      ...filter,
      icon: filter.icon ?? (filter.key === "allWeapons" ? "fa-solid fa-crosshairs" : ""),
      active: filter.key === activeInventoryFilter
    }));
    context.hasInventoryFilters = context.inventoryMainFilters.length > 1;
    context.inventoryFiltersOpen = this.inventoryFiltersOpen;
    context.inventoryLayout = this.inventoryLayout;
    context.inventorySearch = this.inventorySearch;
    const inventorySearchQuery = normalizeInventoryToken(this.inventorySearch);
    context.inventoryItems = sortedItems
      .map(item => {
        const category = item.type === "treasure" ? item.system?.category || "junk"
          : ["ammunition", "magazine"].includes(item.type) ? "ammo"
          : item.type === "shield" ? "armor"
          : ["accessory", "container", "equipment"].includes(item.type) ? "equipment"
          : item.type;
        const inventoryFilterKey = detectInventoryFilterKey(item, category);
        const rarity = itemRarityData(item);
        return {
          id: item.id,
          name: item.name,
          img: item.img,
          category,
          inventoryFilterKey,
          quantity: Math.max(0, Number(item.system?.quantity) || 1),
          weight: Math.max(0, Number(item.system?.weight) || 0),
          equipmentSlot: item.system?.equipmentSlot ?? "",
          requiredSlots: itemRequiredSlots(item),
          canEquip: itemRequiredSlots(item).length > 0,
          rarity,
          description: item.system?.description?.value ?? item.system?.description ?? "",
          typeLabel: item.type === "treasure"
            ? game.i18n.localize(`VEILRUNNER.InventoryCategory.${category}`)
            : game.i18n.localize(`TYPES.Item.${item.type}`)
        };
      })
      .filter(item => this.subTabs.inventory === "all"
        || item.category === this.subTabs.inventory
        || (this.subTabs.inventory === "ammo" && item.inventoryFilterKey.startsWith("ammo")))
      .filter(item => inventoryItemMatchesFilter(item, activeInventoryFilter))
      .filter(item => !inventorySearchQuery || normalizeInventoryToken(`${item.name} ${item.typeLabel}`).includes(inventorySearchQuery));
    const visibleWeaponFilters = activeInventoryFilter === "allWeapons"
      ? context.inventoryWeaponFilters.filter(filter => filter.key !== "allWeapons")
      : context.inventoryWeaponFilters.filter(filter => inventoryItemMatchesFilter({ inventoryFilterKey: filter.key }, activeInventoryFilter));
    context.inventoryWeaponSections = this.subTabs.inventory === "weapon"
      ? visibleWeaponFilters.map(filter => ({
        ...filter,
        items: context.inventoryItems.filter(item => item.inventoryFilterKey === filter.key)
      }))
      : [];
    context.hasInventoryWeaponSections = context.inventoryWeaponSections.length > 0;
    const inventoryDetailsItem = this.inventoryDetailsItemId ? actor.items.get(this.inventoryDetailsItemId) : null;
    context.inventoryDetailsOpen = this.section === "inventory" && Boolean(inventoryDetailsItem);
    context.inventoryDetails = context.inventoryDetailsOpen ? {
      id: inventoryDetailsItem.id,
      name: inventoryDetailsItem.name,
      img: inventoryDetailsItem.img,
      quantity: Math.max(0, Number(inventoryDetailsItem.system?.quantity) || 1),
      weight: Math.max(0, Number(inventoryDetailsItem.system?.weight) || 0),
      rarity: itemRarityData(inventoryDetailsItem),
      typeLabel: inventoryDetailsItem.type === "treasure"
        ? game.i18n.localize(`VEILRUNNER.InventoryCategory.${inventoryDetailsItem.system?.category || "junk"}`)
        : game.i18n.localize(`TYPES.Item.${inventoryDetailsItem.type}`),
      description: inventoryDetailsItem.system?.description?.value ?? inventoryDetailsItem.system?.description ?? ""
    } : null;
    context.inventoryCarryWeightKg = Math.round(sortedItems
      .filter(item => PHYSICAL_ITEM_TYPES.includes(item.type))
      .reduce((total, item) => {
        const weight = Math.max(0, Number(item.system?.weight) || 0);
        const quantity = Math.max(0, Number(item.system?.quantity) || 1);
        return total + (weight * quantity);
      }, 0) * 100) / 100;
    context.inventoryCarryCapacityKg = 5 + (Math.max(1, Number(system.attributes?.physical?.strength) || 1) * 2);
    context.inventoryCarryWeightPercent = Math.min(100, (context.inventoryCarryWeightKg / context.inventoryCarryCapacityKg) * 100);

    const equipmentData = equipmentBySlot(actor);
    context.equipmentSlotColumns = Object.fromEntries(Object.entries(EQUIPMENT_SLOT_COLUMNS).map(([column, slots]) => [column, slots.map(slot => {
      const itemId = equipmentData[slot];
      const item = itemId ? actor.items.get(itemId) : null;
      return { slot, label: game.i18n.localize(`VEILRUNNER.Slot.${slot}`), item, rarity: item ? itemRarityData(item) : null };
    })]));
    const quickEquipSource = Array.isArray(system.quickEquip) ? system.quickEquip : [];
    context.quickEquip = quickEquipSource
      .slice(0, 4)
      .map(id => actor.items.get(id))
      .filter(Boolean)
      .map(item => ({ id: item.id, name: item.name, img: item.img, rarity: itemRarityData(item) }));
    context.panActive = Boolean(system.networkLinked);
    context.panStatus = game.i18n.localize(`VEILRUNNER.PAN.${context.panActive ? "On" : "Off"}`);
    context.assetLinksJson = JSON.stringify(system.assetLinks ?? [], null, 2);

    const party = findPartyForHero(actor);
    context.partyOverview = buildPartyOverview(party, { currentHero: actor });
    context.partyMembers = getPartyMembers(party)
      .filter(member => member.id !== actor.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
      .map(member => {
        const resources = member.system.resources ?? {};
        const linked = Boolean(system.networkLinked && member.system.networkLinked);
        const panState = linked ? "on" : "off";
        const percent = member.system.percent ?? {};
        const shields = resources.shields ?? resources.shield ?? {};
        const hasMaximum = resource => Number(resource?.max ?? 0) > 0;
        const showResource = resource => sheetOptions.showAllPartyResources || hasMaximum(resource);
        return {
          id: member.id,
          name: member.name,
          displayName: truncateText(member.name, PARTY_NAME_MAX_LENGTH),
          img: member.system.appearanceImage || member.img,
          linked,
          panState,
          health: linked ? `${resources.health?.value ?? 0} / ${resources.health?.max ?? 0}` : healthStatus(percent.health ?? 0),
          armor: linked ? `${resources.armor?.value ?? 0} / ${resources.armor?.max ?? 0}` : armorStatus(percent.armor ?? 0),
          shields: linked ? `${shields.value ?? 0} / ${shields.max ?? 0}` : shieldStatus(shields),
          barriers: linked ? `${resources.barriers?.value ?? 0} / ${resources.barriers?.max ?? 0}` : barrierStatus(percent.barriers ?? 0),
          showHealth: showResource(resources.health),
          showArmor: showResource(resources.armor),
          showShields: showResource(shields),
          showBarriers: showResource(resources.barriers)
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
    if (foundry.utils.hasProperty(object, "system.assetLinksJson")) {
      try {
        const parsed = JSON.parse(String(foundry.utils.getProperty(object, "system.assetLinksJson") || "[]"));
        foundry.utils.setProperty(object, "system.assetLinks", Array.isArray(parsed) ? parsed : []);
      } catch (error) {
        ui.notifications.error("Controlled Assets must be a valid JSON array.");
        foundry.utils.setProperty(object, "system.assetLinks", foundry.utils.deepClone(this.actor.system?.assetLinks ?? []));
      }
      foundry.utils.deleteProperty(object, "system.assetLinksJson");
    }
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

    const normalizeSheetOption = (key, fallback) => {
      const path = `system.sheetOptions.${key}`;
      const hasFlat = Object.hasOwn(object, path);
      const hasNested = foundry.utils.hasProperty(object, path);
      if (!hasFlat && !hasNested) return;
      const value = normalizeUiColor(hasFlat ? object[path] : foundry.utils.getProperty(object, path), fallback);
      if (hasFlat) object[path] = value;
      foundry.utils.setProperty(object, path, value);
    };
    normalizeSheetOption("categoryHighlightColor", "#a855f7");
    normalizeSheetOption("uiColor", "#101216");
    normalizeSheetOption("panOffColor", "#ff0000");
    normalizeSheetOption("panOnColor", "#00ff49");
    normalizeSheetOption("panInterferenceColor", "#fbbf24");
    normalizeSheetOption("characterBorderColor", "#66717d");
    normalizeSheetOption("characterBackgroundColor", "#000000");
    normalizeSheetOption("manaTextColor", "#60a5fa");
    normalizeSheetOption("staminaTextColor", "#f59e0b");
    normalizeSheetOption("levelUpColor", "#22d3ee");
    normalizeSheetOption("earnedXpColor", "#22d3ee");
    normalizeSheetOption("totalXpColor", "#12141c");
    normalizeSheetOption("levelUpGlowColor", "#22d3ee");

    const submitData = super._prepareSubmitData(event, form, formData);
    if (foundry.utils.hasProperty(submitData, "name")) {
      const submittedName = String(foundry.utils.getProperty(submitData, "name") ?? "");
      if (submittedName !== this.actor.name) {
        foundry.utils.setProperty(submitData, "prototypeToken.name", submittedName);
      }
    }
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
      : section === "settings" ? SETTINGS_SUBTABS
      : fromDetailsPanel ? DETAILS_SUBTABS
      : ABOUT_SUBTABS;
    const currentTab = fromDetailsPanel && !DETAILS_SUBTABS.includes(this.subTabs[section]) ? "party" : this.subTabs[section];
    const from = list.indexOf(currentTab);
    const to = list.indexOf(tab);
    if (to < 0 || to === from) return;
    this.subTabs[section] = tab;
    const closeActionDetails = section === "actions" && this.actionDetailsDrawer && this.#detailsOpen;
    if (closeActionDetails) {
      this.#detailsOpen = false;
      this.#animateDetails = true;
      this.#clearActionDetailsAfterClose = true;
    } else if (section === "actions") this.actionDetailsItemId = null;
    if (section === "inventory") this.inventoryWeaponFilter = getValidInventoryFilter(tab, this.inventoryWeaponFilter);
    if (!fromDetailsPanel) this.#pendingNavAnimation = { selector: ".sub-nav-row", from, to, total: list.length };
    if (section === "about") this.#pendingDetailsTabAnimation = tabAnimationClass(from, to);
    else this.#pendingMainTabAnimation = tabAnimationClass(from, to);
    const parts = closeActionDetails ? ["main", "details"] : section === "about"
      ? (fromDetailsPanel ? ["details"] : ["main", "details"])
      : ["main"];
    this.render({ parts });
  }

  static #onToggleInventoryFilters(event, target) {
    this.inventoryFiltersOpen = !this.inventoryFiltersOpen;
    target.classList.toggle("active", this.inventoryFiltersOpen);
    target.setAttribute("aria-expanded", this.inventoryFiltersOpen ? "true" : "false");
    const row = target.closest(".inventory-filter-row");
    row?.classList.toggle("open", this.inventoryFiltersOpen);
    row?.querySelector(".inventory-filter-drawer")?.classList.toggle("open", this.inventoryFiltersOpen);
  }

  static #onSetInventoryLayout(event, target) {
    const layout = target.dataset.layout === "grid" ? "grid" : "list";
    if (this.inventoryLayout === layout) return;
    this.inventoryLayout = layout;
    this.render({ parts: ["main"] });
  }

  static #inventoryItemFromTarget(actor, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    return itemId ? actor?.items.get(itemId) : null;
  }

  static async #onEquipInventoryItem(event, target) {
    event.preventDefault();
    const item = VeilrunnerHeroSheet.#inventoryItemFromTarget(this.actor, target);
    if (!item) return;
    await equipPhysicalItem(this.actor, item);
  }

  /** Equip owned or newly-embedded physical Items when they are dropped on a drawer slot. */
  async _onDropItem(event, item) {
    const slot = event.target.closest?.(".equip-slot[data-slot]")?.dataset.slot;
    if (!slot) return super._onDropItem(event, item);
    if (!PHYSICAL_ITEM_TYPES.includes(item.type)) {
      ui.notifications.warn(`${item.name} is not physical equipment.`);
      return null;
    }
    if (!itemAcceptsEquipmentSlot(item, slot)) {
      const label = game.i18n.localize(`VEILRUNNER.Slot.${slot}`);
      ui.notifications.warn(`${item.name} cannot be equipped in ${label}. Check its slot restrictions.`);
      return null;
    }

    let ownedItem = item;
    if (this.actor.uuid !== item.parent?.uuid) ownedItem = await super._onDropItem(event, item);
    if (!ownedItem) return null;
    return await equipPhysicalItem(this.actor, ownedItem) ? ownedItem : null;
  }

  _onDragOver(event) {
    super._onDragOver(event);
    for (const element of this.element.querySelectorAll(".equip-slot.drag-over")) element.classList.remove("drag-over");
    event.target.closest?.(".equip-slot[data-slot]")?.classList.add("drag-over");
  }

  async _onDrop(event) {
    try {
      return await super._onDrop(event);
    } finally {
      for (const element of this.element.querySelectorAll(".equip-slot.drag-over")) element.classList.remove("drag-over");
    }
  }

  static async #onThrowInventoryItem(event, target) {
    event.preventDefault();
    const item = VeilrunnerHeroSheet.#inventoryItemFromTarget(this.actor, target);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="veilrunner inventory-item-use"><strong>${foundry.utils.escapeHTML(this.actor.name)} throws ${foundry.utils.escapeHTML(item.name)}</strong></div>`
    });
  }

  static async #onUseInventoryItem(event, target) {
    event.preventDefault();
    const item = VeilrunnerHeroSheet.#inventoryItemFromTarget(this.actor, target);
    if (!item) return;
    const description = item.system?.description?.value ?? item.system?.description ?? "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="veilrunner inventory-item-use"><strong>${foundry.utils.escapeHTML(this.actor.name)} uses ${foundry.utils.escapeHTML(item.name)}</strong>${description}</div>`
    });
    if (PHYSICAL_ITEM_TYPES.includes(item.type)) await applyItemWear(item, 1);
  }

  static #onShowInventoryItemDetails(event, target) {
    event.preventDefault();
    const item = VeilrunnerHeroSheet.#inventoryItemFromTarget(this.actor, target);
    if (!item) return;
    this.inventoryDetailsItemId = item.id;
    this.render({ parts: ["main"] });
  }

  static #onCloseInventoryItemDetails(event) {
    event.preventDefault();
    this.inventoryDetailsItemId = null;
    this.render({ parts: ["main"] });
  }

  static async #onToggleSheetOption(event, target) {
    event.preventDefault();
    const key = target.dataset.sheetOption;
    if (!["showAllPartyResources", "showAllResourceBars", "showArmorResourceBar", "showShieldsResourceBar", "showBarriersResourceBar", "hidePartyList", "characterBackgroundColorEnabled"].includes(key)) return;
    const value = !Boolean(this.actor.system.sheetOptions?.[key]);
    await this.actor.update({ [`system.sheetOptions.${key}`]: value }, {
      render: false,
      veilrunnerPreserveMainPosition: true
    });
    target.classList.toggle("is-active", value);
    target.setAttribute("aria-pressed", String(value));
    target.querySelector(".ui-toggle-check")?.classList.toggle("is-active", value);
    if (["hidePartyList", "characterBackgroundColorEnabled"].includes(key)) this.render({ parts: ["main"] });
    else if (key === "showAllPartyResources") this.render({ parts: ["main"] });
    else this.#syncResourceBarVisibility();
  }

  static async #onTogglePan(event, target) {
    event.preventDefault();
    if (!this.actor.isOwner) return ui.notifications.warn("You do not have permission to change PAN status.");
    const value = !Boolean(this.actor.system.networkLinked);
    await this.actor.update({ "system.networkLinked": value }, {
      render: false,
      veilrunnerPreserveMainPosition: true
    });
    this.render({ parts: ["main"] });
  }

  static #onSetInventoryWeaponFilter(event, target) {
    const filter = target.dataset.filter;
    if (!getInventoryFilters(this.subTabs.inventory).some(entry => entry.key === filter) || this.inventoryWeaponFilter === filter) return;
    this.inventoryWeaponFilter = filter;
    this.#pendingMainTabAnimation = "";
    this.render({ parts: ["main"] });
  }

  static async #onSetActionView(event, target) {
    event.preventDefault();
    const view = target.dataset.view === "list" ? "list" : "card";
    if (this.actor.system.sheetOptions?.actionsView === view) return;
    await this.actor.update({ "system.sheetOptions.actionsView": view }, {
      render: false,
      veilrunnerPreserveMainPosition: true
    });
    this.render({ parts: ["main"] });
  }

  static #onSetActionCardSort(event, target) {
    const sort = target.value;
    if (!["type", "name-asc", "name-desc", "cost"].includes(sort) || this.actionCardSort === sort) return;
    this.actionCardSort = sort;
    this.render({ parts: ["main"] });
  }

  static #onSortActionList(event, target) {
    const key = target.dataset.sortKey;
    if (!["actions", "name", "type", "cost"].includes(key)) return;
    this.actionListSort = {
      key,
      direction: this.actionListSort.key === key && this.actionListSort.direction === "asc" ? "desc" : "asc"
    };
    this.render({ parts: ["main"] });
  }

  static #onShowActionDetails(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    if (!this.actor.items.has(itemId)) return;
    const wasOpen = this.#detailsOpen;
    this.actionDetailsItemId = itemId;
    this.actionDetailsDrawer = true;
    this.#clearActionDetailsAfterClose = false;
    this.#detailsOpen = true;
    this.#animateDetails = !wasOpen;
    this.render({ parts: ["main", "details"] });
  }

  static async #onSendActionToChat(event, target) {
    event.preventDefault();
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    const name = foundry.utils.escapeHTML(item.name);
    const description = item.system?.description || `<p>${game.i18n.localize("VEILRUNNER.ActionWorkspace.DescriptionHint")}</p>`;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="veilrunner action-use"><strong>${name}</strong>${description}</div>`
    });
  }

  static async #onRollAction(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    if (item.hasRoll) await item.roll();
    else ui.notifications.info(`${item.name} used.`);
  }

  static async #onExecuteFirearmAction(event, target) {
    event.preventDefault();
    if (target.disabled) return ui.notifications.warn(target.title || "That firearm action is not currently available.");
    const row = target.closest("[data-weapon-id]");
    const weaponId = row?.dataset.weaponId;
    const operation = row?.dataset.weaponAction;
    if (!weaponId || !operation) return;
    const action = resolveActorActions(this.actor).find(entry => entry.weaponId === weaponId && entry.operation === operation);
    if (action) await game.veilrunner.executeAction(this.actor, action);
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
          flags: { [game.system.id]: { partyFolder: folder.id } }
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

  /** Open the equipment drawer directly to its selected visual tab. */
  static #onOpenEquipmentTab(event, target) {
    const tabs = ["equipped", "appearance"];
    const tab = target.dataset.tab;
    const from = tabs.indexOf(this.equipTab);
    const to = tabs.indexOf(tab);
    if (to < 0) return;

    this.equipTab = tab;
    if (!this.#equipmentOpen) {
      this.#equipmentOpen = true;
      this.#animateEquipment = true;
      this.render({ parts: ["equipment", "main"] });
      return;
    }

    if (to === from) return;
    this.#pendingEquipmentTabAnimation = tabAnimationClass(from, to);
    this.render({ parts: ["equipment"] });
  }

  static async #onUnequip(event, target) {
    const slot = target.closest("[data-slot]")?.dataset.slot;
    if (!slot) return;
    await unequipPhysicalItem(this.actor, slot);
  }

  static async #onToggleEditMode(event, target) {
    this.#editMode = !this.#editMode;
    this.#syncFrameEditToggle(target);
    await this.render();
    this.#syncFrameEditToggle();
  }

  static async #onSetStatusTrack(event, target) {
    event?.preventDefault();
    event?.stopPropagation();

    const key = target.dataset.track;
    if (!["resolve", "dying", "wounded"].includes(key)) return;

    const max = key === "resolve" ? 5 : 3;
    const currentValue = Math.max(0, Math.min(max, Number(this.actor.system.resources?.[key]?.value) || 0));
    const delta = event?.type === "contextmenu" ? -1 : 1;
    const nextValue = Math.max(0, Math.min(max, currentValue + delta));
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

  static async #onSetCharacterBackgroundImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.actor.isOwner) return;

    await this.#pickImage(this.actor.system.characterBackgroundImage || "",
      path => this.actor.update({
        "system.characterBackgroundImage": path,
        "system.sheetOptions.characterBackgroundColorEnabled": false
      }));
  }

  static async #onSetEquipmentImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    await this.#pickImage(this.actor.system.equipmentImage || this.actor.system.appearanceImage || this.actor.img,
      path => this.actor.update({ "system.equipmentImage": path }));
  }

  static async #onSetEquipmentBackgroundImage(event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this.actor.isOwner) return;

    await this.#pickImage(this.actor.system.equipmentBackgroundImage || "",
      path => this.actor.update({ "system.equipmentBackgroundImage": path }));
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

  async editPortraitCrop(path, options = {}) {
    return this.#promptPortraitCrop(path, options);
  }

  async #promptPortraitCrop(path, { useExistingCrop = true, existingCrop = null } = {}) {
    const bringPortraitEditorToFront = dialog => {
      dialog?.bringToFront?.();
      const roots = [dialog?.element, dialog?.element?.closest?.(".application, .app, .window-app, [data-appid]")].filter(Boolean);
      for (const root of roots) root.style?.setProperty?.("z-index", "100100", "important");
      dialog?.element?.focus?.();
    };
    const userId = game.user?.id ?? "local";
    const activeEditor = VeilrunnerHeroSheet.#portraitEditorsByUser.get(userId);
    if (activeEditor) {
      bringPortraitEditorToFront(activeEditor.dialog);
      return null;
    }

    const storedCrop = existingCrop ?? this.actor.system.portraitCrop ?? {};
    const crop = normalizePortraitCrop(useExistingCrop ? storedCrop : undefined);
    const safePath = foundry.utils.escapeHTML(path);
    const sheetOptions = this.actor.system.sheetOptions ?? {};
    const editorColorVision = ["default", "protanopia", "deuteranopia", "tritanopia"].includes(sheetOptions.colorVision)
      ? sheetOptions.colorVision
      : "default";
    const themeSources = [
      this.element?.querySelector(".window-content"),
      this.element,
      this.element?.closest(".application")
    ].filter(Boolean);
    const themeValue = (property, fallback = "") => {
      for (const source of themeSources) {
        const value = getComputedStyle(source).getPropertyValue(property).trim();
        if (value) return value;
      }
      return fallback;
    };
    const editorUiColor = normalizeUiColor(themeValue("--vr-ui-color", sheetOptions.uiColor), "#101216");
    const editorHighlightColor = normalizeUiColor(themeValue("--vr-accent", sheetOptions.categoryHighlightColor), "#a855f7");
    const editorTheme = {
      "--vr-ui-color": editorUiColor,
      "--vr-accent": editorHighlightColor,
      "--vr-bg": themeValue("--vr-bg", `color-mix(in srgb, ${editorUiColor} 12%, #080910)`),
      "--vr-panel": themeValue("--vr-panel", `color-mix(in srgb, ${editorUiColor} 18%, #080910)`),
      "--vr-panel-alt": themeValue("--vr-panel-alt", `color-mix(in srgb, ${editorUiColor} 26%, #080910)`),
      "--vr-border": themeValue("--vr-border", `color-mix(in srgb, ${editorUiColor} 30%, rgba(255, 255, 255, 0.12))`),
      "--vr-text": themeValue("--vr-text", "#f3f4f8"),
      "--vr-text-dim": themeValue("--vr-text-dim", "#8b90a0")
    };
    const editorThemeStyle = Object.entries(editorTheme).map(([property, value]) => `${property}:${value}`).join(";");
    const editorState = { dialog: null };
    VeilrunnerHeroSheet.#portraitEditorsByUser.set(userId, editorState);
    const cleanupEditor = () => {
      if (VeilrunnerHeroSheet.#portraitEditorsByUser.get(userId) === editorState) {
        VeilrunnerHeroSheet.#portraitEditorsByUser.delete(userId);
      }
    };

    try {
      const prompt = foundry.applications.api.DialogV2.prompt({
        classes: ["veilrunner", "vr-portrait-editor", `color-vision-${editorColorVision}`],
        window: { title: game.i18n.localize("VEILRUNNER.PortraitEditor") },
        // The preview needs enough width to keep its vertical and horizontal
        // pan controls directly beside/below it, with the other controls below.
        position: { width: 500 },
        rejectClose: false,
        render: (event, dialog) => {
          editorState.dialog = dialog;
          bringPortraitEditorToFront(dialog);
          requestAnimationFrame(() => bringPortraitEditorToFront(dialog));
          for (const element of [dialog.element, dialog.element?.closest(".application"), dialog.element?.querySelector(".vr-portrait-crop-dialog")].filter(Boolean)) {
            for (const [property, value] of Object.entries(editorTheme)) element.style.setProperty(property, value);
          }
          activatePortraitCrop(event, dialog);
        },
        content: `<div class="veilrunner vr-portrait-crop-dialog" style="${editorThemeStyle}">
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
    const opening = !this.#detailsOpen;
    if (opening) {
      this.actionDetailsDrawer = false;
      this.actionDetailsItemId = null;
      this.#clearActionDetailsAfterClose = false;
    } else if (this.actionDetailsDrawer) this.#clearActionDetailsAfterClose = true;
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
    openCharacterCreation(this.actor, { mode: "levelUp" });
  }

  static #onOpenCharacterCreation() {
    openCharacterCreation(this.actor, { portraitEditor: this });
  }

  static #onOpenPlayerDatapad() {
    openPlayerDatapad();
  }

}
