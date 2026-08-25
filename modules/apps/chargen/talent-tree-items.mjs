import { talentTreeCatalog } from "../../data/talent-tree.mjs";

const PAGE_PACK_NAMES = Object.freeze({
  magic: Object.freeze(["spell", "spells"]),
  skills: Object.freeze(["skill", "skills"])
});

const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection ?? []);
const token = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
const slug = value => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "node";
const pageKey = value => value === "magic" ? "magic" : "skills";

export function talentTreeDefinitionId(page, nodeId) {
  return `veilrunner.${pageKey(page) === "magic" ? "spell" : "skill"}.${slug(nodeId)}`;
}

export function findTalentTreePack(page, packs = globalThis.game?.packs) {
  const names = new Set(PAGE_PACK_NAMES[pageKey(page)]);
  return documentsIn(packs).find(pack => pack?.documentName === "Item" && [
    pack.title,
    pack.metadata?.label,
    pack.metadata?.name,
    pack.collection?.split(".").at(-1)
  ].some(value => names.has(token(value)))) ?? null;
}

export function talentTreeItemSource({ page, school, practice, leaf }) {
  const definitionId = talentTreeDefinitionId(page, leaf.id);
  const activationKind = leaf.type === "ability" ? "ability" : "action";
  const category = leaf.category || (pageKey(page) === "magic" ? "magic" : "actions");
  const actionType = leaf.type === "reaction" || category === "reactions" ? "reaction" : activationKind === "ability" ? "free" : "standard";
  return {
    name: leaf.name,
    type: pageKey(page) === "magic" ? "spell" : "skill",
    img: leaf.img || "icons/svg/light.svg",
    system: {
      definitionId,
      intents: ["action-provider", "chargen-selectable"],
      activationKind,
      category,
      actionType,
      actions: activationKind === "ability" ? 0 : Math.max(1, Number(leaf.actions) || 1),
      currentLevel: 1,
      maxLevel: Math.max(1, Number(leaf.maxRank) || 1),
      traits: Array.isArray(leaf.traits) ? leaf.traits : [],
      resourceCosts: leaf.resourceCosts ?? { mana: 0, stamina: 0, health: 0 },
      effects: Array.isArray(leaf.effects) ? leaf.effects : [],
      tree: {
        enabled: true,
        page: pageKey(page),
        school: school.name,
        practice: practice.name,
        x: Number(leaf.x) || 0,
        y: Number(leaf.y) || 0,
        requires: (leaf.requires ?? []).map(value => {
          const id = typeof value === "string" ? value : value?.id;
          const level = Math.max(1, Number(typeof value === "object" ? value?.level : 1) || 1);
          return `${id}:${level}`;
        }).filter(value => !value.startsWith("undefined:")),
        talentCost: Math.max(1, Number(leaf.talentCost) || 1),
        rankCost: Math.max(0, Number(leaf.rankCost) || 0),
        requiredLevel: Math.max(1, Number(leaf.requiredLevel) || 1)
      },
      description: leaf.description ?? ""
    },
    flags: { [globalThis.game?.system?.id ?? "Veilrunner"]: { treeNodeId: leaf.id, talentTreePage: pageKey(page) } }
  };
}

function documentId(document) {
  return document?._source?._id ?? document?.toObject?.()?._id ?? document?._id ?? document?.id;
}

function compendiumUuid(pack, document) {
  return document?.uuid ?? `Compendium.${pack.collection}.${documentId(document)}`;
}

export async function deleteLegacyTalentTreeItems(documents) {
  for (const document of new Set(documents ?? [])) {
    const uuid = String(document?.uuid ?? "");
    if (!uuid.startsWith("Compendium.")) {
      await document?.delete?.();
      continue;
    }
    const parts = uuid.split(".");
    const collection = parts.slice(1, -1).join(".");
    const id = documentId(document);
    const DocumentClass = document?.constructor ?? globalThis.Item;
    if (!collection || !id || typeof DocumentClass?.deleteDocuments !== "function") throw new Error(`Compendium Item ${uuid} does not expose a batch delete API.`);
    await DocumentClass.deleteDocuments([id], { pack: collection });
  }
}

function isDocumentInPack(document, pack) {
  return Boolean(document?.uuid?.startsWith?.(`Compendium.${pack.collection}.`));
}

