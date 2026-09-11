import test from 'node:test';
import assert from 'node:assert/strict';
import {EQUIPMENT_FOLDERS,equipmentLibraryFolder,planEquipmentLibraryMerge} from '../modules/migrations/equipment-library-plan.mjs';
import {CompendiumRouter} from '../modules/data/definitions/compendium-router.mjs';
import {characterLibraryFolder} from '../modules/data/definitions/character-library-folders.mjs';
const names=['equipment','weapons','armor','ammunition','backgrounds','character-library'];
const manifest={id:'Veilrunner',packs:names.map(name=>({name,path:`packs/${name}`,type:'Item'}))};
test('canonical consumers route to the consolidated libraries',()=>{
  const router=new CompendiumRouter({packs:manifest.packs.filter(p=>['equipment','character-library'].includes(p.name))});
  for(const type of ['weapon','armor','shield','ammunition','magazine','equipment'])assert.equal(router.route(type,{strict:true}).collection,'Veilrunner.equipment');
  assert.equal(router.route('background',{strict:true}).collection,'Veilrunner.character-library');
  assert.equal(characterLibraryFolder({type:'background'}),'vrCharBackground');
});
function fixture(){return Object.fromEntries(names.map(name=>[name,[]]));}
test('merges records preserving mechanics and identity into requested folders',()=>{
  const sources=fixture();
  const weapon={_id:'1234567890123456',type:'weapon',system:{weaponType:'pistol',definitionId:'veilrunner.weapon.test',damage:{base:'1d6'}}};
  sources.weapons.push([`!items!${weapon._id}`,weapon]);
  sources.backgrounds.push(['!items!abcdefghijklmnop',{_id:'abcdefghijklmnop',type:'background',system:{description:'Keep'}}]);
  const before=structuredClone(sources),plan=planEquipmentLibraryMerge(manifest,sources);
  assert.deepEqual(sources,before);
  const moved=new Map(plan.rows.equipment).get(`!items!${weapon._id}`);
  assert.deepEqual(moved,{...weapon,folder:equipmentLibraryFolder(weapon)});
  assert.equal(new Map(plan.rows['character-library']).get('!items!abcdefghijklmnop').folder,'vrCharBackground');
  assert.deepEqual(plan.manifest.packs.map(p=>p.name),['equipment','character-library']);
  assert.equal(new Set(EQUIPMENT_FOLDERS.map(f=>f._id)).size,EQUIPMENT_FOLDERS.length);
  assert.ok(EQUIPMENT_FOLDERS.every(f=>/^[a-zA-Z0-9]{16}$/.test(f._id)));
  assert.deepEqual(EQUIPMENT_FOLDERS.filter(f=>f.path.startsWith('Armor/')).map(f=>f.name),['Energy Shields']);
});
test('rejects collisions instead of overwriting destination records',()=>{
  const sources=fixture(),row=['!items!1234567890123456',{_id:'1234567890123456',type:'weapon',system:{weaponType:'pistol'}}];
  sources.weapons.push(row);sources.equipment.push(row);
  assert.throws(()=>planEquipmentLibraryMerge(manifest,sources),/Duplicate key/);
});
test('all requested weapon and ammunition subtypes resolve correctly',()=>{
  for(const folder of EQUIPMENT_FOLDERS.filter(f=>f.path.startsWith('Weapons/')&&f.path.split('/').length===3))assert.equal(equipmentLibraryFolder({type:'weapon',system:{weaponType:folder.name}}),folder._id);
  for(const [type,name]of [['ballistic','Ballistic Ammo'],['energy','Energy Cell'],['thermal','Thermal Clip'],['rocket','Rocket']])assert.equal(EQUIPMENT_FOLDERS.find(f=>f._id===equipmentLibraryFolder({type:'ammunition',system:{ammoType:type}})).name,name);
});
