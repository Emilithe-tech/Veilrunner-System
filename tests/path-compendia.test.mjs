import assert from "node:assert/strict";
import fs from "node:fs";
import { sortPathEntries } from "../modules/data/path-options.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL("system.json", root), "utf8"));
const readPack = filename => fs.readFileSync(new URL(`packs/${filename}`, root), "utf8").split(/\r?\n/).filter(Boolean).map(JSON.parse);
const archetypes = readPack("archetypes.db");
const professions = readPack("path-professions.db");
const disciplines = readPack("disciplines.db");
const legacy = readPack("professions.db");

assert.deepEqual(
  manifest.packs.filter(pack => ["archetypes", "professions", "disciplines"].includes(pack.name)).map(pack => pack.name),
  ["archetypes", "professions", "disciplines"],
  "Path uses exactly three ordered compendia"
);
assert.deepEqual(
  manifest.packs.filter(pack => ["archetypes", "professions", "disciplines"].includes(pack.name)).map(pack => pack.path),
  ["packs/archetypes", "packs/path-professions", "packs/disciplines"],
  "Path compendia use Foundry v14 directory-backed pack paths"
);
assert.ok(archetypes.length > 0 && archetypes.every(entry => entry.type === "archetype"));
assert.ok(professions.length > 0 && professions.every(entry => entry.type === "profession"));
assert.ok(disciplines.length > 0 && disciplines.every(entry => entry.type === "discipline"));
assert.deepEqual(sortPathEntries("archetype", archetypes).map(entry => entry.name), ["Physique", "Armament", "Magic", "Technical", "Social"], "chargen preserves the canonical Archetype order");
assert.deepEqual(archetypes.toSorted((left, right) => left.sort - right.sort).map(entry => entry.name), ["Physique", "Armament", "Magic", "Technical", "Social"], "compendium sort values preserve the canonical Archetype order");

const archetypeIds = new Set(archetypes.map(entry => entry.system.definitionId));
const professionIds = new Set(professions.map(entry => entry.system.definitionId));
assert.ok(professions.every(entry => archetypeIds.has(entry.system.archetypeId)), "every Profession links to an Archetype entry");
assert.ok(disciplines.every(entry => professionIds.has(entry.system.professionId)), "every Discipline links to a Profession entry");
assert.ok(professions.every(entry => entry.system.discipline === undefined), "Profession entries do not embed Disciplines");
assert.ok(disciplines.every(entry => entry.system.archetype === undefined), "Discipline entries resolve Archetypes through Professions");
assert.equal(new Set(archetypes.map(entry => entry.system.definitionId)).size, archetypes.length);
assert.equal(new Set(professions.map(entry => entry.system.definitionId)).size, professions.length);
assert.equal(new Set(disciplines.map(entry => entry.system.definitionId)).size, disciplines.length);

const normalizedArt = value => String(value ?? "").startsWith("assets/") ? `systems/veilrunner/${value}` : String(value ?? "");
for (const source of legacy) {
  const profession = professions.find(entry => entry.name === source.system.profession);
  const discipline = disciplines.find(entry => entry.name === source.system.discipline && entry.system.profession === source.system.profession);
  assert.ok(profession, `migrated Profession ${source.system.profession}`);
  assert.ok(discipline, `migrated Discipline ${source.name}`);
  assert.equal(profession.system.summary, source.flags?.veilrunner?.professionSummary ?? "", `${source.system.profession} summary migrated`);
  assert.equal(discipline.system.summary, source.flags?.veilrunner?.disciplineSummary ?? "", `${source.name} summary migrated`);
  for (const field of ["quote", "primaryWeapon", "primaryAttributes", "bonusAttributes", "bonusSkill", "persona", "sourcePage"]) {
    assert.deepEqual(discipline.system[field], source.system[field], `${source.name} ${field} migrated`);
  }
  assert.deepEqual(discipline.system.abilities, source.flags?.veilrunner?.abilities ?? [], `${source.name} abilities migrated`);
  assert.equal(discipline.system.source, source.flags?.veilrunner?.source ?? "", `${source.name} source migrated`);
  assert.equal(discipline.system.pageImage, normalizedArt(source.system.pageImage), `${source.name} artwork migrated`);
}

console.log(`path compendia checks passed (${archetypes.length} archetypes, ${professions.length} professions, ${disciplines.length} disciplines)`);