async function createInPack(pack, source) {
  const DocumentClass = pack.documentClass ?? globalThis.Item;
  if (typeof DocumentClass?.createDocuments !== "function") throw new Error(`Compendium ${pack.collection} does not expose an Item batch create API.`);
  const [created] = await DocumentClass.createDocuments([source], { pack: pack.collection });
  if (!created) throw new Error(`Compendium ${pack.collection} did not return the created Item.`);
  return created;
}

async function updateInPack(pack, document, source) {
  const id = documentId(document);
  const DocumentClass = pack.documentClass ?? globalThis.Item;
  if (!id || typeof DocumentClass?.updateDocuments !== "function") throw new Error(`Compendium ${pack.collection} does not expose an Item batch update API.`);
  const [updated] = await DocumentClass.updateDocuments([{ _id: id, ...source }], { pack: pack.collection });
  return updated ?? await pack.getDocument(id);
}

/** Create or update one authored tree leaf in its Spells or Skills compendium. */
export async function upsertTalentTreeItem({ page, school, practice, leaf, force = true }) {
  const pack = findTalentTreePack(page);
  if (!pack) throw new Error(`The ${pageKey(page) === "magic" ? "Spells" : "Skills"} Item compendium is unavailable.`);
  const source = talentTreeItemSource({ page, school, practice, leaf });
  const previous = leaf.sourceUuid ? await globalThis.fromUuid?.(leaf.sourceUuid) : null;
  const documents = await pack.getDocuments();
  const systemId = globalThis.game.system.id;
  const existing = isDocumentInPack(previous, pack) ? previous : documents.find(item =>
    item.system?.definitionId === source.system.definitionId ||
    (item.flags?.[systemId]?.treeNodeId ?? item.flags?.veilrunner?.treeNodeId) === leaf.id
  );
  const replaceType = existing && existing.type !== source.type;
  const document = existing && !replaceType && !force && isDocumentInPack(previous, pack)
    ? previous
    : existing && !replaceType ? await updateInPack(pack, existing, source) : await createInPack(pack, source);
  leaf.sourceUuid = compendiumUuid(pack, document);
  leaf.definitionId = source.system.definitionId;
  const legacySources = [];
  if (replaceType) legacySources.push(existing);
  if (previous?.documentName === "Item" && previous !== existing && !isDocumentInPack(previous, pack) && previous.system?.tree?.enabled) legacySources.push(previous);
  return { document, legacySources };
}

function cleanEmbeddedSource(document) {
  const source = document.toObject();
  delete source._id;
  delete source.folder;
  delete source.sort;
  delete source.ownership;
  delete source._stats;
  return source;
}

function treeLeaves(catalog) {
  const records = new Map();
  for (const page of ["skills", "magic"]) for (const school of catalog[page] ?? []) for (const practice of school.practices ?? []) for (const leaf of practice.spells ?? []) {
    records.set(leaf.id, { page, school, practice, leaf });
  }
  return records;
}

export async function validateTalentTreeItemSources(tree, catalog = talentTreeCatalog()) {
  const records = treeLeaves(catalog);
  const errors = [];
  for (const purchase of tree?.leaves ?? []) {
    const record = records.get(purchase.id);
    if (!record?.leaf?.sourceUuid) { errors.push(`${purchase.id} has no compendium source.`); continue; }
    const source = await globalThis.fromUuid?.(record.leaf.sourceUuid);
    const expectedType = record.page === "magic" ? "spell" : "skill";
    if (source?.documentName !== "Item" || source.type !== expectedType || !String(source.uuid ?? "").startsWith("Compendium.")) errors.push(`${purchase.id} is not available from its ${expectedType === "spell" ? "Spells" : "Skills"} compendium.`);
  }
  return { valid: !errors.length, errors };
}

