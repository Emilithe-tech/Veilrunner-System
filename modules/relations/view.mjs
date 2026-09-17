import { tierFor } from './model.mjs';
import { mapGrid } from './map.mjs';
import { readRelations, normalizePerspective, permittedPerspectives, canManageRelations, commitRelations, previewEvent, setStanding, personalNote, writePersonalNote, relatedJournals, linkJournal, adoptRelations, refreshRelationsViews, canObserve } from './service.mjs';
import { editRelationRecord } from './editor.mjs';
import { exportRelationsIdentity, restoreRelationsIdentity } from './vault.mjs';
import { reloadRelationsAccess } from './service.mjs';
import { describeEffectValue } from './effects.mjs';
const ROOT = 'systems/veilrunner/templates/relations/';
export const RELATIONS_PARTIALS = ['workspace', 'navigation', 'sidebar', 'dossier', 'map', 'events', 'editor', 'editor-field'].map(name => ROOT + name + '.hbs');
const mounts = new WeakMap();
const esc = value => foundry.utils.escapeHTML(String(value ?? ''));
export const safeMedia = value => typeof value === 'string' && !/[<>"']/.test(value) && !/^(?:javascript|data|vbscript):/i.test(value.trim()) ? value : '';
const tableFor = tab => tab === 'maps' ? 'maps' : tab === 'events' ? 'events' : tab === 'standings' ? 'relations' : 'entities';
function context(options) {
  const state = readRelations(), perspective = normalizePerspective(options), source = perspective.source;
  const tab = options.tab ?? 'character', table = tableFor(tab);
  const all = state[table].filter(e => table !== 'entities' || e.kind === tab);
  const selected = state[table].find(e => e.id === options.targetId);
  const query = String(options.query ?? '').toLocaleLowerCase();
  const nameOf = id => state.entities.find(e => e.id === id)?.name ?? game.actors.find(a => a.uuid === id && canObserve(a))?.name ?? 'Unavailable';
  const items = all.map(e => ({ ...e, name: e.name ?? nameOf(e.source) + ' → ' + nameOf(e.targetId), selected: e.id === selected?.id })).filter(e => e.name.toLocaleLowerCase().includes(query));
  const standing = selected && state.relations.find(r => r.targetId === selected.id && r.source === source);
  const selectedCopy = selected && { ...selected, img: safeMedia(selected.img), background: safeMedia(selected.background) };
  const members = selected ? state.entities.filter(e => (e.memberships ?? []).some(m => m.factionId === selected.id)).map(e => ({ id: e.id, name: e.name, rank: e.memberships.find(m => m.factionId === selected.id).rank })) : [];
  const memberships = (selected?.memberships ?? []).map(m => ({ ...m, name: nameOf(m.factionId) }));
  const history = state.events.filter(e => e.status === 'applied' && (table === 'events' ? !selected || selected.id === e.id : (e.changes ?? []).some(c => c.id === selected?.id || state.relations.some(r => r.id === c.id && r.targetId === selected?.id && r.source === source))));
  const events = (table === 'events' ? selected ? [selected] : state.events : history).map(e => ({ ...e, draft: e.status !== 'applied', dueNow: e.status !== 'applied' && e.due !== null && e.due <= Math.max(state.clock, game.time.worldTime), reversible: e.status === 'applied' && !state.events.some(other => other.reverses === e.id), timeLabel: e.time === undefined ? 'Unscheduled' : String(e.time), changes: (e.changes ?? []).map(c => ({ ...c, name: c.table === 'relations' ? nameOf(state.relations.find(r => r.id === c.id)?.targetId) : nameOf(c.id), beforeLabel: describeEffectValue(c.before, c.field, nameOf), afterLabel: describeEffectValue(c.after, c.field, nameOf) })) }));
  const maps = state.maps.filter(m => m.locationId === selected?.id);
  const relations = selected ? state.relations.filter(r => r.source === selected.id || r.targetId === selected.id && r.source === source).map(r => ({ id: r.targetId, name: nameOf(r.targetId), sourceName: nameOf(r.source), tier: tierFor(r.value, state.tiers) })) : [];
  const note = selected && personalNote(selected.id);
  const groups = [{kind:'location',name:'Locations',icon:'fa-location-dot'}, {kind:'faction',name:'Factions',icon:'fa-flag'}, {kind:'character',name:'Characters',icon:'fa-user-group'}].map(group => {
    const records = state.entities.filter(e => e.kind === group.kind);
    const rows = [], visited = new Set();
    const append = (record, depth) => {
      if (visited.has(record.id)) return;
      visited.add(record.id);
      rows.push({...record, img:safeMedia(record.img), depth:Math.min(depth,6), selected:record.id === selected?.id, hidden:!record.name.toLocaleLowerCase().includes(query)});
      records.filter(e => e.parentId === record.id).forEach(e => append(e,depth+1));
    };
    records.filter(e => !records.some(parent => parent.id === e.parentId)).forEach(e => append(e,0));
    records.forEach(e => append(e,0));
    return {...group,rows,count:rows.length};
  });
  return { ...options, ...perspective, tab, table, items, selected: selectedCopy, standing, standingLabel: tierFor(standing?.value, state.tiers),
    groups, auxiliaryTab:table !== 'entities', selectedKind:selected?.kind ?? tab,
    meter: standing?.value !== null && standing?.value !== undefined && state.bounds.min !== null && state.bounds.max !== null && state.bounds.max > state.bounds.min ? { min: state.bounds.min, max: state.bounds.max, value: standing.value } : null,
    memberships, members, relations, maps, parentName: nameOf(selected?.parentId), controllerName: nameOf(selected?.controllerId),
    associations: (selected?.associatedIds ?? []).map(id => ({ id, name: nameOf(id) })),
    events, isGM: game.user.isGM, manage: canManageRelations(), entity: table === 'entities' && selectedCopy, map: table === 'maps' && selectedCopy,
    eventTab: table === 'events', relationRecord: table === 'relations' && selectedCopy, unavailable: Boolean(options.targetId && !selected), sourceAvailable: Boolean(source),
    notebooksReady: Boolean(note?.journal), noteText: options.noteDraft?.[selected?.id] ?? note?.content ?? '',
    journals: selected ? relatedJournals(selected.id).map(j => ({ name: j.name, uuid: j.uuid, linkId: state.links.find(l => l.targetId === selected.id && l.journalUuid === j.uuid)?.id })) : [],
    gridPaths: table === 'maps' && selected ? mapGrid(selected) : [],
    pins: (selected?.pins ?? []).map(p => ({ ...p, name: nameOf(p.entityId) })),
    territories: (selected?.territories ?? []).map(t => ({ ...t, name: nameOf(t.factionId), pointsText: t.points.map(p => p.join(',')).join(' ') })),
    mapEntities: state.entities.map(e => ({ id: e.id, name: e.name, selected: e.id === options.mapEntityId })),
    mapFactions: state.entities.filter(e => e.kind === 'faction').map(e => ({ id: e.id, name: e.name, selected: e.id === options.mapFactionId })),
    draftPoints: options.mapDraftId === selected?.id ? (options.mapPoints ?? []).map(p => p.join(',')).join(' ') : '',
    tabs: [{ id: 'character', name: 'Characters' }, { id: 'faction', name: 'Factions' }, { id: 'location', name: 'Locations' }, { id: 'maps', name: 'Maps' }, { id: 'events', name: 'Timeline' }, ...(game.user.isGM ? [{ id: 'standings', name: 'Standings' }] : [])].map(t => ({ ...t, active: t.id === tab })),
    characters: permittedPerspectives().filter(a => a.type !== 'party').map(a => ({ uuid: a.uuid, name: a.name, selected: a.uuid === perspective.characterUuid })),
    parties: permittedPerspectives().filter(a => a.type === 'party').map(a => ({ id: a.id, name: a.name, selected: a.id === perspective.partyId })),
    partyPerspective: options.perspective === 'party'
  };
}
export function renderRelations(options = {}) {
  const template = Handlebars.partials[ROOT + 'workspace.hbs'];
  return typeof template === 'function' ? template(context(options)) : '<p>Relations is loading.</p>';
}
export function renderJournalRelations(journal) {
  if (!canObserve(journal)) return '';
  const state = readRelations(), targets = [...state.entities, ...state.maps, ...state.events];
  const links = state.links.filter(l => l.journalUuid === journal.uuid).map(l => targets.find(t => t.id === l.targetId)).filter(Boolean);
  return '<section class="vr-rel-workspace"><h3>Relations</h3>' + links.map(target => '<button type="button" data-rel-action="linked-target" data-id="' + esc(target.id) + '">' + esc(target.name) + '</button>').join('') +
    (canManageRelations() ? '<button type="button" data-rel-action="link-target" data-uuid="' + esc(journal.uuid) + '">Associate a relation, map, or event</button>' : '') + '</section>';
}
async function promptText(title, label, value = '') {
  return foundry.applications.api.DialogV2.prompt({ window: { title }, content: '<label>' + esc(label) + '<input name="answer" value="' + esc(value) + '"></label>', ok: { label: 'Save', callback: (_event, button) => button.form.elements.answer.value }, rejectClose: false });
}
export function bindRelations(root, options = {}, redraw) {
  if (!root) return;
  mounts.get(root)?.abort();
  const controller = new AbortController(); mounts.set(root, controller);
  const signal = controller.signal;
  const refresh = (navigate = false) => redraw ? redraw(navigate) : (root.innerHTML = renderRelations(options));
  root.addEventListener('input', event => {
    if (event.target.matches('[data-rel-search]')) {
      options.query = event.target.value;
      for (const button of root.querySelectorAll('[data-rel-item]')) button.hidden = !button.textContent.toLocaleLowerCase().includes(options.query.toLocaleLowerCase());
    }
    if (event.target.matches('[data-rel-note]')) { options.noteDraft ??= {}; options.noteDraft[options.targetId] = event.target.value; }
  }, { signal });
  root.addEventListener('change', event => {
    const key = event.target.dataset.relContext;
    if (['characterUuid', 'partyId', 'perspective'].includes(key)) { options[key] = event.target.value; refresh(); }
    const mapKey = event.target.dataset.relMapKey;
    if (['mapEntityId', 'mapFactionId', 'mapColor'].includes(mapKey)) options[mapKey] = event.target.value;
  }, { signal });
  root.addEventListener('keydown', event => {
    if (['Enter', ' '].includes(event.key) && event.target.matches('svg [role="button"]')) { event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  }, { signal });
  root.addEventListener('click', async event => {
    const svg = event.target.closest('[data-rel-map-surface]');
    if (svg && options.mapMode && canManageRelations()) {
      event.preventDefault(); event.stopPropagation();
      try {
        const state = readRelations(), map = state.maps.find(m => m.id === options.targetId);
        if (!map) return;
        const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
        const matrix = svg.getScreenCTM();
        if (!matrix) return;
        const local = point.matrixTransform(matrix.inverse());
        const x = Math.round(Math.max(0, Math.min(map.width, local.x))), y = Math.round(Math.max(0, Math.min(map.height, local.y)));
        if (options.mapMode === 'pin') {
          const entityId = options.mapEntityId || root.querySelector('[data-rel-map-key="mapEntityId"]')?.value;
          if (!entityId) throw new Error('Choose an entity for this pin.');
          await commitRelations({ type: 'put', table: 'maps', revision: state.revision, record: { ...map, pins: [...(map.pins ?? []), { entityId, x, y }] } });
        } else {
          if (options.mapDraftId !== map.id) options.mapPoints = [];
          options.mapDraftId = map.id; options.mapPoints ??= []; options.mapPoints.push([x, y]);
        }
        refresh();
      } catch (error) { ui.notifications.error(error.message); }
      return;
    }
    const button = event.target.closest('[data-rel-action]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const action = button.dataset.relAction, state = readRelations(), table = tableFor(options.tab ?? 'character');
    const selected = state[table].find(e => e.id === options.targetId);
    try {
      if (action === 'tab') { options.tab = button.dataset.tab; delete options.targetId; options.query = ''; delete options.mapMode; options.mapPoints = []; refresh(true); }
      else if (action === 'linked-target') {
        const target = [...state.entities, ...state.maps, ...state.events].find(e => e.id === button.dataset.id);
        if (!target) throw new Error('Unavailable.');
        options.targetId = target.id;
        options.tab = target.kind ?? (state.maps.some(m => m.id === target.id) ? 'maps' : 'events');
        refresh(true);
      } else if (action === 'link-target') {
        const targets = [...state.entities, ...state.maps, ...state.events];
        await foundry.applications.api.DialogV2.prompt({ window: { title: 'Associate record' }, content: '<label>Relations record<select name="target">' + targets.map(t => '<option value="' + esc(t.id) + '">' + esc(t.name) + '</option>').join('') + '</select></label>', ok: { label: 'Link', callback: (_event, control) => {
          const target = targets.find(t => t.id === control.form.elements.target.value);
          if (target) return linkJournal(target.id, button.dataset.uuid, target.audience ?? []);
        } } });
      }
      else if (action === 'select' || action === 'entity' || action === 'map') {
        options.targetId = button.dataset.id;
        if (action === 'entity') options.tab = state.entities.find(e => e.id === options.targetId)?.kind ?? 'character';
        if (action === 'map') options.tab = 'maps';
        delete options.mapMode; options.mapPoints = [];
        refresh(true);
      } else if (action === 'new') await editRelationRecord(button.dataset.kind ? 'entities' : table, button.dataset.kind ? {kind:button.dataset.kind} : table === 'entities' ? { kind: options.tab ?? 'character' } : {});
      else if (action === 'edit' && selected) await editRelationRecord(table, selected);
      else if (action === 'remove' && selected && await foundry.applications.api.DialogV2.confirm({ window: { title: 'Remove record' }, content: '<p>Remove this record? Referenced entities and applied history cannot be removed.</p>' })) await commitRelations({ type: 'remove', table, id: selected.id, revision: state.revision });
      else if (action === 'configure') await editRelationRecord('configuration');
      else if (action === 'pin-mode') { options.mapMode = 'pin'; refresh(); }
      else if (action === 'territory-mode') { options.mapMode = 'territory'; options.mapPoints = []; options.mapDraftId = selected?.id; refresh(); }
      else if (action === 'map-cancel') { delete options.mapMode; options.mapPoints = []; refresh(); }
      else if (action === 'territory-save' && selected) {
        const factionId = options.mapFactionId || root.querySelector('[data-rel-map-key="mapFactionId"]')?.value;
        const color = options.mapColor || '#6fb9cb';
        await commitRelations({ type: 'put', table: 'maps', revision: state.revision, record: { ...selected, territories: [...(selected.territories ?? []), { factionId, color, points: options.mapPoints ?? [] }] } });
        options.mapPoints = []; delete options.mapMode;
      }
      else if (action === 'refresh') await refreshRelationsViews();
      else if (action === 'backup-key') {
        const saved = exportRelationsIdentity();
        if (saved) foundry.utils.saveDataToFile(saved, 'application/json', 'veilrunner-relations-access-' + game.user.id + '.json');
      } else if (action === 'restore-key') {
        await foundry.applications.api.DialogV2.prompt({ window: { title: 'Restore Relations access' }, content: '<label>Access key backup<input type="file" name="keyFile" accept=".json"></label>', ok: { label: 'Restore', callback: async (_event, button) => {
          const file = button.form.elements.keyFile.files[0];
          if (file) { await restoreRelationsIdentity(await file.text()); await reloadRelationsAccess(); }
        } } });
      }
      else if (action === 'adopt') await adoptRelations(normalizePerspective(options).characterUuid);
      else if (action === 'manage') game.veilrunner.relations.openManager(options);
      else if (action === 'datapad') {
        const { openPlayerDatapad } = await import('../apps/datapad.mjs');
        openPlayerDatapad({ ...options, section: ({ character: 'characters', faction: 'factions', location: 'places', maps: 'maps', events: 'timeline' })[options.tab ?? 'character'] ?? 'characters' });
      } else if (action === 'hero') {
        const actor = permittedPerspectives().find(a => a.uuid === normalizePerspective(options).characterUuid);
        if (!actor || actor.type !== 'hero') throw new Error('Choose a permitted hero perspective.');
        actor.sheet.section = 'character'; actor.sheet.subTabs.character = 'relations'; actor.sheet.relationsOptions = { ...options };
        actor.sheet.render({ force: true });
      } else if (action === 'note' && selected) { await writePersonalNote(selected.id, root.querySelector('[data-rel-note]').value); delete options.noteDraft?.[selected.id]; }
      else if (action === 'link' && selected) {
        const uuid = await promptText('Link existing journal or quest', 'Journal UUID');
        if (uuid) await linkJournal(selected.id, uuid, selected.audience ?? []);
      } else if (action === 'unlink') {
        await commitRelations({ type: 'remove', table: 'links', id: button.dataset.id, revision: state.revision });
      } else if (action === 'actor' && selected?.actorUuid) {
        const actor = await fromUuid(selected.actorUuid);
        if (!canObserve(actor)) throw new Error('Unavailable.');
        actor.sheet.render({ force: true });
      } else if (action === 'journal') {
        const journal = await fromUuid(button.dataset.uuid);
        if (!canObserve(journal)) throw new Error('Unavailable.');
        journal.sheet.render(true);
      } else if (action === 'standing' && selected) {
        const value = await promptText('Set standing', 'Value (blank means unrated)');
        if (typeof value === 'string') await setStanding(normalizePerspective(options).source, selected.id, value.trim() ? Number(value) : null);
      } else if (action === 'acquainted' && selected) {
        const source = normalizePerspective(options).source, current = state.relations.find(r => r.source === source && r.targetId === selected.id);
        await setStanding(source, selected.id, current?.value ?? null, { acquainted: !current?.acquainted, reason: 'Acquaintance changed' });
      } else if (action === 'apply') {
        const changes = previewEvent(button.dataset.id);
        const nameOf = id => state.entities.find(e => e.id === id)?.name ?? 'Unavailable';
        const content = '<p>Apply these explicit changes?</p><ul>' + changes.map(c => '<li>' + esc(nameOf(c.table === 'relations' ? state.relations.find(r => r.id === c.id)?.targetId : c.id)) + ' · ' + esc(c.field) + ': ' + esc(describeEffectValue(c.before, c.field, nameOf)) + ' → ' + esc(describeEffectValue(c.after, c.field, nameOf)) + '</li>').join('') + '</ul>';
        if (await foundry.applications.api.DialogV2.confirm({ window: { title: 'Preview faction event' }, content })) await commitRelations({ type: 'applyEvent', id: button.dataset.id, revision: state.revision });
      } else if (action === 'reverse') {
        const reason = await promptText('Reverse event', 'Reason');
        if (typeof reason === 'string') await commitRelations({ type: 'reverseEvent', id: button.dataset.id, reason, revision: state.revision });
      } else if (action === 'advance') {
        const time = await promptText('Advance faction review time', 'World time in seconds', Math.max(state.clock, game.time.worldTime));
        if (typeof time === 'string') await commitRelations({ type: 'advance', time: Number(time), revision: state.revision });
      }
      if (!['tab', 'select', 'entity', 'map', 'linked-target', 'pin-mode', 'territory-mode', 'map-cancel'].includes(action)) refresh();
    } catch (error) { ui.notifications.error(error.message); }
  }, { signal });
}
