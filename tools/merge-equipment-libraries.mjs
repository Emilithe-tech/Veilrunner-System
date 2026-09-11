import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {ClassicLevel} from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';
import {planEquipmentLibraryMerge} from '../modules/migrations/equipment-library-plan.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
assert.ok(process.argv[2],'Inspection archive required');
const backup=path.resolve(process.argv[2]),apply=process.argv.includes('--apply');
if(apply){
  assert.ok(process.argv.includes('--foundry-closed'),'Explicit user confirmation of Foundry closure required');
  const processes=execFileSync('powershell.exe',['-NoProfile','-Command',"Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -match 'Foundry|Electron' } | Select-Object -ExpandProperty Id"],{encoding:'utf8'}).trim();
  assert.equal(processes,'','Foundry/Electron is running');
}
const digest=value=>createHash('sha256').update(value).digest('hex');
async function hashes(dir){
  const result={};
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    if(entry.isDirectory())for(const [key,value]of Object.entries(await hashes(path.join(dir,entry.name))))result[`${entry.name}/${key}`]=value;
    else result[entry.name]=digest(await fs.readFile(path.join(dir,entry.name)));
  }
  return result;
}
const manifestText=await fs.readFile(path.join(backup,'system.json'),'utf8');
const sources=JSON.parse(await fs.readFile(path.join(backup,'rows.json'),'utf8'));
const plan=planEquipmentLibraryMerge(JSON.parse(manifestText),sources);
async function preflight(){
  assert.equal(await fs.readFile(path.join(root,'system.json'),'utf8'),manifestText,'Manifest drift');
  for(const name of Object.keys(sources))assert.deepEqual(await hashes(path.join(root,'packs',name)),await hashes(path.join(backup,'original',name)),`Pack drift ${name}`);
}
await preflight();
const routerPath='modules/data/definitions/compendium-router.mjs',folderPath='modules/data/definitions/character-library-folders.mjs';
const originals={'system.json':manifestText};
for(const relative of [routerPath,folderPath])originals[relative]=await fs.readFile(path.join(root,relative),'utf8');
let router=originals[routerPath];
for(const name of ['weapons','armor','ammunition'])router=router.replaceAll(`packNames: Object.freeze(["${name}"])`,'packNames: Object.freeze(["equipment"])');
router=router.replaceAll('packNames: Object.freeze(["backgrounds"])','packNames: Object.freeze(["character-library"])');
const candidates={'system.json':JSON.stringify(plan.manifest,null,2)+'\n',[routerPath]:router,[folderPath]:originals[folderPath].replace("archetype:'vrCharArchetypes',","background:'vrCharBackground',archetype:'vrCharArchetypes',")};
for(const [relative,text]of Object.entries(candidates)){
  await fs.mkdir(path.dirname(path.join(backup,'candidate',relative)),{recursive:true});
  await fs.writeFile(path.join(backup,'candidate',relative),text);
}
await fs.writeFile(path.join(backup,'source-originals.json'),JSON.stringify(originals));
for(const [name,rows]of Object.entries(plan.rows)){
  const trialPath=path.join(backup,'trial',name);
  await fs.mkdir(trialPath,{recursive:true});
  const db=new ClassicLevel(trialPath,{valueEncoding:'json'});
  const replace=async data=>{const keys=await db.keys().all();await db.batch([...keys.map(key=>({type:'del',key})),...data.map(([key,value])=>({type:'put',key,value}))]);};
  try{
    await replace(rows);assert.deepEqual(await db.iterator().all(),rows);
    await replace(sources[name]);assert.deepEqual(await db.iterator().all(),sources[name]);
    await replace(rows);assert.deepEqual(await db.iterator().all(),rows);
  }finally{await db.close();}
}
const receipt={status:'prepared',counts:plan.counts,folders:plan.rows.equipment.filter(([k])=>k.startsWith('!folders!')).length,packsAfter:plan.manifest.packs.map(p=>p.name),rollbackTrial:'passed',backup};
const receiptPath=path.join(backup,'merge-receipt.json');
await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));
if(apply){
  await preflight();
  for(const [relative,text]of Object.entries(originals))assert.equal(await fs.readFile(path.join(root,relative),'utf8'),text,`Source drift ${relative}`);
  const opened=[];
  try{
    receipt.status='applying';await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));
    for(const [name,rows]of Object.entries(plan.rows)){
      const db=new ClassicLevel(path.join(root,'packs',name),{valueEncoding:'json',createIfMissing:false});
      opened.push([name,db]);
      assert.deepEqual(await db.iterator().all(),sources[name]);
      await db.batch(rows.map(([key,value])=>({type:'put',key,value})));
      assert.deepEqual(await db.iterator().all(),rows);
    }
    for(const [relative,text]of Object.entries(candidates))await fs.writeFile(path.join(root,relative),text);
    receipt.status='installed';
  }catch(error){
    for(const [name,db]of opened){
      const keys=await db.keys().all();
      await db.batch([...keys.map(key=>({type:'del',key})),...sources[name].map(([key,value])=>({type:'put',key,value}))]);
      assert.deepEqual(await db.iterator().all(),sources[name]);
    }
    for(const [relative,text]of Object.entries(originals))await fs.writeFile(path.join(root,relative),text);
    receipt.status='rolled-back';throw error;
  }finally{
    for(const [,db]of opened)await db.close();
    await fs.writeFile(receiptPath,JSON.stringify(receipt,null,2));
  }
}
console.log(JSON.stringify(receipt,null,2));
