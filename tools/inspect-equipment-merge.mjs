import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const backup=await fs.mkdtemp(path.join(os.tmpdir(),'veilrunner-equipment-merge-'));
const manifest=JSON.parse(await fs.readFile(path.join(root,'system.json'),'utf8'));
await fs.copyFile(path.join(root,'system.json'),path.join(backup,'system.json'));
const rows={};
for(const name of ['equipment','weapons','armor','ammunition','backgrounds','character-library']){
  const pack=manifest.packs.find(p=>p.name===name);
  if(pack?.path!==`packs/${name}`||pack.type!=='Item')throw Error(`Unexpected pack ${name}`);
  await fs.cp(path.join(root,pack.path),path.join(backup,'original',name),{recursive:true});
  await fs.cp(path.join(backup,'original',name),path.join(backup,'inspection',name),{recursive:true});
  const db=new ClassicLevel(path.join(backup,'inspection',name),{valueEncoding:'json',createIfMissing:false});
  try{rows[name]=await db.iterator().all();}finally{await db.close();}
}
await fs.writeFile(path.join(backup,'rows.json'),JSON.stringify(rows));
console.log(JSON.stringify({backup,packs:Object.fromEntries(Object.entries(rows).map(([name,data])=>[name,{rows:data.length,items:data.filter(([k])=>k.startsWith('!items!')).map(([,v])=>({id:v._id,name:v.name,type:v.type,folder:v.folder,weaponType:v.system?.weaponType,ammoType:v.system?.ammoType})),folders:data.filter(([k])=>k.startsWith('!folders!')).map(([,v])=>({id:v._id,name:v.name,folder:v.folder}))}]))},null,2));
