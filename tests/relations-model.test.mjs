import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, transact, projectLedger, tierFor, validateLedger } from '../modules/relations/model.mjs';
import { mapGrid } from '../modules/relations/map.mjs';
let sequence = 0;
const meta = () => ({ isGM: true, id: () => 'id' + ++sequence, author: 'gm', time: 100 });
const run = (state, command) => transact(state, { revision: state.revision, ...command }, meta());
const put = (state, table, record) => run(state, { type: 'put', table, record });
function fixture() {
  let state = emptyLedger();
  state = put(state, 'entities', { id: 'npc', kind: 'character', name: 'Broker', audience: ['p1'], gmNotes: 'SECRET', actorUuid: 'Actor.hidden' });
  state = put(state, 'entities', { id: 'faction', kind: 'faction', name: 'Guild', ranks: ['Agent'], resources: [{ name: 'Funds', value: 20 }], audience: ['p1'] });
  return put(state, 'relations', { id: 'r', source: 'Actor.hero', targetId: 'npc', value: null, acquainted: false, audience: ['p1'] });
}
test('standings start unrated; directions and parties remain distinct', () => {
  let state = fixture();
  state = put(state, 'relations', { id: 'party', source: 'Actor.party', targetId: 'npc', value: 10, audience: [] });
  state = put(state, 'relations', { id: 'reverse', source: 'npc', targetId: 'faction', value: -4, audience: [] });
  assert.equal(tierFor(state.relations[0].value), 'Unrated');
  assert.equal(state.relations[1].value, 10);
  assert.throws(() => put(state, 'relations', { id: 'duplicate', source: 'Actor.hero', targetId: 'npc', value: 0, audience: [] }), /already exists/);
});
test('GM authorization, revision conflicts and hierarchy cycles fail without mutation', () => {
  const state = fixture(), before = structuredClone(state);
  assert.throws(() => transact(state, { type: 'advance', revision: state.revision, time: 1 }, { ...meta(), isGM: false }), /Only a GM/);
  assert.throws(() => run(state, { type: 'advance', revision: -1, time: 1 }), /changed/);
  assert.throws(() => put(state, 'entities', { ...state.entities[1], parentId: 'faction' }), /cycle/);
  assert.throws(() => run(state, { type: 'remove', table: 'entities', id: 'npc' }), /unavailable/);
  assert.deepEqual(state, before);
});
test('manual tiers support negative thresholds and bounded values', () => {
  let state = fixture();
  state = run(state, { type: 'configure', bounds: { min: -10, max: 10 }, tiers: [{ label: 'Friendly', threshold: 5, color: '#00ff00' }, { label: 'Hostile', threshold: -10, color: '#ff0000' }] });
  assert.equal(tierFor(5, state.tiers), 'Friendly');
  assert.equal(tierFor(-10, state.tiers), 'Hostile');
  assert.throws(() => put(state, 'relations', { ...state.relations[0], value: 11 }), /bounds/);
});
test('event preview is pure, application idempotent, reversal audited and conflict-aware', () => {
  let state = put(fixture(), 'events', { id: 'event', name: 'Favor', reason: 'A favor returned', audience: ['p1'], effects: [{ table: 'relations', id: 'r', field: 'value', value: 7 }] });
  const before = structuredClone(state);
  const preview = run(state, { type: 'applyEvent', id: 'event' });
  assert.deepEqual(state, before);
  assert.equal(preview.relations[0].value, 7);
  assert.equal(run(preview, { type: 'applyEvent', id: 'event', revision: 0 }), preview);
  const reversed = run(preview, { type: 'reverseEvent', id: 'event' });
  assert.equal(reversed.relations[0].value, null);
  assert.equal(reversed.events.at(-1).reverses, 'event');
  assert.equal(run(reversed, { type: 'reverseEvent', id: 'event' }), reversed);
  const changed = put(preview, 'relations', { ...preview.relations[0], value: 9 });
  assert.throws(() => run(changed, { type: 'reverseEvent', id: 'event' }), /values have changed/);
  assert.throws(() => put(preview, 'events', { ...preview.events[0], name: 'Rewrite' }), /immutable/);
});
test('event effects cannot change secrets, identity, audience, or arbitrary paths', () => {
  for (const field of ['audience', 'gmNotes', 'id', '__proto__']) {
    const state = put(fixture(), 'events', { id: 'bad', name: 'Bad', audience: [], effects: [{ table: 'entities', id: 'npc', field, value: [] }] });
    assert.throws(() => run(state, { type: 'applyEvent', id: 'bad' }), /Unsupported/);
  }
});
test('public projections filter dossiers, source perspectives, event history, maps and backlinks', () => {
  let state = fixture();
  state = put(state, 'entities', { id: 'secret', kind: 'faction', name: 'SECRET NAME', audience: [] });
  state = put(state, 'entities', { ...state.entities[0], parentId: '', memberships: [{ factionId: 'secret', rank: '' }], associatedIds: ['secret'] });
  state = put(state, 'maps', { id: 'map', name: 'City', audience: ['p1'], width: 400, height: 300, gridType: 1, gridSize: 50, pins: [{ entityId: 'secret', x: 10, y: 10 }, { entityId: 'npc', x: 20, y: 20 }], territories: [{ factionId: 'secret', color: '#ff0000', points: [[0,0],[20,0],[0,20]] }] });
  state = put(state, 'links', { id: 'link', targetId: 'npc', journalUuid: 'JournalEntry.private', audience: ['p1'] });
  state = put(state, 'events', { id: 'event', name: 'Visible favor', audience: ['p1'], effects: [{ table: 'relations', id: 'r', field: 'value', value: 4 }] });
  state = run(state, { type: 'applyEvent', id: 'event' });
  const projection = projectLedger(state, { userId: 'p1', perspectives: ['Actor.hero'] });
  assert.equal(projection.entities[0].actorUuid, '');
  assert.equal(projection.entities[0].gmNotes, undefined);
  assert.deepEqual(projection.entities[0].memberships, []);
  assert.equal(projection.maps[0].pins.length, 1);
  assert.deepEqual(projection.maps[0].territories, []);
  assert.deepEqual(projection.links, []);
  assert.equal(projection.events.length, 1);
  assert.doesNotMatch(JSON.stringify(projection), /SECRET|secret|Actor.hidden|JournalEntry.private/);
  const stranger = projectLedger(state, { userId: 'p2', perspectives: ['Actor.hero'] });
  assert.deepEqual(stranger.entities, []);
  assert.deepEqual(stranger.events, []);
  const noPerspective = projectLedger(state, { userId: 'p1', perspectives: [] });
  assert.deepEqual(noPerspective.relations, []);
  assert.deepEqual(noPerspective.events, []);
});
test('legacy adoption is explicit, idempotent, and retains labels without Actor guesses', () => {
  const command = { type: 'adopt', actorUuid: 'Actor.hero', entries: [{ kind: 'character', name: 'Existing', label: 'Ally', value: -3 }] };
  const state = run(emptyLedger(), command);
  assert.equal(state.entities[0].legacyLabel, 'Ally');
  assert.equal(state.entities[0].actorUuid, undefined);
  assert.equal(state.relations[0].value, -3);
  assert.equal(run(state, command), state);
});
test('advancing review time never applies a scheduled event', () => {
  let state = put(fixture(), 'events', { id: 'due', name: 'Due', due: 5, audience: [], effects: [{ table: 'relations', id: 'r', field: 'value', value: 10 }] });
  state = run(state, { type: 'advance', time: 100 });
  assert.equal(state.events[0].status, 'draft');
  assert.equal(state.relations[0].value, null);
});
test('all Foundry grid variants produce finite paths and respect gridless mode', () => {
  for (let gridType = 0; gridType <= 5; gridType++) {
    const paths = mapGrid({ gridType, width: 400, height: 300, gridSize: 50 });
    assert.equal(paths.length > 0, gridType !== 0);
    assert.doesNotMatch(paths.join(''), /NaN|Infinity/);
  }
});
