import { registerRelationsService, readRelations, commitRelations, canManageRelations, setStanding, adjustStanding, RELATIONS_HOOK } from './service.mjs';
import { RELATIONS_PARTIALS, renderRelations, bindRelations } from './view.mjs';
import { getPartyMembers } from '../helpers/party.mjs';

export { RELATIONS_PARTIALS };
let manager;
class RelationsManager extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = { id: 'veilrunner-relations-manager', classes: ['veilrunner', 'vr-rel-manager'], window: { title: 'Relations — World Management', resizable: true }, position: { width: 1000, height: 780 } };
  constructor(options = {}) { super(); this.relationsOptions = options; }
  async _renderHTML() { return renderRelations(this.relationsOptions); }
  _replaceHTML(result, content) { content.innerHTML = result; }
  _onRender(context, options) { super._onRender(context, options); bindRelations(this.element.querySelector('.vr-rel-workspace'), this.relationsOptions, () => this.render()); }
}
export function openRelationsManager(options = {}) {
  if (!game.user.isGM) throw new Error('Only the GM can open world management.');
  manager ??= new RelationsManager(options);
  manager.relationsOptions = { ...manager.relationsOptions, ...options };
  manager.render({ force: true });
  return manager;
}
let notificationTimer, lastVisible = new Map(), pending = new Map();
function notifyChanges() {
  const state = readRelations();
  for (const relation of state.relations) {
    if (lastVisible.has(relation.id) && lastVisible.get(relation.id) !== relation.value) {
      const entity = state.entities.find(e => e.id === relation.targetId);
      if (entity) pending.set(relation.id, { name: entity.name, value: relation.value });
    }
  }
  if (!state.relations.length && state.revision === 0) return; // Snapshot invalidation is not a change notification.
  const ids = new Set(state.relations.map(r => r.id));
  for (const id of pending.keys()) if (!ids.has(id)) pending.delete(id);
  lastVisible = new Map(state.relations.map(r => [r.id, r.value]));
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => {
    const current = readRelations();
    for (const [id, record] of pending) if (current.relations.some(r => r.id === id)) ui.notifications.info(record.name + ': ' + (record.value ?? 'Unrated'));
    if (pending.size) {
      const src = game.settings.get('Veilrunner', 'relationsNotificationSound');
      if (src) void foundry.audio.AudioHelper.play({ src, volume: 0.4, autoplay: true, loop: false }, false);
    }
    pending.clear();
  }, 700);
}
async function tokenAdjustment(token, delta, party = false, acquaintance = false) {
  if (!canManageRelations()) return;
  const actor = token?.actor, state = readRelations();
  const target = state.entities.find(e => e.actorUuid === actor?.uuid);
  if (!target) { ui.notifications.warn('Track this Actor in Relations first.'); return; }
  let source = game.user.character;
  if (!source) source = canvas.tokens.controlled.map(t => t.actor).find(a => a?.type === 'hero');
  if (!source) { ui.notifications.warn('Assign an active character or select a hero token.'); return; }
  if (party) source = game.actors.find(a => a.type === 'party' && getPartyMembers(a).some(m => m.id === source.id));
  if (!source) { ui.notifications.warn('No party is associated with this hero.'); return; }
  await adjustStanding(source.uuid, target.id, delta, { toggleAcquaintance: acquaintance });
}
export function registerRelations() {
  registerRelationsService();
  game.veilrunner ??= {};
  game.veilrunner.relations = Object.freeze({
    openManager: openRelationsManager, query: readRelations, commit: commitRelations, setStanding, adjustStanding,
    open: async options => {
      const { openPlayerDatapad } = await import('../apps/datapad.mjs');
      return openPlayerDatapad(options?.targetId || options?.entityId || options?.mapId || options?.eventId ? options : { section: 'characters', ...options });
    }
  });
  game.settings.register('Veilrunner', 'relationsNotificationSound', { name: 'Relations notification sound', hint: 'Optional audio path. Blank disables sounds.', scope: 'client', config: true, type: String, default: '' });
  game.keybindings.register('Veilrunner', 'openRelations', { name: 'Open Relations management', restricted: true, editable: [], onDown: () => { openRelationsManager(); return true; } });
  for (const [key, delta] of [['increaseStanding', 1], ['decreaseStanding', -1]]) game.keybindings.register('Veilrunner', key, { name: delta > 0 ? 'Increase standing' : 'Decrease standing', restricted: true, editable: [], onDown: () => {
    const token = canvas.tokens.hover ?? canvas.tokens.controlled[0];
    if (token) void tokenAdjustment(token, delta).catch(error => ui.notifications.error(error.message));
    return Boolean(token);
  } });
  Hooks.on(RELATIONS_HOOK, () => {
    if (manager?.rendered) manager.render();
    const sheets = new Set(Object.values(ui.windows ?? {}));
    for (const actor of game.actors ?? []) if (actor.type === 'hero') for (const app of Object.values(actor.apps ?? {})) sheets.add(app);
    for (const app of sheets) if (app.rendered && app.actor?.type === 'hero' && app.section === 'character' && app.subTabs?.character === 'relations') app.render({ parts: ['main'] });
    notifyChanges();
  });
  Hooks.on('renderTokenHUD', (hud, html) => {
    if (!canManageRelations()) return;
    const root = html instanceof HTMLElement ? html : html?.[0] ?? hud.element;
    const entity = readRelations().entities.find(e => e.actorUuid === hud.object?.actor?.uuid);
    if (!root || !entity || root.querySelector('.vr-rel-token-controls')) return;
    const controls = document.createElement('div'); controls.className = 'vr-rel-token-controls';
    for (const [label, delta, party, acquaintance] of [['Personal −', -1, false, false], ['Personal +', 1, false, false], ['Party −', -1, true, false], ['Party +', 1, true, false], ['Acquaintance', 0, false, true]]) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
      button.addEventListener('click', event => { event.stopPropagation(); void tokenAdjustment(hud.object, delta, party, acquaintance).catch(error => ui.notifications.error(error.message)); });
      controls.append(button);
    }
    root.append(controls);
  });
  Hooks.on('renderJournalDirectory', (_app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root || root.querySelector('[data-open-relations]')) return;
    const button = document.createElement('button'); button.type = 'button'; button.dataset.openRelations = ''; button.textContent = 'Relations';
    button.addEventListener('click', () => openRelationsManager()); root.prepend(button);
  });
}
