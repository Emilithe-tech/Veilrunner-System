export const CHARACTER_EXPANSION_SOURCES = Object.freeze([
  ['professions','packs/path-professions','Professions','vrCharProfession',null],
  ['progression','packs/progression','Progression','vrCharProgress00',null],
  ['talents-skills','packs/talents-skills','Talents & Skills','vrCharTalentSkil',null],
  ['unique-abilities','packs/unique-abilities','Abilities','vrUniqueAbility0','vrCharUnique0000'],
  ['unique-actions','packs/unique-actions','Actions','vrUniqueActions0','vrCharUnique0000'],
  ['unique-reactions','packs/unique-reactions','Reactions','vrUniqueReaction','vrCharUnique0000'],
  ['unique-traits','packs/unique-traits','Traits','vrUniqueTraits00','vrCharUnique0000']
]);
const clone=value=>structuredClone(value);
const validId=id=>/^[a-zA-Z0-9]{16}$/.test(id);

export function planCharacterLibraryExpansion(manifest,sources) {
  if(manifest.id!=='Veilrunner' || manifest.packs.find(p=>p.name==='character-library')?.path!=='packs/character-library') throw new Error('Unexpected Character Library manifest');
  if(!Array.isArray(sources['character-library'])) throw new Error('Missing Character Library rows');
  const output=new Map();
  const add=(key,value)=>{if(output.has(key))throw new Error(`Duplicate database key: ${key}`);output.set(key,clone(value));};
  for(const [key,value] of sources['character-library'])add(key,value);
  const folder=(id,name,parent,sort)=>{
    if(!validId(id))throw new Error(`Invalid folder ID: ${id}`);
    add(`!folders!${id}`,{_id:id,name,type:'Item',folder:parent,sorting:'a',sort,color:null,flags:{}});
  };
  folder('vrCharUnique0000','Unique',null,1000000);
  const counts={};
  for(const [index,[name,path,label,id,parent]] of CHARACTER_EXPANSION_SOURCES.entries()) {
    const pack=manifest.packs.find(p=>p.name===name);
    if(pack?.path!==path || pack.type!=='Item' || !Array.isArray(sources[name])) throw new Error(`Unexpected source: ${name}`);
    folder(id,label,parent,(index+7)*100000);
    const sourceFolders=new Set(sources[name].filter(([k])=>k.startsWith('!folders!')).map(([,v])=>v._id));
    counts[name]=0;
    for(const [key,source] of sources[name]) {
      const value=clone(source);
      if(key.startsWith('!items!')||key.startsWith('!folders!')) {
        if(value.folder && !sourceFolders.has(value.folder)) throw new Error(`Missing source folder for ${key}`);
        value.folder ||= id;
      }
      if(key.startsWith('!items!'))counts[name]++;
      add(key,value);
    }
  }
  const folders=new Map([...output].filter(([key])=>key.startsWith('!folders!')).map(([,v])=>[v._id,v]));
  for(const [key,value] of output) {
    if(!key.startsWith('!items!')&&!key.startsWith('!folders!'))continue;
    if(!validId(value._id))throw new Error(`Invalid document ID: ${key}`);
    const visited=new Set([value._id]);
    let parent=value.folder;
    while(parent){if(visited.has(parent)||!folders.has(parent))throw new Error(`Invalid folder ancestry: ${key}`);visited.add(parent);parent=folders.get(parent).folder;}
  }
  const next=clone(manifest), removed=new Set(CHARACTER_EXPANSION_SOURCES.map(([name])=>name));
  next.packs=next.packs.filter(p=>!removed.has(p.name));
  return {manifest:next,rows:[...output].sort(([a],[b])=>a<b?-1:a>b?1:0),counts};
}
