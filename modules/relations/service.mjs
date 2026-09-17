import { emptyLedger, projectLedger, transact } from "./model.mjs";
import { getPartyMembers } from "../helpers/party.mjs";
import { initializeRelationsIdentity, sealRelations, unsealRelations, publicIdentity } from "./vault.mjs";

const NS = "Veilrunner";
export const RELATIONS_HOOK = "veilrunnerRelationsChanged";
export const storageKind = document => document?.getFlag?.(NS, "relationsStore") ?? "";
const journals = () => Array.from(game.journal ?? []);
const users = () => Array.from(game.users ?? []);
export const activeRelationsGM = () => {
  const authority = store("authority"), encrypted = authority ? envelope(authority) : null;
  return users().filter(u => u.isGM && u.active && publicIdentity(u) && (!authority || encrypted?.keyIds?.[u.id] === publicIdentity(u).n)).sort((a, b) => a.id.localeCompare(b.id))[0];
};
let identityReady = false;
const decrypted = new Map();
const hydrationVersions = new Map();
export const canManageRelations = () => Boolean(identityReady && game.user?.isGM && activeRelationsGM()?.id === game.user.id && (!registry().authority || store("authority") && decrypted.has(store("authority").id)));
export const canObserve = (document, user = game.user) => Boolean(document?.testUserPermission?.(user, "OBSERVER"));
export function canReadLinkedJournal(document, user = game.user) {
  if (!canObserve(document, user) || storageKind(document)) return false;
  const data = document.getFlag?.(NS, "datapad") ?? {};
  return user.isGM || (!data.hidden && data.status !== "undiscovered");
}
export function trustedRelationsStore(journal) {
  if (!storageKind(journal) || registry()[storageKind(journal)] !== journal.uuid) return false;
  if ((journal.ownership?.default ?? 0) !== 0) return false;
  return users().filter(u => !u.isGM).every(u => (journal.ownership?.[u.id] ?? 0) < 3);
}
const registry = () => game.settings.get(NS, "relationsStorage") ?? {};
const store = kind => journals().find(j => storageKind(j) === kind && trustedRelationsStore(j) && canObserve(j));
const page = journal => journal?.pages?.contents?.[0] ?? Array.from(journal?.pages ?? [])[0];
const encode = data => "```json\n" + JSON.stringify(data) + "\n```";
function envelope(journal) {
  const raw = page(journal)?.text?.markdown;
  if (!raw) return null;
  const parsed = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, ""));
  return parsed;
}
async function hydrate(journal) {
  const version = (hydrationVersions.get(journal?.id) ?? 0) + 1;
  hydrationVersions.set(journal?.id, version);
  if (!journal || !trustedRelationsStore(journal) || !canObserve(journal)) { if (journal) decrypted.delete(journal.id); return; }
  const raw = envelope(journal);
  const data = raw && await unsealRelations(raw);
  if (hydrationVersions.get(journal.id) !== version) return;
  if (data?.version === 1) decrypted.set(journal.id, data);
  else decrypted.delete(journal.id);
}
export function permittedPerspectives(user = game.user) {
  return Array.from(game.actors ?? []).filter(actor => user.isGM || (actor.type === "party"
    ? getPartyMembers(actor, { user }).some(member => member.testUserPermission(user, "OWNER"))
    : actor.testUserPermission(user, "OWNER")));
}
export function normalizePerspective(options = {}) {
  const allowed = permittedPerspectives();
  const character = allowed.find(a => a.uuid === options.characterUuid && a.type !== "party")
    ?? (!options.characterUuid ? allowed.find(a => a.id === game.user.character?.id) : null);
  const party = allowed.find(a => (a.id === options.partyId || a.uuid === options.partyUuid) && a.type === "party");
  return { characterUuid: character?.uuid ?? "", partyId: party?.id ?? "", source: options.perspective === "party" ? party?.uuid ?? "" : character?.uuid ?? "" };
}
function access(user) {
  return { userId: user.id, perspectives: permittedPerspectives(user).map(a => a.uuid), actorUuids: Array.from(game.actors ?? []).filter(a => canObserve(a, user)).map(a => a.uuid), journalUuids: journals().filter(j => canReadLinkedJournal(j, user)).map(j => j.uuid) };
}
export function readRelations() {
  const journal = store(game.user.isGM ? "authority" : `view:${game.user.id}`);
  const data = structuredClone(journal && decrypted.get(journal.id) || emptyLedger());
  if (game.user.isGM) return data;
  // Recheck locally after ownership changes, even while a new GM projection is pending.
  const allowed = new Set(permittedPerspectives().map(a => a.uuid));
  data.relations = data.relations.filter(r => !r.source.startsWith("Actor.") || allowed.has(r.source));
  const relationIds = new Set(data.relations.map(r => r.id));
  data.events = data.events.filter(e => (e.changes ?? []).every(c => c.table !== "relations" || relationIds.has(c.id)));
  data.links = data.links.filter(l => journals().some(j => j.uuid === l.journalUuid && canReadLinkedJournal(j)));
  for (const entity of data.entities) if (entity.actorUuid && !Array.from(game.actors ?? []).some(a => a.uuid === entity.actorUuid && canObserve(a))) entity.actorUuid = "";
  return data;
}
async function saveStore(kind, data, userId = null) {
  const recipients = userId ? users().filter(u => u.id === userId) : users().filter(u => u.isGM);
  if (userId && !publicIdentity(recipients[0])) return null;
  const encrypted = await sealRelations(data, recipients);
  const ownership = { default: 0, ...(userId ? { [userId]: 2 } : {}) };
  let journal = journals().find(j => storageKind(j) === kind && trustedRelationsStore(j));
  if (!journal) {
    journal = await JournalEntry.create({ name: "Relations data", ownership, flags: { [NS]: { relationsStore: kind } }, pages: [{ name: "Relations data", type: "text", text: { format: 2, markdown: encode(encrypted) } }] });
    await game.settings.set(NS, "relationsStorage", { ...registry(), [kind]: journal.uuid });
  } else {
    // Explicit ownership prevents generic journal editing from turning a view into writable authority.
    await journal.update({ ownership });
    const existing = page(journal);
    if (existing) await existing.update({ "text.format": 2, "text.markdown": encode(encrypted) });
    else await journal.createEmbeddedDocuments("JournalEntryPage", [{ name: "Relations data", type: "text", text: { format: 2, markdown: encode(encrypted) } }]);
  }
  if (!userId || userId === game.user.id) {
    hydrationVersions.set(journal.id, (hydrationVersions.get(journal.id) ?? 0) + 1);
    decrypted.set(journal.id, structuredClone(data));
  }
  return journal;
}
let queue = Promise.resolve();
function serialized(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; }
async function publish(state) {
  for (const user of users().filter(u => !u.isGM)) await saveStore(`view:${user.id}`, projectLedger(state, access(user)), user.id);
}
async function commitCurrent(command) {
    if (!canManageRelations()) throw new Error("The active Relations GM must make this change.");
    const current = readRelations();
    const next = transact(current, command, { isGM: game.user.isGM, id: () => foundry.utils.randomID(), author: game.user.id, time: game.time.worldTime });
    if (next === current) return current;
    // Invalidate old snapshots before changing authority, so a failed publish cannot leave revoked secrets readable.
    await publish(emptyLedger());
    await saveStore("authority", next);
    try { await publish(next); }
    catch (error) { ui.notifications.error("Relations saved, but player views could not be refreshed. Use Refresh player views."); throw error; }
    Hooks.callAll(RELATIONS_HOOK);
    return next;
}
export function commitRelations(command) { return serialized(() => commitCurrent(command)); }
export function refreshRelationsViews() {
  return serialized(async () => {
    if (canManageRelations()) {
      const state = readRelations();
      if (store("authority")) await saveStore("authority", state);
      await publish(state); await provisionNotes(); Hooks.callAll(RELATIONS_HOOK);
    }
  });
}
export function setStanding(source, targetId, value, { acquainted, reason = "Standing adjustment" } = {}) {
  return serialized(() => commitCurrent({ type: "standing", revision: readRelations().revision, source, targetId, value, acquainted, reason }));
}
export function adjustStanding(source, targetId, delta, { toggleAcquaintance = false } = {}) {
  return serialized(() => commitCurrent({ type: "standing", revision: readRelations().revision, source, targetId, delta, toggleAcquaintance, reason: toggleAcquaintance ? "Acquaintance changed" : "Standing adjustment" }));
}
export function previewEvent(id) {
  const state = readRelations();
  return transact(state, { type: "applyEvent", id, revision: state.revision }, { isGM: game.user.isGM, id: () => "preview", author: game.user.id, time: game.time.worldTime }).events.find(e => e.id === id)?.changes ?? [];
}
export async function adoptRelations(actorUuid) {
  const actor = await fromUuid(actorUuid);
  if (!actor || !game.user.isGM) throw new Error("Choose an Actor.");
  return commitRelations({ type: "adopt", revision: readRelations().revision, actorUuid, entries: [
    ...(actor.system.relationships ?? []).map(r => ({ kind: "character", name: r.name, img: r.img, label: r.status, value: r.value })),
    ...(actor.system.reputation ?? []).map(r => ({ kind: "faction", name: r.name, label: r.standing, value: r.value }))
  ] });
}
export async function provisionNotes() {
  if (!canManageRelations()) return;
  for (const user of users()) {
    const folder = game.folders.find(f => f.getFlag?.(NS, "datapadOwnerUserId") === user.id && /player/i.test(f.folder?.name ?? game.folders.get(f.folder)?.name ?? ""));
    const existing = journals().find(j => j.getFlag(NS, "relationsNotesOwner") === user.id);
    if (existing) {
      if (!existing.folder && folder) await existing.update({ folder: folder.id });
      continue;
    }
    await JournalEntry.create({ name: `${user.name} — Relation notes`, folder: folder?.id ?? null, ownership: { default: 0, [user.id]: 3 }, flags: { [NS]: { relationsNotesOwner: user.id, datapad: { category: "my-journal", ownerUserId: user.id, shareScope: "none", hidden: false } } } });
  }
}
export function personalNote(targetId) {
  const journal = journals().find(j => j.getFlag(NS, "relationsNotesOwner") === game.user.id && canObserve(j));
  const found = Array.from(journal?.pages ?? []).find(p => noteContents.get(p.uuid)?.targetId === targetId);
  return { journal, page: found, content: found ? noteContents.get(found.uuid)?.content ?? "" : "" };
}
const noteContents = new Map();
export function relationNotebook(document) { return Boolean(document?.getFlag?.(NS, "relationsNotesOwner")); }
export function notebookTargets(document) {
  if (!canObserve(document)) return [];
  const state = readRelations(), visible = [...state.entities, ...state.maps, ...state.events];
  return Array.from(document.pages ?? []).map(p => noteContents.get(p.uuid)).filter(n => n && visible.some(e => e.id === n.targetId)).map(n => ({ ...n, name: visible.find(e => e.id === n.targetId).name }));
}
async function hydrateNotes(journal) {
  for (const p of journal.pages ?? []) {
    let data;
    try { data = await unsealRelations(JSON.parse((p.text?.markdown ?? "").replace(/^\x60\x60\x60json\s*/, "").replace(/\s*\x60\x60\x60$/, ""))); } catch {}
    if (canObserve(journal) && data?.targetId) noteContents.set(p.uuid, data);
    else noteContents.delete(p.uuid);
  }
}
export async function writePersonalNote(targetId, content) {
  const state = readRelations();
  if (![...state.entities, ...state.maps, ...state.events].some(e => e.id === targetId)) throw new Error("Unavailable.");
  const { journal, page: existing } = personalNote(targetId);
  if (!journal?.isOwner) throw new Error("A GM must initialize your Relations notebook first.");
  const encrypted = await sealRelations({ targetId, content }, users().filter(u => u.id === game.user.id || u.isGM));
  const data = { name: "Relation note", type: "text", text: { format: 2, markdown: encode(encrypted) } };
  if (existing) await existing.update({ "text.format": 2, "text.markdown": data.text.markdown });
  else await journal.createEmbeddedDocuments("JournalEntryPage", [data]);
  await hydrateNotes(journal);
  Hooks.callAll(RELATIONS_HOOK);
}
export function relatedJournals(targetId) {
  return readRelations().links.filter(l => l.targetId === targetId).map(l => journals().find(j => j.uuid === l.journalUuid && canReadLinkedJournal(j))).filter(Boolean);
}
export async function linkJournal(targetId, journalUuid, audience = []) {
  const document = await fromUuid(journalUuid);
  if (document?.documentName !== "JournalEntry" || storageKind(document) || !canObserve(document)) throw new Error("Choose a visible journal entry.");
  const state = readRelations();
  if (state.links.some(link => link.targetId === targetId && link.journalUuid === journalUuid)) return state;
  return commitRelations({ type: "put", table: "links", revision: readRelations().revision, record: { targetId, journalUuid, audience } });
}

