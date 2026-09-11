import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClassicLevel } from 'file:///C:/Program%20Files/Foundry%20Virtual%20Tabletop/resources/app/node_modules/classic-level/index.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const backup = await fs.mkdtemp(path.join(os.tmpdir(), 'veilrunner-character-library-'));
const names = ['archetypes', 'species', 'origins', 'disciplines', 'qualities-perks', 'languages'];
await fs.copyFile(path.join(root, 'system.json'), path.join(backup, 'system.json'));
const result = {};
for (const name of names) {
  await fs.cp(path.join(root, 'packs', name), path.join(backup, 'original', name), {recursive:true});
  const clone = path.join(backup, 'inspection', name);
  await fs.cp(path.join(backup, 'original', name), clone, {recursive:true});
  const db = new ClassicLevel(clone, {valueEncoding:'json', createIfMissing:false});
  try { result[name] = await db.iterator().all(); }
  finally { await db.close(); }
}
await fs.writeFile(path.join(backup, 'rows.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({backup, packs:Object.fromEntries(Object.entries(result).map(([name,rows])=>[name,{count:rows.length,keys:rows.slice(0,4).map(([k])=>k),types:rows.reduce((out,[k,v])=>{const type=v.type ?? k.split('!')[1];out[type]=(out[type]??0)+1;return out;},{}),folders:rows.filter(([k])=>k.includes('folders')).map(([k,v])=>({key:k,name:v.name,folder:v.folder}))}]))},null,2));
