const COLLECTION_FIELDS = ['resources', 'clocks', 'memberships'];
/** Adapt human editor rows into complete field replacements for the event ledger. */
export function materializeEffects(rows, state) {
  const result = new Map();
  for (const row of rows) {
    const key = row.table + '/' + row.id + '/' + row.field;
    let value;
    if (COLLECTION_FIELDS.includes(row.field)) {
      const target = state.entities.find(e => e.id === row.id);
      value = result.get(key)?.value ?? structuredClone(target?.[row.field] ?? []);
      const item = value.find(r => (row.field === 'memberships' ? r.factionId : r.name) === row.item);
      if (!item) throw new Error('Choose an existing resource, clock, or membership.');
      if (row.field === 'memberships') item.rank = row.value;
      else item.value = Number(row.value);
    } else {
      if (result.has(key)) throw new Error('An event can change each standing or controller only once.');
      if (row.field === 'acquainted' && !['true', 'false'].includes(row.value)) throw new Error('Acquaintance must be true or false.');
      value = row.field === 'value' ? String(row.value).trim() === '' ? null : Number(row.value) : row.field === 'acquainted' ? row.value === 'true' : row.value;
    }
    result.set(key, { table: row.table, id: row.id, field: row.field, value });
  }
  return Array.from(result.values());
}
export function effectRows(effects) {
  return effects.flatMap(effect => COLLECTION_FIELDS.includes(effect.field)
    ? (effect.value ?? []).map(item => ({ table: effect.table, id: effect.id, field: effect.field, item: effect.field === 'memberships' ? item.factionId : item.name, value: effect.field === 'memberships' ? item.rank : String(item.value) }))
    : [{ ...effect, value: effect.value === null ? '' : String(effect.value) }]);
}
export function describeEffectValue(value, field, nameOf = value => value) {
  if (value === null || value === undefined) return 'Unrated';
  if (field === 'controllerId') return value ? nameOf(value) : 'None';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.map(item => field === 'memberships'
    ? nameOf(item.factionId) + ': ' + (item.rank || 'No rank')
    : item.name + ': ' + item.value + (item.max ? '/' + item.max : '')).join('; ') || 'None';
  return String(value);
}
