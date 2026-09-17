import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
globalThis.crypto ??= webcrypto;
const values = new Map();
globalThis.localStorage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
function user(id) { const flags = {}; return { id, getFlag: (_ns, key) => flags[key], setFlag: async (_ns, key, value) => { flags[key] = value; } }; }
const gm = user('gm'), player = user('player'), other = user('other');
globalThis.game = { world: { id: 'test' }, user: gm };
const { initializeRelationsIdentity, sealRelations, unsealRelations, exportRelationsIdentity, restoreRelationsIdentity } = await import('../modules/relations/vault.mjs');
test('only intended recipients decrypt payloads; keys survive reload and backup restoration', async () => {
  for (const u of [gm, player, other]) { game.user = u; await initializeRelationsIdentity(); }
  game.user = gm; await initializeRelationsIdentity();
  const encrypted = await sealRelations({ secret: 'Hidden faction', value: -4 }, [gm, player]);
  assert.doesNotMatch(JSON.stringify(encrypted), /Hidden faction|secret/);
  assert.equal((await unsealRelations(encrypted)).value, -4);
  game.user = player; await initializeRelationsIdentity();
  const backup = exportRelationsIdentity();
  assert.equal((await unsealRelations(encrypted)).secret, 'Hidden faction');
  game.user = other; await initializeRelationsIdentity();
  assert.equal(await unsealRelations(encrypted), null);
  game.user = player; await restoreRelationsIdentity(backup);
  assert.equal((await unsealRelations(encrypted)).value, -4);
  assert.equal(await unsealRelations({ ...encrypted, payload: encrypted.payload.slice(0, -4) + 'AAAA' }), null);
});
