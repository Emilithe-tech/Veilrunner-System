import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) };
const collection = values => Object.assign(values, { get(id) { return this.find(v => v.id === id); }, get contents() { return this; } });
function user(id, isGM = false) {
  const flags = {};
  return { id, name: id, isGM, active: true, getFlag: (_ns,k) => flags[k], setFlag: async (_ns,k,v) => { flags[k] = v; } };
}
const gm = user('gm', true), player = user('player'), stranger = user('stranger');
const actors = collection([{ id: 'hero', uuid: 'Actor.hero', name: 'Hero', type: 'hero', testUserPermission: u => u.isGM || u.id === 'player' }, { id: 'other', uuid: 'Actor.other', name: 'Other', type: 'hero', testUserPermission: u => u.isGM || u.id === 'stranger' }]);
let ids = 0;
globalThis.game = { world: { id: 'service-test' }, user: gm, users: collection([gm,player,stranger]), actors, folders: collection([]), journal: collection([]), time: { worldTime: 100 }, system: { id: 'Veilrunner' } };
const settings = new Map();
game.settings = { register: (_ns,k,definition) => { if (!settings.has(k)) settings.set(k,definition.default); }, get: (_ns,k) => settings.get(k), set: async (_ns,k,v) => { settings.set(k,v); } };
globalThis.foundry = { utils: { randomID: () => 'doc' + ++ids } };
globalThis.ui = { notifications: { error() {}, warn() {} } };
const hooks = new Map();
globalThis.Hooks = { once: (key, fn) => hooks.set(key, fn), on() {}, callAll() {} };
function makePage(data, journal) {
  return { ...data, uuid: journal.uuid + '.JournalEntryPage.' + ++ids, getFlag: (_ns,k) => data.flags?.Veilrunner?.[k], async update(change) {
    this.text ??= {};
    for (const [key,value] of Object.entries(change)) { if (key.startsWith('text.')) this.text[key.slice(5)] = value; }
  } };
}
globalThis.JournalEntry = { async create(data) {
  const id = 'journal' + ++ids;
  const doc = { ...data, id, uuid: 'JournalEntry.' + id, documentName: 'JournalEntry', _stats: { createdBy: game.user.id },
    getFlag(ns,k) { return this.flags?.[ns]?.[k]; },
    testUserPermission(user, level) { return user.isGM || (this.ownership[user.id] ?? this.ownership.default ?? 0) >= (level === 'OWNER' ? 3 : 2); },
    get isOwner() { return this.testUserPermission(game.user,'OWNER'); },
    async update(changes) { Object.assign(this,changes); },
    async createEmbeddedDocuments(_type, pages) { this.pages.push(...pages.map(p => makePage(p,this))); }
  };
  doc.pages = collection((data.pages ?? []).map(p => makePage(p,doc)));
  game.journal.push(doc); return doc;
} };
globalThis.fromUuid = async uuid => [...game.journal,...game.actors].find(d => d.uuid === uuid);
const vault = await import('../modules/relations/vault.mjs');
const service = await import('../modules/relations/service.mjs');
test('encrypted authority and projections survive reload; players cannot mutate; notes stay private', async () => {
  for (const user of game.users) { game.user = user; await vault.initializeRelationsIdentity(); }
  game.user = gm; await vault.initializeRelationsIdentity();
  service.registerRelationsService(); await hooks.get('ready')();
  assert.equal(service.canManageRelations(), true);
  let state = await service.commitRelations({ type: 'put', table: 'entities', revision: 0, record: { id: 'npc', kind: 'character', name: 'Broker', gmNotes: 'secret dossier', audience: ['player'] } });
  state = await service.commitRelations({ type: 'put', table: 'relations', revision: state.revision, record: { id: 'r', source: 'Actor.hero', targetId: 'npc', value: 4, audience: ['player'] } });
  const serialized = JSON.stringify(game.journal.map(j => ({ flags: j.flags, pages: j.pages.map(p => p.text) })));
  assert.doesNotMatch(serialized, /secret dossier|Broker|Actor.hero/);
  const authority = game.journal.find(j => service.storageKind(j) === 'authority');
  assert.equal(authority.ownership.default, 0);
  game.user = player; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  assert.equal(service.readRelations().entities[0].name, 'Broker');
  assert.equal(service.readRelations().entities[0].gmNotes, undefined);
  assert.equal(service.normalizePerspective({ characterUuid: 'Actor.other' }).source, '');
  assert.equal(service.normalizePerspective({ characterUuid: 'Actor.hero' }).source, 'Actor.hero');
  await assert.rejects(service.commitRelations({ type: 'advance', revision: 2, time: 2 }), /active Relations GM/);
  const forged = await JournalEntry.create({ name: 'Forged', flags: { Veilrunner: { relationsStore: 'view:player' } }, ownership: { default: 0, player: 3 } });
  assert.equal(service.trustedRelationsStore(forged), false);
  const hidden = await JournalEntry.create({ name: 'Hidden quest', flags: { Veilrunner: { datapad: { hidden: true } } }, ownership: { default: 2 } });
  assert.equal(service.canReadLinkedJournal(hidden), false);
  await service.writePersonalNote('npc', 'my private note');
  assert.equal(service.personalNote('npc').content, 'my private note');
  const notebook = service.personalNote('npc').journal;
  assert.doesNotMatch(JSON.stringify(notebook.pages.map(p => p.text)), /my private note|npc/);
  game.user = stranger; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  assert.deepEqual(service.readRelations().entities, []);
  assert.deepEqual(service.notebookTargets(notebook), []);
  game.user = gm; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  state = service.readRelations();
  await service.commitRelations({ type: 'put', table: 'entities', revision: state.revision, record: { ...state.entities[0], audience: [] } });
  game.user = player; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  assert.deepEqual(service.readRelations().entities, []);
  assert.deepEqual(service.notebookTargets(notebook), []);
});
test('all editor types render numeric, array, audience, and event fields', async () => {
  game.user = gm; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  game.scenes = [];
  const require = createRequire('C:/Program Files/Foundry Virtual Tabletop/resources/app/package.json');
  const H = require('handlebars').create();
  globalThis.Handlebars = H;
  const prefix = 'systems/veilrunner/templates/relations/';
  const read = name => fs.readFileSync(new URL('../templates/relations/' + name,import.meta.url),'utf8');
  H.registerPartial(prefix+'editor-field.hbs',H.compile(read('editor-field.hbs')));
  foundry.applications = { handlebars: { renderTemplate: async (_path,data) => H.compile(read('editor.hbs'))(data) }, api: { DialogV2: { wait: async config => config.content } } };
  const { editRelationRecord } = await import('../modules/relations/editor.mjs');
  for (const table of ['entities','relations','maps','events','configuration']) {
    const html = await editRelationRecord(table);
    assert.match(html,/vr-rel-editor/);
    assert.doesNotMatch(html,/undefined|\[object Object\]/);
  }
  const html = await editRelationRecord('maps',{ width: 1200, height: 800, pins: [{entityId:'npc',x:40,y:80}] });
  assert.match(html,/value="1200"/);
  assert.match(html,/value="40"/);
});
test('linked dossier navigation preserves perspective and opens the hero Relations subtab', async () => {
  game.user = gm; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  const { bindRelations } = await import('../modules/relations/view.mjs');
  const listeners = {};
  const root = { addEventListener: (name,fn) => { listeners[name] = fn; }, querySelector: () => null };
  const options = { tab:'events', characterUuid:'Actor.hero', partyId:'party', perspective:'character' };
  const navigations = [];
  bindRelations(root,options,navigate => navigations.push(navigate));
  const click = async dataset => {
    const button = { dataset };
    await listeners.click({ target: { closest: selector => selector === '[data-rel-action]' ? button : null }, preventDefault() {}, stopPropagation() {} });
  };
  await click({ relAction:'linked-target', id:'npc' });
  assert.equal(options.tab,'character');
  assert.equal(options.targetId,'npc');
  assert.equal(options.partyId,'party');
  assert.deepEqual(navigations,[true]);
  let rendered;
  actors[0].sheet = { section:'actions',subTabs:{character:'stats'},render: options => { rendered=options; } };
  await click({relAction:'hero'});
  assert.equal(actors[0].sheet.section,'character');
  assert.equal(actors[0].sheet.subTabs.character,'relations');
  assert.equal(actors[0].sheet.relationsOptions.targetId,'npc');
  assert.equal(rendered.force,true);
});
test('rapid adjustments serialize as complete audited operations', async () => {
  game.user = gm; await vault.initializeRelationsIdentity(); await service.reloadRelationsAccess();
  await service.setStanding('Actor.hero','npc',null);
  await service.adjustStanding('Actor.hero','npc',0,{toggleAcquaintance:true});
  assert.equal(service.readRelations().relations[0].value,null);
  await Promise.all([service.adjustStanding('Actor.hero','npc',1),service.adjustStanding('Actor.hero','npc',1),service.adjustStanding('Actor.hero','npc',-1)]);
  const state = service.readRelations();
  assert.equal(state.relations[0].value,1);
  assert(state.events.every(e => e.status === 'applied'));
  assert.deepEqual(state.events.slice(-3).map(e => e.changes[0].after),[1,2,1]);
});
