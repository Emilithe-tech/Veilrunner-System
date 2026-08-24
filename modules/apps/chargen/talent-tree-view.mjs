const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

const MAGIC_SCHOOL_BY_DISCIPLINE = Object.freeze({
  "amplifier:synergist": "intrinsic",
  "amplifier:augmenter": "intrinsic",
  "cleric:priest": "creation",
  "cleric:adjudicator": "creation",
  "conjurer:summoner": "spirit",
  "conjurer:illusionist": "spirit",
  "druid:shapeshifter": "primal",
  "druid:cultivator": "primal",
  "elemental adept:geo adept": "elemental",
  "elemental adept:aqueous adept": "elemental",
  "elemental adept:air adept": "elemental",
  "elemental adept:flame adept": "elemental",
  "elemental adept:versatile adept": "elemental",
  "elemental adept:steel adept": "elemental",
  "magus:blood mage": "intrinsic",
  "magus:sorcerer": "elemental",
  "magus:thaumaturge": "arcane",
  "magus:wizard": "arcane"
});

export function schoolAccessBranchId(schoolId = "") {
  const id = String(schoolId ?? "").trim().toLowerCase();
  return id ? `school:${id}` : "";
}

export function magicTreeAccess(archetype = "", profession = "", discipline = "") {
  const magicArchetype = String(archetype ?? "").trim().toLowerCase() === "magic";
  const key = `${String(profession ?? "").trim().toLowerCase()}:${String(discipline ?? "").trim().toLowerCase()}`;
  const schoolId = magicArchetype ? (MAGIC_SCHOOL_BY_DISCIPLINE[key] ?? "") : "";
  return { rootUnlocked: magicArchetype, schoolId };
}

export function talentTreeRecords(schools = []) {
  return schools.flatMap(school => [
    { kind: "school", id: school.id, name: school.name, school, node: school, search: [school.name, school.description].filter(Boolean).join(" ") },
    ...(school.practices ?? []).flatMap(practice => [
      { kind: "practice", id: practice.id, name: practice.name, school, practice, node: practice, search: [school.name, practice.name, practice.description].filter(Boolean).join(" ") },
      ...(practice.spells ?? []).map(spell => ({ kind: "spell", id: spell.id, name: spell.name, school, practice, spell, node: spell, search: [school.name, practice.name, spell.name, spell.description, ...(spell.traits ?? [])].filter(Boolean).join(" ") }))
    ])
  ]);
}

export function searchTalentTree(records = [], query = "", limit = 8) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return [];
  return records.filter(record => String(record.search ?? "").toLowerCase().includes(normalized)).slice(0, Math.max(0, number(limit)));
}

export function purchasedTalentTreePage(schools = [], tree = {}) {
  const purchasedBranches = new Set(tree.branches ?? []);
  const purchasedLeaves = new Set((tree.leaves ?? []).filter(entry => number(entry.rank) > 0).map(entry => entry.id));
  return schools
    .map(school => ({
      ...school,
      practices: (school.practices ?? [])
        .filter(practice => purchasedBranches.has(practice.id))
        .map(practice => ({ ...practice, spells: (practice.spells ?? []).filter(spell => purchasedLeaves.has(spell.id)) }))
    }))
    .filter(school => purchasedBranches.has(schoolAccessBranchId(school.id)) || school.practices.length);
}
