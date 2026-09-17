import { readRelations, commitRelations, canManageRelations } from './service.mjs';
import { materializeEffects, effectRows } from './effects.mjs';
const ROOT = 'systems/veilrunner/templates/relations/';
const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const choices = records => records.map(r => ({ value: r.id, label: r.name }));
function definitions(table, record, state) {
  const entities = choices(state.entities), factions = choices(state.entities.filter(e => e.kind === 'faction'));
  const select = (key, label, options) => field(key, label, 'select', { options: [{ value: '', label: 'None' }, ...options] });
  const list = (key, label, fields) => ({ key, label, fields });
  const common = [field('name', 'Name'), field('audience', 'Reveal to', 'audience')];
  if (table === 'entities') return { fields: [...common,
    select('kind', 'Type', ['character', 'faction', 'location'].map(value => ({ value, label: value }))),
    field('img', 'Portrait or emblem path'), field('description', 'Revealed description', 'textarea'), field('gmNotes', 'GM notes', 'textarea'),
    select('actorUuid', 'Linked Actor', Array.from(game.actors).map(a => ({ value: a.uuid, label: a.name }))),
    select('parentId', 'Parent faction or location', choices(state.entities.filter(e => e.id !== record.id && e.kind !== 'character'))),
    select('controllerId', 'Controlling faction (locations)', factions), field('ranks', 'Faction ranks (one per line)', 'lines'),
    field('goal', 'Faction goal'), field('strategy', 'Faction strategy', 'textarea'), field('traits', 'Faction traits (one per line)', 'lines')],
    lists: [list('memberships', 'Memberships', [select('factionId', 'Faction', factions), field('rank', 'Assigned rank')]),
      list('associated', 'Associated entities', [select('entityId', 'Entity', entities)]),
      list('resources', 'Faction resources', [field('name', 'Resource'), field('value', 'Value', 'number')]),
      list('clocks', 'Faction clocks', [field('name', 'Clock'), field('value', 'Filled', 'number'), field('max', 'Segments', 'number')])] };
  if (table === 'relations') return { fields: [
    select('source', 'From character, party, or entity', [...Array.from(game.actors).map(a => ({ value: a.uuid, label: a.name + ' (' + a.type + ')' })), ...entities]),
    select('targetId', 'Toward', entities), field('value', 'Standing (blank means unrated)', 'nullable'), field('acquainted', 'Acquainted', 'checkbox'), field('audience', 'Reveal to', 'audience')], lists: [] };
  if (table === 'maps') return { fields: [...common, field('background', 'Background image path'), field('width', 'Width', 'number'), field('height', 'Height', 'number'),
    select('gridType', 'Grid', ['Gridless', 'Square', 'Hex: odd rows', 'Hex: even rows', 'Hex: odd columns', 'Hex: even columns'].map((label, value) => ({ value, label }))),
    field('gridSize', 'Grid size', 'number'), select('locationId', 'Location (blank means world map)', choices(state.entities.filter(e => e.kind === 'location')))], lists: [
    list('pins', 'Map pins', [select('entityId', 'Entity', entities), field('x', 'X', 'number'), field('y', 'Y', 'number')]),
    list('territories', 'Faction territories', [select('factionId', 'Faction', factions), field('color', 'Color', 'color'), field('points', 'Vertices: one X,Y pair per line', 'points')])] };
  if (table === 'events') return { fields: [...common, field('reason', 'Reason', 'textarea'), field('publicSummary', 'Optional revealed summary (omit secret details)', 'textarea'), field('due', 'Due at world time (seconds; blank for unscheduled)', 'nullable')], lists: [
    list('effects', 'Explicit effects', [select('table', 'Target kind', [{ value: 'relations', label: 'Standing' }, { value: 'entities', label: 'Entity' }]),
      select('id', 'Target', [...entities, ...state.relations.map(r => ({ value: r.id, label: (game.actors.find(a => a.uuid === r.source)?.name ?? state.entities.find(e => e.id === r.source)?.name ?? r.source) + ' → ' + (state.entities.find(e => e.id === r.targetId)?.name ?? 'Unavailable') }))]),
      select('field', 'Change', ['value', 'acquainted', 'controllerId', 'resources', 'clocks', 'memberships'].map(value => ({ value, label: ({value:'Standing value',acquainted:'Acquainted',controllerId:'Controlling faction',resources:'Resource value',clocks:'Clock value',memberships:'Membership rank'})[value] }))),
      select('item', 'Resource, clock, or membership', []),
      field('value', 'New value (blank = unrated; true/false for acquaintance)')])] };
  if (table === 'configuration') return { fields: [field('min', 'Minimum (blank = unbounded)', 'nullable'), field('max', 'Maximum (blank = unbounded)', 'nullable')], lists: [list('tiers', 'Standing tiers', [field('label', 'Label'), field('threshold', 'Threshold', 'number'), field('color', 'Color', 'color')])] };
  return { fields: [], lists: [] };
}
function fieldContext(def, value) {
  return { ...def, name: def.key, value: def.type === 'lines' ? (value ?? []).join('\n') : def.type === 'points' ? (value ?? []).map(p => p.join(',')).join('\n') : value ?? '',
    checked: Boolean(value), options: def.options?.map(o => ({ ...o, selected: String(o.value) === String(value ?? '') })), isSelect: def.type === 'select', isCheckbox: def.type === 'checkbox', isAudience: def.type === 'audience',
    isTextarea: ['textarea', 'lines', 'points'].includes(def.type), inputType: ['number', 'nullable'].includes(def.type) ? 'number' : def.type === 'color' ? 'color' : 'text',
    audience: def.type === 'audience' ? [{ id: 'all', name: 'All players' }, ...Array.from(game.users).filter(u => !u.isGM)].map(u => ({ value: u.id, label: u.name, selected: (value ?? []).includes(u.id) })) : [] };
}
function parseField(def, element) {
  if (def.type === 'audience') return Array.from(element.selectedOptions).map(o => o.value);
  if (def.type === 'checkbox') return element.checked;
  const value = element.value;
  if (['number', 'nullable'].includes(def.type)) return value === '' && def.type === 'nullable' ? null : Number(value);
  if (def.type === 'lines') return value.split('\n').map(v => v.trim()).filter(Boolean);
  if (def.type === 'points') return value.trim() ? value.trim().split('\n').map(line => line.split(',').map(Number)) : [];
  return value;
}
export async function editRelationRecord(table, existing = {}) {
  if (!canManageRelations()) throw new Error('The active Relations GM must make this change.');
  const state = readRelations();
  const record = { audience: [], ...(table === 'entities' ? { kind: 'character' } : {}), ...(table === 'maps' ? { width: 1200, height: 800, gridType: 1, gridSize: 100, pins: [], territories: [] } : {}), ...(table === 'configuration' ? { ...state.bounds, tiers: state.tiers } : {}), ...structuredClone(existing) };
  const defs = definitions(table, record, state);
  if (table === 'events') record.effects = effectRows(record.effects ?? []);
  record.associated = (record.associatedIds ?? []).map(entityId => ({ entityId }));
  const render = data => Handlebars.partials[ROOT + 'editor-field.hbs'](data);
  const rowHTML = (list, item = {}) => '<div class="vr-rel-editor-row" data-list-row>' + list.fields.map(def => render(fieldContext(def.key === 'item' && item.item ? { ...def, options: [{ value: item.item, label: state.entities.find(e => e.id === item.item)?.name ?? item.item }] } : def, item[def.key]))).join('') + '<button type="button" data-remove-row>Remove row</button></div>';
  const content = await foundry.applications.handlebars.renderTemplate(ROOT + 'editor.hbs', {
    fields: defs.fields.map(def => fieldContext(def, record[def.key])),
    lists: defs.lists.map(list => ({ key: list.key, label: list.label, rows: (record[list.key] ?? []).map(item => rowHTML(list, item)).join('') })),
    map: table === 'maps', scenes: Array.from(game.scenes ?? []).map(s => ({ id: s.id, name: s.name }))
  });
  return foundry.applications.api.DialogV2.wait({ window: { title: 'Relations — ' + (existing.id ? 'Edit ' : 'New ') + table }, position: { width: 700 }, content,
    render: (_event, dialog) => {
      const root = dialog.element;
      const refreshEffectRow = row => {
        if (!row.closest('[data-list="effects"]')) return;
        const target = state.entities.find(e => e.id === row.querySelector('[name="id"]').value);
        const fieldName = row.querySelector('[name="field"]').value;
        const item = row.querySelector('[name="item"]'), oldItem = item.value;
        const entries = fieldName === 'memberships' ? (target?.memberships ?? []).map(m => ({ value: m.factionId, label: state.entities.find(e => e.id === m.factionId)?.name ?? 'Unavailable' }))
          : ['resources', 'clocks'].includes(fieldName) ? (target?.[fieldName] ?? []).map(r => ({ value: r.name, label: r.name })) : [];
        item.replaceChildren(...entries.map(entry => { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.label; return option; }));
        if (entries.some(e => e.value === oldItem)) item.value = oldItem;
        item.closest('label').hidden = !entries.length;
        const old = row.querySelector('[name="value"]'), value = old.value;
        const options = fieldName === 'controllerId' ? [{ value: '', label: 'None' }, ...state.entities.filter(e => e.kind === 'faction').map(e => ({ value: e.id, label: e.name }))]
          : fieldName === 'acquainted' ? [{ value: 'true', label: 'Yes' }, { value: 'false', label: 'No' }]
          : fieldName === 'memberships' ? [{ value: '', label: 'No rank' }, ...(state.entities.find(e => e.id === item.value)?.ranks ?? []).map(rank => ({ value: rank, label: rank }))] : null;
        const replacement = document.createElement(options ? 'select' : 'input'); replacement.name = 'value';
        if (options) for (const entry of options) { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.label; replacement.append(option); }
        else { replacement.type = 'number'; replacement.step = 'any'; }
        if (!options || options.some(o => o.value === value)) replacement.value = value;
        old.replaceWith(replacement);
      };
      root.querySelectorAll('[data-add-row]').forEach(button => button.addEventListener('click', () => {
        const list = defs.lists.find(d => d.key === button.dataset.addRow);
        const container = root.querySelector('[data-list="' + list.key + '"]');
        container.insertAdjacentHTML('beforeend', rowHTML(list));
        refreshEffectRow(container.lastElementChild);
      }));
      root.querySelectorAll('[data-list="effects"] [data-list-row]').forEach(refreshEffectRow);
      root.addEventListener('change', event => {
        const row = event.target.closest('[data-list="effects"] [data-list-row]');
        if (row && ['table', 'id', 'field', 'item'].includes(event.target.name)) refreshEffectRow(row);
      });
      root.addEventListener('click', event => { if (event.target.closest('[data-remove-row]')) event.target.closest('[data-list-row]').remove(); });
      root.querySelector('[data-import-scene]')?.addEventListener('click', () => {
        const scene = game.scenes.get(root.querySelector('[data-scene]').value);
        if (!scene) return;
        for (const [key, value] of Object.entries({ background: scene.background.src, width: scene.width, height: scene.height, gridType: scene.grid.type, gridSize: scene.grid.size })) root.querySelector('[name="' + key + '"]').value = value;
      });
    }, buttons: [{ action: 'save', label: 'Save', default: true, callback: async (_event, button, dialog) => {
      const root = dialog.element, updated = { ...record };
      for (const def of defs.fields) updated[def.key] = parseField(def, root.querySelector('[name="' + def.key + '"]'));
      for (const list of defs.lists) updated[list.key] = Array.from(root.querySelectorAll('[data-list="' + list.key + '"] [data-list-row]')).map(row => Object.fromEntries(list.fields.map(def => [def.key, parseField(def, row.querySelector('[name="' + def.key + '"]'))])));
      if (table === 'entities') { updated.associatedIds = updated.associated.map(r => r.entityId); delete updated.associated; }
      if (table === 'maps') updated.gridType = Number(updated.gridType);
      if (table === 'events') updated.effects = materializeEffects(updated.effects, state);
      try { return await commitRelations(table === 'configuration' ? { type: 'configure', bounds: { min: updated.min, max: updated.max }, tiers: updated.tiers, revision: state.revision } : { type: 'put', table, record: updated, revision: state.revision }); }
      catch (error) { ui.notifications.error(error.message); throw error; }
    } }, { action: 'cancel', label: 'Cancel' }], rejectClose: false });
}
