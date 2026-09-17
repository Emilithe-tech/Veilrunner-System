import test from 'node:test';
import assert from 'node:assert/strict';
import { bindProgressionJourney } from '../modules/sheets/progression-journey.mjs';
import { progressionPresentation } from '../modules/sheets/progression-view.mjs';

test('incremental batches contain only new levels and never enable later-level implementation', () => {
  const view = progressionPresentation({ level: 3, experience: { value: 99999 } }, [], { 10: { state: {} } }, {}, 6, 6);
  assert.deepEqual(view.levels.map(row => row.level), [10, 11, 12, 13, 14, 15]);
  assert.ok(view.levels.every(row => !row.canImplement));
});

test('loading is deduplicated, preserves scroll, and releases the load button', async () => {
  const root = new EventTarget();
  const button = { disabled: false };
  Object.assign(root, { isConnected: true, scrollTop: 0, querySelector: () => button, setAttribute() {}, removeAttribute() {} });
  let release;
  let loads = 0;
  const binding = bindProgressionJourney(root, { initialScroll: 123, onScroll() {}, onOpen() {},
    loadMore: () => { loads++; return new Promise(resolve => { release = resolve; }); } });
  const first = binding.load();
  assert.equal(binding.load(), first);
  await Promise.resolve();
  assert.equal(loads, 1);
  assert.equal(button.disabled, true);
  release();
  await first;
  assert.equal(button.disabled, false);
  assert.equal(root.scrollTop, 123);
  root.isConnected = false;
  await binding.load();
  assert.equal(loads, 1);
});

test('reduced motion toggles immediately and interactive header buttons are not intercepted', () => {
  const root = new EventTarget();
  const body = { style: { removeProperty() {} } };
  const row = { open: false, dataset: { journeyLevel: '4' }, querySelector: () => body };
  const summary = { parentElement: row };
  Object.assign(root, { querySelector: () => null, contains: () => true });
  const before = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  const states = [];
  bindProgressionJourney(root, { onScroll() {}, loadMore() {}, onOpen: (...args) => states.push(args) });
  try {
    const click = new Event('click', { cancelable: true });
    Object.defineProperty(click, 'target', { value: { closest: selector => selector === 'summary' ? summary : null } });
    root.dispatchEvent(click);
    assert.equal(row.open, true);
    assert.deepEqual(states, [[4, true]]);
    const buttonClick = new Event('click', { cancelable: true });
    Object.defineProperty(buttonClick, 'target', { value: { closest: () => summary } });
    root.dispatchEvent(buttonClick);
    assert.equal(buttonClick.defaultPrevented, false);
  } finally { globalThis.matchMedia = before; }
});
