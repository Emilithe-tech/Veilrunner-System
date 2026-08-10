import { VEILRUNNER_PERSONA_INDEX_MODIFIERS, VEILRUNNER_PROFESSIONS } from "../data/professions.mjs";
import { getVeilrunnerRuleReferences } from "../data/rules.mjs";

const FOLDER_TYPE = "JournalEntry";
const DEFAULT_OWNERSHIP = CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
const ARCHETYPE_ORDER = ["Physique", "Armament", "Magic"];
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

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function paragraphs(value) {
  return String(value ?? "").split(/\r?\n\r?\n/).filter(Boolean)
    .map(paragraph => `<p>${escape(paragraph)}</p>`).join("");
}

function disciplineSection(discipline) {
  const attributes = values => values?.map(escape).join(", ") || "-";
  const abilities = discipline.abilities?.map(ability =>
    `<section><h4>${escape(ability.name)}</h4><p><em>${escape(ability.type)}</em></p><p>${escape(ability.text)}</p></section>`
  ).join("") || "";
  return `<section><h2>${escape(discipline.name)}</h2><p>${escape(discipline.summary)}</p><h3>Discipline Details</h3><dl><dt>Primary Weapon</dt><dd>${escape(discipline.primaryWeapon)}</dd><dt>Primary Attributes</dt><dd>${attributes(discipline.primaryAttributes)}</dd><dt>Bonus Attributes</dt><dd>${attributes(discipline.bonusAttributes)}</dd><dt>Bonus Skill</dt><dd>${escape(discipline.bonusSkill)}</dd><dt>Persona Index</dt><dd>${attributes(discipline.persona)}</dd></dl>${discipline.background ? `<h3>Background</h3>${paragraphs(discipline.background)}` : ""}${abilities ? `<h3>Abilities</h3>${abilities}` : ""}</section>`;
}

function professionPage(profession) {
  const disciplines = profession.disciplines.map(discipline => ({
    ...discipline,
    persona: VEILRUNNER_PERSONA_INDEX_MODIFIERS[`${profession.name}:${discipline.name}`] ?? discipline.persona
  }));
  return {
    name: profession.name,
    type: "text",
    text: {
      format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML,
      content: `<p>${escape(profession.summary)}</p>${disciplines.map(disciplineSection).join("")}`
    },
    flags: { [game.system.id]: { referenceJournal: { kind: "professionPage", profession: profession.name, layoutVersion: 3 } } }
  };
}

function rulePage(rule) {
  const bands = rule.bands?.length ? `<h2>Initiative Bands</h2><ul>${rule.bands.map(band => `<li><strong>${escape(band.name)}:</strong> ${escape(band.range)}</li>`).join("")}</ul>` : "";
  const rules = rule.rules?.length ? `<h2>Rules</h2><ol>${rule.rules.map(entry => `<li>${escape(entry)}</li>`).join("")}</ol>` : "";
  const callouts = rule.callouts?.map(callout => `<section><h2>${escape(callout.title)}</h2><p>${escape(callout.text)}</p></section>`).join("") || "";
  return {
    name: rule.title,
    type: "text",
    text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: `<h1>${escape(rule.title)}</h1><p>${escape(rule.summary)}</p>${bands}${rules}${callouts}` },
    flags: { [game.system.id]: { referenceJournal: { kind: "rule", key: rule.key } } }
  };
}

async function ensureFolder(name) {
  let folder = game.folders.find(entry => entry.type === FOLDER_TYPE && entry.name === name && !entry.folder);
  if (!folder) folder = await Folder.create({ name, type: FOLDER_TYPE, sorting: "a" });
  return folder;
}

async function ensureJournal({ name, folder, pages, kind }) {
  let journal = game.journal.find(entry => entry.folder?.id === folder.id && entry.getFlag(game.system.id, "referenceJournal")?.kind === kind && entry.name === name);
  if (!journal) {
    journal = await JournalEntry.create({
      name,
      folder: folder.id,
      ownership: { default: DEFAULT_OWNERSHIP },
      pages,
      flags: { [game.system.id]: { referenceJournal: { kind } } }
    });
    return journal;
  }

  const referenceKey = reference => `${reference?.kind ?? ""}:${reference?.profession ?? reference?.key ?? ""}`;
  const desiredPages = new Map(pages.map(page => [referenceKey(page.flags[game.system.id].referenceJournal), page]));
  const existingKeys = new Set(journal.pages.map(page => referenceKey(page.getFlag(game.system.id, "referenceJournal"))));
  const upgrades = journal.pages.map(page => {
    const reference = page.getFlag(game.system.id, "referenceJournal");
    const desired = desiredPages.get(referenceKey(reference));
    if (!desired || reference?.kind !== "professionPage" || reference.layoutVersion >= 3) return null;
    return { _id: page.id, text: desired.text, flags: desired.flags };
  }).filter(Boolean);
  if (upgrades.length) await journal.updateEmbeddedDocuments("JournalEntryPage", upgrades);
  const missingPages = pages.filter(page => !existingKeys.has(referenceKey(page.flags[game.system.id].referenceJournal)));
  if (missingPages.length) await journal.createEmbeddedDocuments("JournalEntryPage", missingPages);
  return journal;
}

async function removeLegacyProfessionJournals(folder) {
  const legacy = game.journal.filter(entry => entry.folder?.id === folder.id && entry.getFlag(game.system.id, "referenceJournal")?.kind === "profession");
  for (const journal of legacy) await journal.delete();
}

/** Create native, player-readable Journal references without overwriting GM edits. */
export async function ensureReferenceJournals() {
  if (!game.user.isGM) return;
  const professionFolder = await ensureFolder("Professions & Disciplines");
  await removeLegacyProfessionJournals(professionFolder);
  for (const archetype of ARCHETYPE_ORDER) {
    const professions = VEILRUNNER_PROFESSIONS.filter(profession => PROFESSION_ARCHETYPES[profession.name] === archetype);
    if (!professions.length) continue;
    await ensureJournal({
      name: archetype,
      folder: professionFolder,
      pages: professions.map(professionPage),
      kind: "archetype"
    });
  }

  const rulesFolder = await ensureFolder("Rules");
  await ensureJournal({ name: "Veilrunner Rules", folder: rulesFolder, pages: getVeilrunnerRuleReferences().map(rulePage), kind: "rules" });
}

export function registerReferenceJournals() {
  Hooks.once("ready", () => ensureReferenceJournals().catch(error => console.error("Veilrunner | Unable to create reference journals", error)));
}
