import test from 'node:test';
import assert from 'node:assert/strict';
import { planCharacterLibraryExpansion,CHARACTER_EXPANSION_SOURCES } from '../modules/migrations/character-library-expansion.mjs';
const fixture=()=>({manifest:{id:'Veilrunner',packs:[{name:'character-library',path:'packs/character-library',type:'Item'},...CHARACTER_EXPANSION_SOURCES.map(([name,path])=>({name,path,type:'Item'}))]},sources:Object.fromEntries(['character-library',...CHARACTER_EXPANSION_SOURCES.map(([name])=>name)].map(name=>[name,[]]))});
test('merges seven packs into Character Library with valid folder identities',()=>{
  const {manifest,sources}=fixture();
  sources['character-library']=[['!items!0000000000000001',{_id:'0000000000000001',type:'quality',system:{definitionId:'veilrunner.quality.example'}}]];
  sources['unique-abilities']=[['!items!0000000000000002',{_id:'0000000000000002',type:'spell',system:{definitionId:'veilrunner.ability.spell.example'}}]];
  sources['unique-reactions']=[['!items!0000000000000003',{_id:'0000000000000003',type:'action',system:{timing:{type:'reaction'},economy:{reactions:2}}}]];
  const before=structuredClone(sources),plan=planCharacterLibraryExpansion(manifest,sources),rows=new Map(plan.rows);
  assert.equal(plan.manifest.packs.length,1);
  assert.deepEqual(rows.get('!items!0000000000000001'),sources['character-library'][0][1]);
  assert.equal(rows.get('!items!0000000000000002').type,'spell');
  assert.equal(rows.get('!items!0000000000000003').folder,'vrUniqueReaction');
  for(const [key,value]of plan.rows)if(key.startsWith('!folders!'))assert.match(value._id,/^[a-zA-Z0-9]{16}$/);
  assert.deepEqual(sources,before);
});
test('refuses collisions and missing input before writing',()=>{
  const {manifest,sources}=fixture();
  const row=['!items!0000000000000001',{_id:'0000000000000001'}];
  sources['unique-actions']=[row];sources['unique-traits']=[row];
  assert.throws(()=>planCharacterLibraryExpansion(manifest,sources),/Duplicate/);
  sources['unique-traits']=[];delete sources.professions;
  assert.throws(()=>planCharacterLibraryExpansion(manifest,sources),/source/);
});
