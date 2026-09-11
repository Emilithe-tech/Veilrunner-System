import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const backup=await fs.mkdtemp(path.join(os.tmpdir(),'veilrunner-character-expansion-'));
const text=await fs.readFile(path.join(root,'system.json'),'utf8');
await fs.writeFile(path.join(backup,'system.json'),text);
const manifest=JSON.parse(text), result={};
for(const name of ['character-library','professions','progression','talents-skills','unique-abilities','unique-actions','unique-reactions','unique-traits']) {
  const pack=manifest.packs.find(p=>p.name===name);
  if(!pack || pack.type!=='Item') throw new Error(`Missing pack ${name}`);
  await fs.cp(path.join(root,pack.path),path.join(backup,'original',name),{recursive:true});
  const clone=path.join(backup,'inspection',name);
  await fs.cp(path.join(backup,'original',name),clone,{recursive:true});
  const db=new ClassicLevel(clone,{valueEncoding:'json',createIfMissing:false});
  try {result[name]=await db.iterator().all();} finally {await db.close();}
}
await fs.writeFile(path.join(backup,'rows.json'),JSON.stringify(result,null,2));
const seen=new Map(),collisions=[];
for(const [name,rows] of Object.entries(result)) for(const [key,value] of rows){if(seen.has(key))collisions.push({key,pack:name,prior:seen.get(key),name:value.name});else seen.set(key,name);}
console.log(JSON.stringify({backup,collisions,packs:Object.fromEntries(Object.entries(result).map(([name,rows])=>[name,{rows:rows.length,types:rows.reduce((a,[k,v])=>{const t=k.startsWith('!items!')?v.type:k.split('!')[1];a[t]=(a[t]??0)+1;return a;},{}),folders:rows.filter(([k])=>k.startsWith('!folders!')).map(([,v])=>({id:v._id,name:v.name,folder:v.folder}))}]))},null,2));
