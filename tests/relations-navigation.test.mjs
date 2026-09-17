import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRelationsNavigation } from '../modules/relations/navigation.mjs';
const state = { entities: [{ id: 'npc', kind: 'character' }, { id: 'guild', kind: 'faction' }, { id: 'city', kind: 'location' }], maps: [{ id: 'map' }], events: [{ id: 'event' }] };
test('datapad targets select the correct existing category and retain character and party context', () => {
  for (const [targetId,section] of [['npc','characters'],['guild','factions'],['city','places'],['map','maps'],['event','timeline']]) {
    const options = { targetId, characterUuid: 'Actor.hero', partyId: 'party', perspective: 'party' };
    assert.deepEqual(resolveRelationsNavigation(options,state), { ...options, section });
  }
});
test('target aliases resolve without exposing missing records or changing legacy calls', () => {
  assert.equal(resolveRelationsNavigation({mapId:'map'},state).section,'maps');
  assert.equal(resolveRelationsNavigation({eventId:'event'},state).section,'timeline');
  assert.equal(resolveRelationsNavigation({entityId:'guild'},state).section,'factions');
  assert.equal(resolveRelationsNavigation({targetId:'hidden'},state).section,'characters');
  assert.equal(resolveRelationsNavigation({section:'quests'},state).section,'quests');
  assert.equal(resolveRelationsNavigation({},state).section,undefined);
});
