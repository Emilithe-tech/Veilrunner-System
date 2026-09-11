import test from 'node:test';
import assert from 'node:assert/strict';
import { planCharacterLibrary, CHARACTER_LIBRARY_FOLDERS } from '../modules/migrations/character-library-plan.mjs';
import { CompendiumRouter } from '../modules/data/definitions/compendium-router.mjs';
import fs from 'node:fs';
import { CanonicalDefinitionReader } from '../modules/data/definitions/canonical-reader.mjs';

const fixture = () => ({
  manifest:{id:'Veilrunner',packs:CHARACTER_LIBRARY_FOLDERS.map(([name])=>({name,path:`packs/${name}`,type:'Item'}))},
  sources:Object.fromEntries(CHARACTER_LIBRARY_FOLDERS.map(([name])=>[name,[]]))
});
test('every generated folder uses a unique 16-character alphanumeric Foundry ID',()=>{
  const {manifest,sources}=fixture();
  const folders=planCharacterLibrary(manifest,sources).rows.map(([,value])=>value);
  assert.equal(new Set(folders.map(folder=>folder._id)).size,6);
  for(const folder of folders) assert.match(folder._id,/^[a-zA-Z0-9]{16}$/);
});
test('preserves Items, embedded records and nested species folders while reducing six packs to one',()=>{
  const {manifest,sources}=fixture();
  sources.species=[['!folders!nested',{_id:'nested',name:'Mammalian',folder:null}],['!items!hero',{_id:'hero',type:'species',folder:'nested',system:{definitionId:'unchanged'},effects:['effect']}],['!items.effects!hero.effect',{_id:'effect',name:'effect',changes:[{value:2}]}]];
  const original=structuredClone(sources);
  const plan=planCharacterLibrary(manifest,sources);
  const rows=new Map(plan.rows);
  assert.equal(plan.manifest.packs.length,1);
  assert.equal(rows.get('!folders!nested').folder,CHARACTER_LIBRARY_FOLDERS[1][2]);
  assert.deepEqual(rows.get('!items!hero'),sources.species[1][1]);
  assert.deepEqual(rows.get('!items.effects!hero.effect'),sources.species[2][1]);
  assert.equal(plan.counts.Species,1);
  assert.equal(plan.counts.Languages,0);
  assert.equal(plan.rows.filter(([key])=>key.startsWith('!folders!')).length,7);
  assert.deepEqual(sources,original);
});
test('refuses colliding identities instead of overwriting data',()=>{
  const {manifest,sources}=fixture();
  sources.species=[['!items!same',{_id:'same'}]];
  sources.origins=[['!items!same',{_id:'same'}]];
  assert.throws(()=>planCharacterLibrary(manifest,sources),/Duplicate database key/);
});
test('refuses missing sources and broken folder references',()=>{
  const {manifest,sources}=fixture();
  delete sources.languages;
  assert.throws(()=>planCharacterLibrary(manifest,sources),/source/);
  sources.languages=[['!items!a',{_id:'a',folder:'missing'}]];
  assert.throws(()=>planCharacterLibrary(manifest,sources),/Missing parent folder/);
});
test('installed manifest routes the six character types into one pack and preserves other routes',()=>{
  const manifest=JSON.parse(fs.readFileSync(new URL('../system.json',import.meta.url)));
  const router=new CompendiumRouter({packs:manifest.packs});
  for(const type of ['archetype','species','origin','discipline','quality','language']) assert.equal(router.route(type,{strict:true}).collection,'Veilrunner.character-library');
  assert.equal(router.route('profession',{strict:true}).collection,'Veilrunner.character-library');
  assert.equal(router.route('background',{strict:true}).collection,'Veilrunner.backgrounds');
  for(const [name] of CHARACTER_LIBRARY_FOLDERS) assert.equal(manifest.packs.some(pack=>pack.name===name),false);
});
test('canonical readers isolate each character type within the shared pack',async()=>{
  const types=['archetype','species','origin','discipline','quality','language'];
  const collection='Veilrunner.character-library';
  const documents=types.map((type,index)=>({
    _id:String(index).padStart(16,'0'),type,name:type,documentName:'Item',
    uuid:`Compendium.${collection}.Item.${String(index).padStart(16,'0')}`,
    system:{definitionId:`veilrunner.${type}.fixture`}
  }));
  const pack={collection,documentName:'Item',metadata:{name:'character-library',packageName:'Veilrunner'},
    getIndex:async()=>documents,getDocument:async id=>documents.find(d=>d._id===id)};
  const game={system:{id:'Veilrunner'},packs:[pack]};
  for(const type of types){
    const reader=new CanonicalDefinitionReader([type],{game,capability:'chargenSelectable'});
    assert.deepEqual((await reader.documents()).map(d=>d.type),[type]);
  }
  const combined=new CanonicalDefinitionReader(types,{game});
  assert.equal(combined.packs.length,1);
  assert.equal((await combined.documents()).length,6);
});