let refreshTimer;
function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (canManageRelations()) void refreshRelationsViews().catch(console.error); Hooks.callAll(RELATIONS_HOOK); }, 100);
}
export async function reloadRelationsAccess() {
  for (const journal of journals()) {
    if (storageKind(journal)) await hydrate(journal);
    if (relationNotebook(journal)) await hydrateNotes(journal);
  }
  if (canManageRelations()) await refreshRelationsViews();
  Hooks.callAll(RELATIONS_HOOK);
}
export function registerRelationsService() {
  game.settings.register(NS, "relationsStorage", { scope: "world", config: false, restricted: true, type: Object, default: {} });
  Hooks.once("ready", async () => {
    await initializeRelationsIdentity();
    identityReady = true;
    for (const journal of journals()) {
      if (storageKind(journal)) await hydrate(journal);
      if (relationNotebook(journal)) await hydrateNotes(journal);
    }
    if (canManageRelations()) { await provisionNotes(); await refreshRelationsViews(); }
    else if (game.user.isGM && store("authority") && !decrypted.has(store("authority").id)) ui.notifications.warn("Relations is locked on this browser. Open it from a GM browser with access and refresh player views to grant access here.");
    Hooks.callAll(RELATIONS_HOOK);
  });
  for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry", "createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) Hooks.on(hook, document => {
    const journal = document.documentName === "JournalEntryPage" ? document.parent : document;
    if (storageKind(journal)) { void hydrate(journal).then(() => Hooks.callAll(RELATIONS_HOOK)).catch(error => ui.notifications.error(error.message)); return; }
    if (relationNotebook(journal)) { void hydrateNotes(journal).then(() => Hooks.callAll(RELATIONS_HOOK)); return; }
    scheduleRefresh();
  });
  for (const hook of ["updateActor", "deleteActor", "updateUser", "deleteUser", "userConnected"]) Hooks.on(hook, scheduleRefresh);
  Hooks.on("updateSetting", setting => {
    if (setting.key !== NS + ".relationsStorage") return;
    void Promise.all(journals().filter(j => storageKind(j)).map(hydrate)).then(() => Hooks.callAll(RELATIONS_HOOK));
  });
  Hooks.on("updateWorldTime", () => Hooks.callAll(RELATIONS_HOOK));
}
