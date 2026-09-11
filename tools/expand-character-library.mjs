import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';
import { planCharacterLibraryExpansion,CHARACTER_EXPANSION_SOURCES } from '../modules/migrations/character-library-expansion.mjs';
import { ProgressionCatalogProvider } from '../modules/data/progression/catalog-provider.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),backup=path.resolve(process.argv[2]);
const apply=process.argv.includes('--apply');
const hash=value=>createHash('sha256').update(value).digest('hex');
async function hashes(dir){
  const result={};
  for(const e of await fs.readdir(dir,{withFileTypes:true})){
    if(e.isDirectory())for(const [k,v]of Object.entries(await hashes(path.join(dir,e.name))))result[`${e.name}/${k}`]=v;
    else result[e.name]=hash(await fs.readFile(path.join(dir,e.name)));
  }
  return result;
}
const manifestText=await fs.readFile(path.join(backup,'system.json'),'utf8'),manifest=JSON.parse(manifestText);
assert.equal(await fs.readFile(path.join(root,'system.json'),'utf8'),manifestText,'Manifest drift');
const names=['character-library',...CHARACTER_EXPANSION_SOURCES.map(([name])=>name)];
for(const name of names)assert.deepEqual(await hashes(path.join(root,manifest.packs.find(p=>p.name===name).path)),await hashes(path.join(backup,'original',name)),`Source drift: ${name}`);
const sources=JSON.parse(await fs.readFile(path.join(backup,'rows.json'),'utf8'));
const plan=planCharacterLibraryExpansion(manifest,sources);
// Exercise the real progression reader against the complete mixed pack.
const collection='Veilrunner.character-library';
const documents=plan.rows.filter(([k])=>k.startsWith('!items!')).map(([,source])=>({...source,id:source._id,documentName:'Item',uuid:`Compendium.${collection}.Item.${source._id}`,toObject:()=>structuredClone(source)}));
const pack={collection,documentName:'Item',locked:true,visible:true,metadata:{name:'character-library',packageName:'Veilrunner'},getDocuments:async()=>documents,getIndex:async()=>documents,getDocument:async id=>documents.find(d=>d._id===id)};
const provider=new ProgressionCatalogProvider({game:{system:{id:'Veilrunner'},packs:[pack]}});
await provider.load();
const staged=path.join(backup,'merged');
await fs.mkdir(staged,{recursive:true});
const trial=new ClassicLevel(staged,{valueEncoding:'json'});
try{
  const existing=await trial.iterator().all();
  if(existing.length)assert.deepEqual(existing,plan.rows);
  else await trial.batch(plan.rows.map(([key,value])=>({type:'put',key,value})));
  assert.deepEqual(await trial.iterator().all(),plan.rows);
  // Demonstrate rollback on the disposable database, then restore the candidate.
  const originalKeys=new Set(sources['character-library'].map(([key])=>key));
  const added=plan.rows.filter(([key])=>!originalKeys.has(key));
  await trial.batch(added.map(([key])=>({type:'del',key})));
  assert.deepEqual(await trial.iterator().all(),sources['character-library']);
  await trial.batch(added.map(([key,value])=>({type:'put',key,value})));
  assert.deepEqual(await trial.iterator().all(),plan.rows);
}finally{await trial.close();}
const receipt={status:'prepared',backup,counts:plan.counts,items:documents.length,folders:plan.rows.filter(([k])=>k.startsWith('!folders!')).length,packsBefore:manifest.packs.length,packsAfter:plan.manifest.packs.length,progressionCatalog:'passed',rollbackTrial:'passed',rowsSha256:hash(JSON.stringify(plan.rows))};
await fs.writeFile(path.join(backup,'expansion-receipt.json'),JSON.stringify(receipt,null,2));
if(apply){
  const target=path.join(root,'packs','character-library');
  assert.deepEqual(await hashes(target),await hashes(path.join(backup,'original','character-library')));
  const db=new ClassicLevel(target,{valueEncoding:'json',createIfMissing:false});
  const originalKeys=new Set(sources['character-library'].map(([key])=>key));
  const added=plan.rows.filter(([key])=>!originalKeys.has(key));
  try{
    assert.deepEqual(await db.iterator().all(),sources['character-library']);
    receipt.status='applying';
    await fs.writeFile(path.join(backup,'expansion-receipt.json'),JSON.stringify(receipt,null,2));
    await db.batch(added.map(([key,value])=>({type:'put',key,value})));
    assert.deepEqual(await db.iterator().all(),plan.rows);
    await fs.writeFile(path.join(root,'system.json'),JSON.stringify(plan.manifest,null,2)+'\n');
    receipt.status='installed';
  }catch(error){
    if(receipt.status==='applying'){
      await db.batch(added.map(([key])=>({type:'del',key})));
      assert.deepEqual(await db.iterator().all(),sources['character-library']);
      await fs.writeFile(path.join(root,'system.json'),manifestText);
      receipt.status='rolled-back';
    }
    throw error;
  }finally{await db.close();await fs.writeFile(path.join(backup,'expansion-receipt.json'),JSON.stringify(receipt,null,2));}
  for(const [name] of CHARACTER_EXPANSION_SOURCES)assert.deepEqual(await hashes(path.join(root,manifest.packs.find(p=>p.name===name).path)),await hashes(path.join(backup,'original',name)),`Source changed: ${name}`);
}
console.log(JSON.stringify(receipt,null,2));
