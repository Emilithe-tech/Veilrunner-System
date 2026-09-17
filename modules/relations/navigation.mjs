export const RELATIONS_SECTION = Object.freeze({ character: 'characters', faction: 'factions', location: 'places', maps: 'maps', events: 'timeline', standings: 'characters' });
export const RELATIONS_TAB = Object.freeze({ characters: 'character', factions: 'faction', places: 'location', maps: 'maps', timeline: 'events' });
/** Resolve only records already supplied by the permission-filtered service. */
export function resolveRelationsNavigation(options = {}, state) {
  const result = { ...options };
  result.targetId ??= options.entityId ?? options.mapId ?? options.eventId;
  if (!result.section && result.targetId) {
    const entity = state.entities.find(e => e.id === result.targetId);
    result.section = entity ? RELATIONS_SECTION[entity.kind] : options.mapId || state.maps.some(m => m.id === result.targetId) ? 'maps' : options.eventId || state.events.some(e => e.id === result.targetId) ? 'timeline' : 'characters';
  }
  return result;
}
