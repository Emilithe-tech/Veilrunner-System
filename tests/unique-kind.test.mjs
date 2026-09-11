import test from 'node:test';
import assert from 'node:assert/strict';
import { planUniqueKindChange, uniqueItemKind, changeUniqueItemKind } from '../modules/sheets/unique-kind.mjs';
import { assertDefinitionIdentityUpdate } from '../modules/data/definitions/identity-update.mjs';
const item=()=>({type:'action',pack:'Veilrunner.character-library',system:{definitionId:'veilrunner.ability.action.example',timing:{type:'action',trigger:'after movement'},economy:{actions:3,reactions:0},mechanics:'Keep this',progression:{maxLevel:4},rules:[{id:'rule'}]}});
test('Unique selector changes AP to RP without changing definition identity or mechanics',()=>{
  const source=item(),before=structuredClone(source),update=planUniqueKindChange(source,'reaction');
  assert.equal(update.type,'action');assert.equal(update.system.timing.type,'reaction');
  assert.deepEqual(update.system.economy,{actions:0,reactions:3});
  assert.equal(update.system.definitionId,source.system.definitionId);
  assert.equal(update.system.mechanics,'Keep this');
  assert.deepEqual(update.system.rules,source.system.rules);
  assert.equal(update.folder,'vrUniqueReaction');
  assert.deepEqual(source,before);
});
test('Ability is free and Trait is passive with zero AP and RP',()=>{
  for(const [kind,timing] of [['ability','free'],['trait','passive']]){
    const update=planUniqueKindChange(item(),kind);
    assert.equal(update.type,kind);assert.equal(update.system.timing.type,timing);
    assert.deepEqual(update.system.economy,{actions:0,reactions:0});
    assert.equal(uniqueItemKind(update),kind);
  }
});
test('leaves spells alone and rejects unsupported kind changes',()=>{
  assert.equal(uniqueItemKind({type:'spell'}),null);
  assert.throws(()=>planUniqueKindChange({type:'spell'},'action'),/Unsupported/);
  assert.throws(()=>planUniqueKindChange(item(),'weapon'),/Unsupported/);
  assert.equal(planUniqueKindChange(item(),'action'),null);
});
test('type changes validate the new model and use replacement while retaining identity',async()=>{
  const source=item();let saved,validated;
  source.update=async update=>{saved=update;};
  class Model{constructor(system){validated=system;}}
  await changeUniqueItemKind(source,'trait',{models:{trait:Model},replaceSystem:system=>({replacement:system})});
  assert.equal(validated.definitionId,source.system.definitionId);
  assert.equal(saved.system.replacement.definitionId,source.system.definitionId);
  assert.equal(saved.type,'trait');
});
test('invalid destination models refuse writes',async()=>{
  let writes=0;const source=item();source.update=async()=>writes++;
  class Invalid{constructor(){throw new Error('Invalid model');}}
  await assert.rejects(changeUniqueItemKind(source,'trait',{models:{trait:Invalid}}),/Invalid model/);
  assert.equal(writes,0);
});
test('identity protection unwraps Foundry replacement operators',()=>{
  const previous=globalThis.foundry;
  globalThis.foundry={data:{operators:{DataFieldOperator:{get:value=>value?.replacement ?? value}}}};
  try{
    assert.doesNotThrow(()=>assertDefinitionIdentityUpdate(item(),{system:{replacement:{definitionId:item().system.definitionId}}}));
    assert.throws(()=>assertDefinitionIdentityUpdate(item(),{system:{replacement:{definitionId:'changed'}}}),/identity/);
  }finally{globalThis.foundry=previous;}
});
