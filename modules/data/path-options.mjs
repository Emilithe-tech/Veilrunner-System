import { VEILRUNNER_PROFESSIONS } from "./professions.mjs";

export const ARCHETYPE_OPTIONS = Object.freeze(["Physique", "Armament", "Magic", "Technical", "Social"]);

export const ARCHETYPE_SUMMARIES = Object.freeze({
  Physique: "Body-led characters who solve problems through force, movement, endurance, and close action.",
  Armament: "Weapon and battlefield specialists who rely on training, equipment, tactics, and combat readiness.",
  Magic: "Supernatural specialists who shape encounters through spells, elemental force, healing, conjuration, or occult technique.",
  Technical: "Technical operators who build, hack, repair, pilot, program, and leverage machines or networks.",
  Social: "Influence and investigation specialists who navigate people, factions, deception, diplomacy, and hidden truths."
});

/** Sort compendium-derived Path entries while preserving the authored Archetype sequence. */
export function sortPathEntries(kind, entries = []) {
  return [...entries].sort((left, right) => {
    if (kind === "archetype") {
      const leftIndex = ARCHETYPE_OPTIONS.indexOf(left.name);
      const rightIndex = ARCHETYPE_OPTIONS.indexOf(right.name);
      if (leftIndex !== rightIndex) return (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) - (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex);
    }
    return String(left.name ?? "").localeCompare(String(right.name ?? ""));
  });
}

export const PROFESSION_ARCHETYPES = Object.freeze({
  "Berserker": "Physique", "Gymnast": "Physique", "Martial Artist": "Physique", "Vanguard": "Physique",
  "Duelist": "Armament", "Field Technician": "Armament", "Marksman": "Armament",
  "Amplifier": "Magic", "Cleric": "Magic", "Conjurer": "Magic", "Druid": "Magic", "Elemental Adept": "Magic", "Magus": "Magic"
});

export const EXTRA_PROFESSION_TREE = Object.freeze([
  { archetype: "Technical", profession: "Hardware", disciplines: ["Siliconsmith", "Gridtech", "Fabricator", "Signal Engineer"] },
  { archetype: "Technical", profession: "Software", disciplines: ["Cyber Tech", "Programmer", "Comforcer", "Netrunner"] },
  { archetype: "Technical", profession: "Mechanic", disciplines: ["Auto-Mechanic", "Cyber-mechanic"] },
  { archetype: "Technical", profession: "Vehicle Pilot", disciplines: ["Ground Operator", "Walker Operator", "Marine Operator", "Aerial Operator", "Astromech Operator", "Space Operator"] },
  { archetype: "Technical", profession: "Drone Operator", disciplines: ["Humanoid", "Multipedal", "Aquatic", "Aerial", "Astromech", "Stationary"] },
  { archetype: "Social", profession: "Investigator", disciplines: ["Forensic Analyst", "Occult Analyst"] },
  { archetype: "Social", profession: "Negotiator", disciplines: ["Con Artist", "Diplomat"] },
  { archetype: "Social", profession: "Infiltrator", disciplines: ["Chameleon", "Scout", "Locksmith", "Tracker"] },
  { archetype: "Magic", profession: "Magus", disciplines: ["Blood Mage", "Sorcerer", "Thaumaturge", "Wizard"] }
]);

export function fallbackPathRecords() {
  const records = VEILRUNNER_PROFESSIONS.map(profession => ({
    archetype: PROFESSION_ARCHETYPES[profession.name] ?? "",
    profession: profession.name,
    summary: profession.summary ?? "",
    disciplines: profession.disciplines.map(discipline => discipline.name)
  }));
  for (const extra of EXTRA_PROFESSION_TREE) {
    const existing = records.find(record => record.profession === extra.profession);
    if (existing) existing.disciplines = [...new Set([...existing.disciplines, ...extra.disciplines])];
    else records.push({ ...extra, summary: "" });
  }
  return records;
}
