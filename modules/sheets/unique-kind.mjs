export const UNIQUE_KIND_OPTIONS = Object.freeze([
  {value:'ability',label:'Ability',folder:'vrUniqueAbility0'},
  {value:'action',label:'Action',folder:'vrUniqueActions0'},
  {value:'reaction',label:'Reaction',folder:'vrUniqueReaction'},
  {value:'trait',label:'Trait',folder:'vrUniqueTraits00'}
]);

export function uniqueItemKind(item) {
  if(item?.type==='trait')return 'trait';
  if(item?.type==='ability')return 'ability';
  if(item?.type==='action')return item.system?.timing?.type==='reaction'?'reaction':'action';
  return null;
}

/** Preserve identity and mechanics while changing the canonical type and timing. */
export function planUniqueKindChange(item,kind) {
  const currentKind=uniqueItemKind(item);
  if(!currentKind || !UNIQUE_KIND_OPTIONS.some(option=>option.value===kind))throw new Error('Unsupported Unique kind');
  if(currentKind===kind)return null;
  const source=item.toObject?.() ?? item._source ?? item;
  const system={...structuredClone(source.flags?.veilrunner?.uniqueKindSource ?? {}),...structuredClone(source.system ?? {})};
  const type=kind==='reaction'?'action':kind;
  const timing=kind==='ability'?'free':kind==='trait'?'passive':kind;
  const previousCost=system.economy?.[currentKind==='reaction'?'reactions':'actions'];
  const cost=Math.max(1,Math.trunc(Number(previousCost)||1));
  system.timing={...system.timing,type:timing};
  system.economy={actions:kind==='action'?cost:0,reactions:kind==='reaction'?cost:0};
  // Keep legacy editor fields consistent with the canonical execution contract.
  system.actionMode=kind==='trait'?'ability':kind;
  system.activationKind=['ability','trait'].includes(kind)?'ability':'action';
  system.actionType=['ability','trait'].includes(kind)?'free':kind==='reaction'?'reaction':'standard';
  system.actions=system.economy.actions;
  system.selector=kind==='trait'?'ability':kind;
  const update={type,system,'flags.veilrunner.uniqueKindSource':structuredClone(system)};
  if(item.pack==='Veilrunner.character-library') update.folder=UNIQUE_KIND_OPTIONS.find(option=>option.value===kind).folder;
  return update;
}

export async function changeUniqueItemKind(item,kind,{models=globalThis.CONFIG?.Item?.dataModels,replaceSystem=value=>globalThis.foundry.data.operators.ForcedReplacement.create(value)}={}) {
  const update=planUniqueKindChange(item,kind);
  if(!update)return false;
  const Model=models?.[update.type];
  if(!Model)throw new Error(`No Item model for ${update.type}`);
  // Validate the destination model before submitting any write. Retain the full
  // source so switching back does not erase authored fields from another kind.
  new Model(structuredClone(update.system),{parent:item,strict:true});
  if(update.type!==item.type)update.system=replaceSystem(update.system);
  await item.update(update);
  return true;
}
