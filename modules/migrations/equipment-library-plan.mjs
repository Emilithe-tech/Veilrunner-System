const tree = {
  Weapons: {
    Arcane: ['Grimoire','Scepter','Wand'], Blades: ['Short Blade','Long Blade','Heavy Blade'],
    Finesse: ['Bow','Coil','Thrown'], Martial: ['Blunt','Polearm','Staff','Unarmed'],
    'Light Firearms': ['Pistol','SMG','Taser'],
    'Medium Firearms': ['Assault Rifle','Marksman Rifle','Shotgun','Sniper Rifle'],
    'Heavy Firearms': ['Launcher','Machine Gun','Projector']
  },
  Armor: ['Energy Shields'],
  Munitions: {Ammunition:['Ballistic Ammo','Energy Cell','Thermal Clip'],Arrow:[],Bolt:[],Canister:[],Grenade:[],Rocket:[],Magazines:[]}
};
const token=value=>String(value??'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export const EQUIPMENT_FOLDERS=[];
function walk(children,parent=null,prefix=''){
  for(const [name,nested] of Array.isArray(children)?children.map(name=>[name,[]]):Object.entries(children)){
    const id=`vrEquip${String(EQUIPMENT_FOLDERS.length+1).padStart(9,'0')}`;
    EQUIPMENT_FOLDERS.push({_id:id,name,type:'Item',folder:parent,sorting:'m',sort:(EQUIPMENT_FOLDERS.length+1)*100000,color:null,flags:{},path:`${prefix}${name}`});
    walk(nested,id,`${prefix}${name}/`);
  }
}
walk(tree);
export function equipmentLibraryFolder(item){
  const find=name=>EQUIPMENT_FOLDERS.find(f=>token(f.name)===token(name))?._id;
  if(item.type==='weapon')return find(item.system?.weaponType)||find('Weapons');
  if(item.type==='armor')return find('Armor');
  if(item.type==='shield')return find('Energy Shields');
  if(item.type==='magazine')return find('Magazines');
  if(item.type==='ammunition'){
    const kind=token(item.system?.ammoType);
    const alias={ballistic:'Ballistic Ammo',energy:'Energy Cell',thermal:'Thermal Clip'};
    return EQUIPMENT_FOLDERS.find(f=>f.path.startsWith('Munitions/')&&token(f.name)===token(alias[kind]||kind))?._id||find('Ammunition');
  }
  return null;
}
export function planEquipmentLibraryMerge(manifest,sources){
  const names=['equipment','weapons','armor','ammunition','backgrounds','character-library'];
  if(manifest.id!=='Veilrunner')throw Error('Unexpected system');
  for(const name of names){
    const pack=manifest.packs.find(p=>p.name===name);
    if(pack?.path!==`packs/${name}`||pack.type!=='Item'||!Array.isArray(sources[name]))throw Error(`Unexpected source ${name}`);
  }
  const output={equipment:new Map(), 'character-library':new Map()};
  const add=(target,key,value)=>{if(output[target].has(key))throw Error(`Duplicate key ${target}/${key}`);output[target].set(key,structuredClone(value));};
  for(const target of Object.keys(output))for(const [key,value] of sources[target])add(target,key,value);
  for(const {path,...folder} of EQUIPMENT_FOLDERS)add('equipment',`!folders!${folder._id}`,folder);
  const backgroundFolder='vrCharBackground';
  add('character-library',`!folders!${backgroundFolder}`,{_id:backgroundFolder,name:'Backgrounds',type:'Item',folder:null,sorting:'a',sort:1500000,color:null,flags:{}});
  const counts={};
  for(const name of ['weapons','armor','ammunition','backgrounds']){
    const target=name==='backgrounds'?'character-library':'equipment';
    counts[name]=0;
    for(const [key,source] of sources[name]){
      const value=structuredClone(source);
      if(key.startsWith('!items!')){
        counts[name]++;
        if(name==='backgrounds'&&value.type!=='background')throw Error(`Unexpected background type ${value.type}`);
        value.folder=name==='backgrounds'?backgroundFolder:equipmentLibraryFolder(value);
        if(!value.folder)throw Error(`Unclassified item ${key}`);
      }else if(key.startsWith('!folders!')){
        value.folder ||= name==='backgrounds'?backgroundFolder:equipmentLibraryFolder({type:{weapons:'weapon',armor:'armor',ammunition:'ammunition'}[name]});
      }
      add(target,key,value);
    }
  }
  for(const [target,rows] of Object.entries(output)){
    const definitions=new Set();
    for(const [key,value] of rows){
      if(key.startsWith('!items!')&&value.system?.definitionId){
        if(definitions.has(value.system.definitionId))throw Error(`Duplicate definition ${value.system.definitionId}`);
        definitions.add(value.system.definitionId);
      }
      if(!key.startsWith('!items!')&&!key.startsWith('!folders!'))continue;
      const seen=new Set();let parent=value.folder;
      while(parent){if(seen.has(parent)||!rows.has(`!folders!${parent}`))throw Error(`Invalid ancestry ${target}/${key}`);seen.add(parent);parent=rows.get(`!folders!${parent}`).folder;}
    }
  }
  const next=structuredClone(manifest);
  next.packs=next.packs.filter(p=>!['weapons','armor','ammunition','backgrounds'].includes(p.name));
  return {manifest:next,counts,rows:Object.fromEntries(Object.entries(output).map(([name,rows])=>[name,[...rows].sort(([a],[b])=>a<b?-1:a>b?1:0)]))};
}
