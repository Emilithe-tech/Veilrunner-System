import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VEILRUNNER_PROFESSIONS } from "../modules/data/professions.mjs";

const systemRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packDirectory = path.join(systemRoot, "packs");
const packs = { abilities: [], actions: [], reactions: [], traits: [] };

const slug = value => String(value ?? "").trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const idFor = value => createHash("sha1").update(value).digest("hex").slice(0, 16);
const html = value => String(value ?? "").split(/\n{2,}/).filter(Boolean)
  .map(paragraph => `<p>${paragraph.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;")}</p>`).join("");

function packFor(sourceType) {
  const type = String(sourceType ?? "Ability").toLowerCase();
  if (type.includes("reaction")) return "reactions";
  if (type.includes("trait")) return "traits";
  if (type.includes("action")) return "actions";
  return "abilities";
}

function actionSystem({ pack, sourceType, definitionId, description }) {
  const reaction = pack === "reactions";
  const actionPoints = reaction ? 0 : Math.max(1, (String(sourceType).match(/>/g) ?? []).length || 1);
  return {
    definitionId,
    intents: reaction ? ["action-provider", "reaction-provider"] : ["action-provider"],
    providedActionIds: [],
    activationKind: "action",
    actionType: reaction ? "reaction" : "standard",
    category: reaction ? "reactions" : "actions",
    favorite: false,
    actions: actionPoints,
    damageType: "",
    currentLevel: 1,
    maxLevel: 1,
    damageDice: 0,
    damageDie: 6,
    damageLevelInterval: 3,
    cost: "",
    rollFormula: "",
    selector: reaction ? "reaction" : "action",
    requiredItemTypes: [],
    requiredItemTraits: [],
    requiredDefinitionIds: [],
    requiredItemIntents: [],
    requiresTarget: false,
    requiredEffects: [],
    requiredTargetEffects: [],
    composer: [],
    summary: "",
    description,
    traits: [reaction ? "reaction" : "action"]
  };
}

function abilitySystem({ pack, definitionId, description }) {
  return {
    definitionId,
    intents: ["action-provider"],
    providedActionIds: [],
    featured: false,
    category: "actions",
    actions: 0,
    damageType: "",
    currentLevel: 1,
    maxLevel: 1,
    damageDice: 0,
    damageDie: 6,
    damageLevelInterval: 3,
    recharge: "",
    summary: "",
    description,
    traits: [pack === "traits" ? "trait" : "ability"]
  };
}

for (const profession of VEILRUNNER_PROFESSIONS) {
  for (const discipline of profession.disciplines ?? []) {
    for (const ability of discipline.abilities ?? []) {
      const pack = packFor(ability.type);
      const key = `${profession.name}:${discipline.name}:${ability.name}`;
      const definitionId = `veilrunner.unique-${pack}.${slug(profession.name)}.${slug(discipline.name)}.${slug(ability.name)}`;
      const description = html(ability.description || ability.text);
      const itemType = pack === "actions" || pack === "reactions" ? "action" : "ability";
      const system = itemType === "action"
        ? actionSystem({ pack, sourceType: ability.type, definitionId, description })
        : abilitySystem({ pack, definitionId, description });
      packs[pack].push({
        _id: idFor(key),
        name: ability.name,
        type: itemType,
        img: pack === "reactions" ? "icons/svg/lightning.svg" : pack === "traits" ? "icons/svg/aura.svg" : pack === "actions" ? "icons/svg/sword.svg" : "icons/svg/upgrade.svg",
        system,
        effects: [],
        folder: null,
        sort: (packs[pack].length + 1) * 100000,
        ownership: { default: 0 },
        flags: { veilrunner: { uniqueAbility: true, profession: profession.name, discipline: discipline.name, sourceAbilityName: ability.name, sourceType: ability.type, rulesText: ability.description || ability.text } },
        _stats: { systemId: "Veilrunner", systemVersion: "0.0.16", coreVersion: "14.365" }
      });
    }
  }
}

for (const [pack, entries] of Object.entries(packs)) {
  const target = path.join(packDirectory, `unique-${pack}.db`);
  if (path.dirname(target) !== packDirectory) throw new Error(`Unsafe pack target: ${target}`);
  await writeFile(target, `${entries.map(entry => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  console.log(`${pack}: ${entries.length}`);
}
