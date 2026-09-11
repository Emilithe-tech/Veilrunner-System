import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';
import { planCharacterLibrary, CHARACTER_LIBRARY_FOLDERS } from '../modules/migrations/character-library-plan.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const backup = path.resolve(process.argv[2]);
const apply = process.argv.includes('--apply');
const hash = value => createHash('sha256').update(value).digest('hex');
async function tree(dir) {
  const result = {};
  for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    if (entry.isDirectory()) for (const [key,value] of Object.entries(await tree(path.join(dir,entry.name)))) result[`${entry.name}/${key}`]=value;
    else result[entry.name]=hash(await fs.readFile(path.join(dir,entry.name)));
  }
  return result;
}
const manifestText = await fs.readFile(path.join(backup,'system.json'),'utf8');
assert.equal(await fs.readFile(path.join(root,'system.json'),'utf8'),manifestText,'Manifest changed since backup');
for (const [name] of CHARACTER_LIBRARY_FOLDERS) assert.deepEqual(await tree(path.join(root,'packs',name)),await tree(path.join(backup,'original',name)),`${name} changed since backup`);
const sources=JSON.parse(await fs.readFile(path.join(backup,'rows.json'),'utf8'));
const plan=planCharacterLibrary(JSON.parse(manifestText),sources);
const stage=path.join(backup,'staged-character-library');
await fs.mkdir(stage,{recursive:true});
const db=new ClassicLevel(stage,{valueEncoding:'json'});
try {
  const existing=await db.iterator().all();
  if(existing.length) assert.deepEqual(existing,plan.rows,'Staging content changed');
  else await db.batch(plan.rows.map(([key,value])=>({type:'put',key,value})));
}
finally { await db.close(); }
const readback=new ClassicLevel(stage,{valueEncoding:'json',createIfMissing:false});
try { assert.deepEqual(await readback.iterator().all(),plan.rows); }
finally { await readback.close(); }
const receipt={status:'staged',backup,counts:plan.counts,items:Object.values(plan.counts).reduce((a,b)=>a+b,0),folders:plan.rows.filter(([key])=>key.startsWith('!folders!')).length,packsBefore:JSON.parse(manifestText).packs.length,packsAfter:plan.manifest.packs.length,rowsSha256:hash(JSON.stringify(plan.rows)),sourceHashes:{}};
for(const [name] of CHARACTER_LIBRARY_FOLDERS) receipt.sourceHashes[name]=await tree(path.join(root,'packs',name));
await fs.writeFile(path.join(backup,'receipt.json'),JSON.stringify(receipt,null,2));
if(apply){
  const target=path.join(root,'packs','character-library');
  await fs.mkdir(target,{recursive:true});
  assert.deepEqual(await fs.readdir(target),[],'Never overwrite an existing pack');
  for(const entry of await fs.readdir(stage)) await fs.copyFile(path.join(stage,entry),path.join(target,entry),1);
  assert.deepEqual(await tree(target),await tree(stage));
  await fs.writeFile(path.join(root,'system.json'),JSON.stringify(plan.manifest,null,2)+'\n');
  for(const [name] of CHARACTER_LIBRARY_FOLDERS) assert.deepEqual(await tree(path.join(root,'packs',name)),receipt.sourceHashes[name]);
  receipt.status='installed';
  await fs.writeFile(path.join(backup,'receipt.json'),JSON.stringify(receipt,null,2));
}
console.log(JSON.stringify(receipt,null,2));