/** Synchronize purchased leaves to Actor Items copied from their canonical compendia. */
export async function syncActorTalentTreeItems(actor, tree = actor?.system?.talentTree, catalog = talentTreeCatalog()) {
  const records = treeLeaves(catalog);
  const systemId = globalThis.game.system.id;
  const treeNodeId = item => item.flags?.[systemId]?.treeNodeId ?? item.flags?.veilrunner?.treeNodeId;
  const existing = new Map(documentsIn(actor?.items).filter(item => treeNodeId(item)).map(item => [treeNodeId(item), item]));
  const creates = [];
  const updates = [];
  const errors = [];
  for (const purchase of tree?.leaves ?? []) {
    const record = records.get(purchase.id);
    if (!record?.leaf?.sourceUuid) { errors.push(`${purchase.id} has no compendium source.`); continue; }
    const sourceDocument = await globalThis.fromUuid?.(record.leaf.sourceUuid);
    if (sourceDocument?.documentName !== "Item") { errors.push(`${purchase.id} could not be resolved from ${record.leaf.sourceUuid}.`); continue; }
    const currentLevel = Math.min(Math.max(1, Number(sourceDocument.system?.maxLevel) || 1), Math.max(1, Number(purchase.rank) || 1));
    const current = existing.get(purchase.id);
    if (current) {
      const definitionId = sourceDocument.system?.definitionId ?? record.leaf.definitionId ?? "";
      if (current.type !== sourceDocument.type || Number(current.system?.currentLevel) !== currentLevel || current.system?.definitionId !== definitionId || current.flags?.core?.sourceId !== sourceDocument.uuid) {
        const update = {
          _id: current.id,
          "system.currentLevel": currentLevel,
          "system.definitionId": definitionId,
          [`flags.${systemId}.treeNodeId`]: purchase.id,
          "flags.core.sourceId": sourceDocument.uuid
        };
        if (current.type !== sourceDocument.type) {
          const replacementSystem = globalThis.foundry.utils.deepClone(sourceDocument.toObject().system);
          replacementSystem.currentLevel = currentLevel;
          update.type = sourceDocument.type;
          update.system = globalThis.foundry.data.operators.ForcedReplacement.create(replacementSystem);
          delete update["system.currentLevel"];
          delete update["system.definitionId"];
        }
        updates.push(update);
      }
      continue;
    }
    const source = cleanEmbeddedSource(sourceDocument);
    source.system ??= {};
    source.system.currentLevel = currentLevel;
    source.flags ??= {};
    source.flags.core = { ...(source.flags.core ?? {}), sourceId: sourceDocument.uuid };
    source.flags[systemId] = { ...(source.flags[systemId] ?? {}), treeNodeId: purchase.id, talentTreePage: record.page };
    creates.push(source);
  }
  if (errors.length) return { valid: false, errors, created: 0, updated: 0 };
  if (creates.length) await actor.createEmbeddedDocuments("Item", creates);
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return { valid: true, errors: [], created: creates.length, updated: updates.length };
}

/** GM-only, idempotent migration of saved leaves and Actor copies to canonical packs. */
export async function migrateTalentTreeItemsToCompendia() {
  if (!globalThis.game?.user?.isGM) return { migrated: 0, actors: 0, missingPacks: [] };
  const catalog = talentTreeCatalog();
  const originalCatalog = JSON.stringify(catalog);
  const missingPacks = ["magic", "skills"].filter(page => !findTalentTreePack(page));
  const legacySources = new Set();
  let migrated = 0;
  for (const page of ["magic", "skills"]) {
    if (missingPacks.includes(page)) continue;
    for (const school of catalog[page] ?? []) for (const practice of school.practices ?? []) for (const leaf of practice.spells ?? []) {
      const previousUuid = leaf.sourceUuid;
      const result = await upsertTalentTreeItem({ page, school, practice, leaf, force: false });
      for (const legacySource of result.legacySources) legacySources.add(legacySource);
      if (leaf.sourceUuid !== previousUuid) migrated += 1;
    }
  }
  if (JSON.stringify(catalog) !== originalCatalog) await globalThis.game.settings.set(globalThis.game.system.id, "talentTreeCatalog", catalog);
  await deleteLegacyTalentTreeItems(legacySources);
  let actors = 0;
  for (const actor of documentsIn(globalThis.game.actors).filter(actor => actor.type === "hero" && actor.system?.talentTree?.leaves?.length)) {
    const result = await syncActorTalentTreeItems(actor, actor.system.talentTree, catalog);
    if (result.valid && (result.created || result.updated)) actors += 1;
    else if (!result.valid) console.warn(`Veilrunner | Could not migrate ${actor.name}'s tree Items.`, result.errors);
  }
  if (missingPacks.length) console.warn("Veilrunner | Talent-tree Item migration is waiting for compendia.", missingPacks.map(page => page === "magic" ? "Spells" : "Skills"));
  return { migrated, actors, missingPacks };
}
