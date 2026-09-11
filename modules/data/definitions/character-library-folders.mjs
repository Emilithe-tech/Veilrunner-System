const FOLDERS=Object.freeze({
  background:'vrCharBackground',archetype:'vrCharArchetypes',species:'vrCharSpecies000',origin:'vrCharOrigins000',
  discipline:'vrCharDiscipline',quality:'vrCharQualities0',language:'vrCharLanguages0',
  profession:'vrCharProfession',practice:'vrCharProgress00',progression:'vrCharProgress00',
  talent:'vrCharTalentSkil',skill:'vrCharTalentSkil',ability:'vrUniqueAbility0',spell:'vrUniqueAbility0',
  action:'vrUniqueActions0',trait:'vrUniqueTraits00'
});
export function characterLibraryFolder(item){
  return item?.type==='action' && item.system?.timing?.type==='reaction'?'vrUniqueReaction':FOLDERS[item?.type] ?? null;
}
