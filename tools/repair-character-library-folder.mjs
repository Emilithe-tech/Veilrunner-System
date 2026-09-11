import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const target=path.join(root,'packs','character-library');
const manifest=JSON.parse(await fs.readFile(path.join(root,'system.json'),'utf8'));
assert.equal(manifest.packs.find(p=>p.name==='character-library')?.path,'packs/character-library');
const backup=await fs.mkdtemp(path.join(os.tmpdir(),'veilrunner-folder-repair-'));
async function hashes(dir){
  const out={};
  for(const e of await fs.readdir(dir,{withFileTypes:true})) {
    if(e.isDirectory()) for(const [k,v] of Object.entries(await hashes(path.join(dir,e.name)))) out[`${e.name}/${k}`]=v;
    else out[e.name]=createHash('sha256').update(await fs.readFile(path.join(dir,e.name))).digest('hex');
  }
  return out;
}
const before=await hashes(target);
await fs.cp(target,path.join(backup,'original'),{recursive:true});
assert.deepEqual(await hashes(path.join(backup,'original')),before);
await fs.cp(path.join(backup,'original'),path.join(backup,'trial'),{recursive:true});
const trial=new ClassicLevel(path.join(backup,'trial'),{valueEncoding:'json',createIfMissing:false});
await trial.open();
const original=await trial.iterator().all();
const oldId='vrCharArchetypes0', newId='vrCharArchetypes';
assert(original.some(([key])=>key===`!folders!${oldId}`),'Expected faulty folder absent');
assert(!original.some(([key])=>key===`!folders!${newId}`),'Replacement ID already exists');
const operations=[{type:'del',key:`!folders!${oldId}`}];
const expected=original.map(([key,source])=>{
  const value=structuredClone(source);
  if(key===`!folders!${oldId}`){key=`!folders!${newId}`;value._id=newId;}
  if(value.folder===oldId) value.folder=newId;
  if(key===`!folders!${newId}` || source.folder===oldId) operations.push({type:'put',key,value});
  return [key,value];
}).sort(([a],[b])=>a<b?-1:a>b?1:0);
const folderIds=new Set(expected.filter(([k])=>k.startsWith('!folders!')).map(([,v])=>v._id));
for(const [key,value] of expected) {
  if(key.startsWith('!folders!')||key.startsWith('!items!')) {
    assert.match(value._id,/^[a-zA-Z0-9]{16}$/);
    if(value.folder) assert(folderIds.has(value.folder),`Broken folder reference: ${key}`);
  }
}
try { await trial.batch(operations); assert.deepEqual(await trial.iterator().all(),expected); }
finally { await trial.close(); }
assert.deepEqual(await hashes(target),before,'Installed pack changed during trial');
const live=new ClassicLevel(target,{valueEncoding:'json',createIfMissing:false});
try {
  assert.deepEqual(await live.iterator().all(),original);
  await live.batch(operations);
  assert.deepEqual(await live.iterator().all(),expected);
} finally { await live.close(); }
const receipt={status:'repaired',backup,oldId,newId,changedRecords:operations.length-1,items:expected.filter(([k])=>k.startsWith('!items!')).length,folders:folderIds.size,trialVerified:true,installedReadbackVerified:true};
await fs.writeFile(path.join(backup,'receipt.json'),JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
