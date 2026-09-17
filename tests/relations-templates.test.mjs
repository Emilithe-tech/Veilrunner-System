import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire((process.env.FOUNDRY_APP_PATH ?? 'C:/Program Files/Foundry Virtual Tabletop/resources/app') + '/package.json');
const H = require('handlebars').create();
const root = new URL('../', import.meta.url), prefix = 'systems/veilrunner/templates/relations/';
const read = p => fs.readFileSync(new URL(p,root),'utf8');
const lang = JSON.parse(read('lang/en.json'));
// Foundry Localization.localize uses getProperty, not a flat dictionary lookup.
const translation = key => key.split('.').reduce((value,part) => value?.[part],lang);
H.registerHelper('localize', key => translation(key) ?? key);
for (const name of fs.readdirSync(new URL('templates/relations/',root))) H.registerPartial(prefix + name, H.compile(read('templates/relations/' + name)));
test('all relations templates compile and escape stored dossier text', () => {
  for (const name of fs.readdirSync(new URL('templates/relations/',root))) H.precompile(read('templates/relations/' + name));
  const render = H.compile(read('templates/relations/workspace.hbs'));
  const html = render({ selected: { id: 'npc', name: '<script>bad()</script>', description: '<img onerror=bad()>' }, entity: true, items: [], noteText: '</textarea><script>bad()</script>', standingLabel: 'Unrated' });
  assert.doesNotMatch(html, /<script>|<img onerror/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /data-rel-action="edit"/);
  assert.doesNotMatch(html, /data-rel-action="standing"/);
});
test('player template omits GM agendas and controls, and unavailable state contains no names', () => {
  const render = H.compile(read('templates/relations/workspace.hbs'));
  const html = render({ selected: { name: 'Visible', gmNotes: 'SECRET' }, entity: true, isGM: false, manage: false });
  assert.doesNotMatch(html, /SECRET|data-rel-action="configure"|data-rel-action="apply"/);
  assert.match(render({ unavailable: true }), /Unavailable/);
});
test('relations CSS import graph resolves and existing main entrypoint remains singular', () => {
  const manifest = JSON.parse(read('system.json'));
  assert.deepEqual(manifest.styles, ['css/veilrunner.css']);
  const paths = [];
  function visit(path) {
    const source = read(path); paths.push(path);
    for (const match of source.matchAll(/@import url\("([^"]+)"\)/g)) {
      const url = new URL(match[1],new URL(path,root));
      visit(decodeURIComponent(url.pathname).replace(decodeURIComponent(root.pathname),''));
    }
  }
  visit('css/components/relations.css');
  assert.equal(paths.length,5);
  for (const match of fs.readdirSync(new URL('templates/relations/',root)).flatMap(name => [...read('templates/relations/'+name).matchAll(/localize\s+["']([^"']+)["']/g)])) assert.equal(typeof translation(match[1]),'string',match[1]);
});
test('GM and player navigation resolve labels through Foundry-style nested lookup', () => {
  const render = H.compile(read('templates/relations/workspace.hbs'));
  for (const manage of [false,true]) {
    const html = render({ manage, isGM:manage, characters:[{uuid:'Actor.hero',name:'Hero'}], items:[] });
    assert.doesNotMatch(html,/VEILRUNNER\.RelationsUI/);
    assert.match(html,/Search relations/);
    assert.match(html,/Relations access/);
    if (manage) assert.match(html,/World management/);
  }
});
