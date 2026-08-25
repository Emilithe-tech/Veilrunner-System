import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ARCHETYPE_OPTIONS, ARCHETYPE_SUMMARIES, fallbackPathRecords } from "../modules/data/path-options.mjs";
import { VEILRUNNER_PERSONA_INDEX_MODIFIERS, VEILRUNNER_PROFESSIONS } from "../modules/data/professions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "packs", "professions.db");
const sourceRows = fs.existsSync(sourcePath)
  ? fs.readFileSync(sourcePath, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  : [];

const slug = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const documentId = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
const definitionId = (...parts) => `veilrunner.${parts.map(slug).filter(Boolean).join(".")}`;
const normalizeArt = value => {
  const art = String(value ?? "").trim();
  if (!art) return "";
  if (/^(?:systems\/|icons\/|https?:\/\/|data:)/i.test(art)) return art;
  return art.startsWith("assets/") ? `systems/veilrunner/${art}` : art;
};
const sourceKey = (profession, discipline) => `${profession}:${discipline}`.toLowerCase();
const sources = new Map(sourceRows.map(row => [sourceKey(row.system?.profession, row.system?.discipline), row]));
const authoredProfessions = new Map(VEILRUNNER_PROFESSIONS.map(entry => [entry.name, entry]));
const pathRecords = fallbackPathRecords();

function baseItem({ collection, documentKey, name, type, img, system, flags = {}, sort }) {
  return {
    _id: documentId(`${collection}:${documentKey || system.definitionId}`), name, type, img: img || "icons/svg/book.svg", system,
    effects: [], folder: null, sort, ownership: { default: 0 }, flags,
    _stats: { systemId: "Veilrunner", systemVersion: "0.0.16", coreVersion: "14.365", createdTime: 1787443200000, modifiedTime: 1787443200000, lastModifiedBy: null }
  };
}

const archetypes = ARCHETYPE_OPTIONS.map((name, index) => baseItem({
  collection: "archetypes", documentKey: definitionId("archetype", name === "Technical" ? "Tech" : name),
  name, type: "archetype", sort: (index + 1) * 100000,
  system: {
    definitionId: definitionId("archetype", name), intents: ["chargen-selectable"], providedActionIds: [],
    summary: ARCHETYPE_SUMMARIES[name] ?? "", description: ""
  }
}));

const professions = pathRecords.map((record, index) => {
  const authored = authoredProfessions.get(record.profession);
  const source = record.disciplines.map(discipline => sources.get(sourceKey(record.profession, discipline))).find(Boolean);
  const art = normalizeArt(source?.system?.pageImage || source?.img);
  return baseItem({
    collection: "professions", name: record.profession, type: "profession", img: art, sort: (index + 1) * 100000,
    system: {
      definitionId: definitionId("profession", record.profession), intents: ["chargen-selectable"], providedActionIds: [],
      archetypeId: definitionId("archetype", record.archetype), archetype: record.archetype,
      summary: source?.flags?.veilrunner?.professionSummary ?? authored?.summary ?? record.summary ?? "",
      pageImage: art, description: ""
    }
  });
});

const disciplines = pathRecords.flatMap(record => record.disciplines.map(name => ({ record, name }))).map(({ record, name }, index) => {
  const authored = authoredProfessions.get(record.profession)?.disciplines?.find(entry => entry.name === name);
  const source = sources.get(sourceKey(record.profession, name));
  const art = normalizeArt(source?.system?.pageImage || authored?.img || source?.img);
  const sourceFlags = source?.flags?.veilrunner ?? {};
  return baseItem({
    collection: "disciplines", name, type: "discipline", img: art, sort: (index + 1) * 100000,
    system: {
      definitionId: definitionId("discipline", record.profession, name), intents: ["chargen-selectable"], providedActionIds: [],
      professionId: definitionId("profession", record.profession), profession: record.profession,
      summary: sourceFlags.disciplineSummary ?? authored?.summary ?? "", quote: source?.system?.quote ?? "",
      primaryWeapon: source?.system?.primaryWeapon ?? authored?.primaryWeapon ?? "",
      primaryAttributes: source?.system?.primaryAttributes ?? authored?.primaryAttributes ?? [],
      bonusAttributes: source?.system?.bonusAttributes ?? authored?.bonusAttributes ?? [],
      bonusSkill: source?.system?.bonusSkill ?? authored?.bonusSkill ?? "",
      persona: VEILRUNNER_PERSONA_INDEX_MODIFIERS[`${record.profession}:${name}`] ?? source?.system?.persona ?? authored?.persona ?? [],
      tags: source?.system?.tags ?? authored?.tags ?? [],
      abilities: sourceFlags.abilities ?? authored?.abilities ?? [],
      pageImage: art, source: sourceFlags.source ?? "",
      sourcePage: source?.system?.sourcePage ?? "", description: authored?.background ?? ""
    },
    flags: { veilrunner: { ...sourceFlags, profession: record.profession, discipline: name, abilities: authored?.abilities ?? sourceFlags.abilities ?? [] } }
  });
});

for (const [filename, entries] of [["archetypes.db", archetypes], ["path-professions.db", professions], ["disciplines.db", disciplines]]) {
  fs.writeFileSync(path.join(root, "packs", filename), `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

console.log(`Built ${archetypes.length} Archetypes, ${professions.length} Professions, and ${disciplines.length} Disciplines.`);
