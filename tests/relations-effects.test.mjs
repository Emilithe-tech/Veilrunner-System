import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeEffects, effectRows, describeEffectValue } from '../modules/relations/effects.mjs';
test('multiple resource edits combine without losing untouched values and round-trip through the editor', () => {
  const state = { entities: [{ id: 'f', resources: [{ name: 'Funds', value: 10 }, { name: 'Influence', value: 2 }, { name: 'Reserve', value: 1 }] }] };
  const rows = ['Funds', 'Influence'].map((item,i) => ({ table: 'entities', id: 'f', field: 'resources', item, value: String(20+i) }));
  const effects = materializeEffects(rows,state);
  assert.equal(effects.length,1);
  assert.deepEqual(effects[0].value.map(r => r.value),[20,21,1]);
  assert.deepEqual(materializeEffects(effectRows(effects),state),effects);
  assert.equal(state.entities[0].resources[0].value,10);
});
test('event rows retain unrated and explicit boolean values and reject ambiguous changes', () => {
  const rows = [{ table: 'relations', id: 'r', field: 'value', value: '' }, { table: 'relations', id: 'r', field: 'acquainted', value: 'false' }];
  assert.deepEqual(materializeEffects(rows,{entities:[]}).map(r => r.value),[null,false]);
  assert.throws(() => materializeEffects([{ ...rows[1],value:'yes' }],{entities:[]}), /true or false/);
  assert.throws(() => materializeEffects([rows[0],rows[0]],{entities:[]}), /only once/);
  assert.equal(describeEffectValue([{name:'Funds',value:3}],'resources'),'Funds: 3');
});
