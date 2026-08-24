import assert from "node:assert/strict";
import test from "node:test";

class Field { constructor(options = {}) { Object.assign(this, options); } }
class SchemaField extends Field { constructor(fields, options = {}) { super(options); this.fields = fields; } }
class ArrayField extends Field { constructor(element, options = {}) { super(options); this.element = element; } }
class TypeDataModel {}
const clone = value => structuredClone(value);
globalThis.foundry = {
  abstract: { TypeDataModel },
  data: { fields: { ArrayField, BooleanField: Field, HTMLField: Field, NumberField: Field, SchemaField, StringField: Field } },
  utils: {
    deepClone: clone,
    getProperty: (object, path) => path.split(".").reduce((value, key) => value?.[key], object),
    mergeObject: (original, changes) => ({ ...original, ...changes, filters: { ...(original.filters ?? {}), ...(changes.filters ?? {}) } })
  }
};

const settings = new Map([
  ["actionTraits", [{ id: "agile", attackPenaltyAdjustment: 1 }, { id: "heavy", attackPenaltyAdjustment: -1 }]],
  ["combatHudHealthBands", [{ id: "uninjured", label: "Uninjured", min: 100 }, { id: "wounded", label: "Wounded", min: 61 }, { id: "bloodied", label: "Bloodied", min: 26 }, { id: "critical", label: "Critical", min: 1 }, { id: "down", label: "Down", min: 0 }]],
  ["combatHudIntelModules", [{ id: "identity" }, { id: "biomonitor" }]]
]);
const userFlags = {};
globalThis.game = {
  system: { id: "Veilrunner" },
  user: {
    id: "player", isGM: false, targets: new Set(), hotbar: {},
    getFlag: (scope, key) => userFlags[key],
    setFlag: async (scope, key, value) => { userFlags[key] = value; return value; }
  },
  settings: { get: (scope, key) => settings.get(key) },
  actors: Object.assign([], { get: () => null }), folders: Object.assign([], { get: () => null }), macros: { get: () => null }
};

const { evaluateActionAvailability, AVAILABILITY } = await import("../modules/apps/action-hud/availability.mjs");
const { actionLimits, currentMapPenalty, getCombatEconomy, recordSuccessfulAttack } = await import("../modules/apps/action-hud/economy.mjs");
const { getTargetIntelPresentation } = await import("../modules/apps/action-hud/target-intel.mjs");
const { qualitativeHealth } = await import("../modules/apps/action-hud/pan.mjs");
const { visibleEffects } = await import("../modules/apps/action-hud/visibility.mjs");
const { resolveHudActionConfiguration } = await import("../modules/apps/action-hud/resolver.mjs");
const { executeHudAction } = await import("../modules/apps/action-hud/execution.mjs");
const { discoverHudActions, macroActions, searchHudActions } = await import("../modules/apps/action-hud/discovery.mjs");
const { buildHudProjection } = await import("../modules/apps/action-hud/projection.mjs");

const collection = values => Object.assign(values, { get: id => values.find(value => value.id === id) });
const actor = (overrides = {}) => ({
  id: "hero", uuid: "Actor.hero", type: "hero", isOwner: true, items: collection([]), effects: [],
  system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: {} },
  update: async function(changes) { for (const [path, value] of Object.entries(changes)) { const keys = path.split("."); let target = this; while (keys.length > 1) target = target[keys.shift()] ??= {}; target[keys[0]] = value; } return this; },
  testUserPermission: () => true,
  ...overrides
});

test("availability is tri-state and never mutates resources", () => {
  const hero = actor({ system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 4, max: 10 } }, equipment: {} } });
  const tooCostly = evaluateActionAvailability({ actor: hero, action: { costs: { mana: 5 }, actionCount: 1 } });
  assert.equal(tooCostly.state, AVAILABILITY.UNAVAILABLE);
  assert.equal(tooCostly.reason, "Insufficient mana.");
  const hiddenTarget = actor({ id: "enemy", isOwner: false, effects: [{ id: "burning", name: "Burning", disabled: false, flags: {} }] });
  const uncertain = evaluateActionAvailability({ actor: hero, action: { requirements: [{ scope: "target", type: "effect", key: "Burning", value: 1, operator: "gte", knowledge: "known" }] }, target: hiddenTarget, targetPresentation: { conditions: [] } });
  assert.equal(uncertain.state, AVAILABILITY.UNKNOWN);
  assert.equal(hero.system.resources.mana.value, 4);
});

test("combat economy resets from attributes and first attack has no MAP", async () => {
  const hero = actor();
  assert.deepEqual(actionLimits(hero), { actions: 4, reactions: 1 });
  const updates = [];
  const combatant = { id: "c1", actor: hero, isOwner: true, flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } }, update: async change => { updates.push(change); Object.assign(combatant.flags.Veilrunner.actionHud.economy, change["flags.Veilrunner.actionHud.economy"]); } };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  globalThis.game.combat = combat;
  assert.equal(getCombatEconomy(hero, combat).actions, 4);
  assert.equal(currentMapPenalty(hero, ["agile"], combat), 0);
  await recordSuccessfulAttack(hero, combat);
  assert.equal(updates.length, 1);
  assert.equal(currentMapPenalty(hero, ["agile"], combat), -4);
  delete globalThis.game.combat;
});

test("rank and enhancement configuration resolves one authoritative cost", () => {
  const hero = actor();
  const action = { id: "spell", actionCount: 1, costs: { mana: 1 }, rankScaling: { enabled: true, min: 1, max: 5, manaPerRank: 2, staminaPerRank: 0, actionPerRank: 0 }, enhancements: [{ id: "quick", label: "Quickened", maxStacks: 2, costs: { mana: 1 }, actionAdjustment: 0 }] };
  const resolved = resolveHudActionConfiguration(hero, action, { rank: "3", "enhancement:quick": "2" });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.costs.mana, 9);
  assert.equal(resolveHudActionConfiguration(hero, action, { rank: "9" }).valid, false);
});

test("health bands and effect visibility are conservative", () => {
  assert.equal(qualitativeHealth({ value: 5, max: 10 }).label, "Bloodied");
  const target = actor({ effects: [
    { id: "legacy", name: "Legacy Secret", disabled: false, flags: {} },
    { id: "burn", name: "Burning", disabled: false, flags: { Veilrunner: { visibility: { disclosure: "observable" } } } }
  ] });
  target.testUserPermission = () => false;
  assert.deepEqual(visibleEffects(target, { viewer: globalThis.game.user }), [{ id: "burn", name: "Burning", img: undefined, disclosure: "observable", stacks: 1 }]);
});

test("target intel is encounter-scoped and subsystem-specific", () => {
  const viewer = actor();
  const enemy = actor({ id: "enemy", name: "Guard", img: "guard.webp", isOwner: false, system: { networkLinked: true, resources: { health: { value: 2, max: 10 }, armor: { value: 4, max: 8 }, shields: { value: 3, max: 6 }, barriers: { value: 0, max: 0 } } } });
  enemy.testUserPermission = () => false;
  const token = { document: { id: "token", uuid: "Scene.s.Token.token" }, actor: enemy };
  const combat = { flags: { Veilrunner: { actionHud: { intel: { Actor_hero: { Scene_s_Token_token: { modules: ["biomonitor"] } } } } } } };
  const view = getTargetIntelPresentation(token, { viewerActor: viewer, combat });
  assert.equal(view.resources.health.exact, true);
  assert.equal(view.resources.armor.visible, false);
  assert.equal(view.intel.known, 1);
});

test("shared execution commits costs only after a successful source", async () => {
  const hero = actor();
  const action = { id: "test", name: "Test", sourceType: "definition", source: { execute: async () => true }, costs: { mana: 3 }, actionCount: 0, actionType: "free", traits: [], composer: [], enhancements: [], augments: [] };
  const success = await executeHudAction(hero, action);
  assert.equal(success.success, true);
  assert.equal(hero.system.resources.mana.value, 7);
  const cancelled = { ...action, id: "cancel", source: { execute: async () => false }, costs: { mana: 2 } };
  const failure = await executeHudAction(hero, cancelled);
  assert.equal(failure.success, false);
  assert.equal(hero.system.resources.mana.value, 7);
});

test("hotbar macros preserve occupied slot order", () => {
  const macros = new Map([["m2", { id: "m2", name: "Second", img: "second.webp" }], ["m8", { id: "m8", name: "Eighth", img: "eighth.webp" }]]);
  globalThis.game.macros.get = id => macros.get(id);
  const actions = macroActions({ hotbar: { 8: "m8", 2: "m2" } });
  assert.deepEqual(actions.map(action => [action.slot, action.name]), [[2, "Second"], [8, "Eighth"]]);
  globalThis.game.macros.get = () => null;
});

test("equipped firearm remains available outside the active library filter", () => {
  const weapon = { id: "rifle", name: "Rifle", img: "rifle.webp", type: "weapon", system: { requiredSlots: ["mainHand"], weaponKind: "firearm", weaponType: "assault-rifle", intents: [], actions: 1, attack: { formula: "1d10" }, damage: { base: "1d6", max: "1d6", modifier: 0, type: "piercing" }, range: 40, traits: [], firearm: { magazineMode: "none", fireModes: [], options: [] } } };
  const hero = actor({ items: collection([weapon]), system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: { mainHand: "rifle" }, assetLinks: [] } });
  weapon.parent = hero;
  const raw = discoverHudActions(hero, { user: globalThis.game.user });
  assert.equal(searchHudActions(raw, { domain: "magic" }).length, 0);
  const view = buildHudProjection(hero, { domain: "magic" });
  assert.equal(view.actions.length, 0);
  assert.equal(view.allActions.some(action => action.weaponId === "rifle" && action.operation === "fire"), true);
});

test("weapon composer derives Single Shot and validates authored ammunition cost", () => {
  const hero = actor();
  const base = { id: "weapon:rifle:fire", actionCount: 1, traits: [], costs: {}, composer: [{ key: "fireMode", label: "Fire Mode", choices: ["single", "burst"], required: true }], weaponComposer: { range: 40, ammoCurrent: 2, modes: [{ id: "single", label: "Single Shot", actions: 1, ammoCost: 1 }, { id: "burst", label: "Burst", actions: 2, ammoCost: 3 }], options: [] } };
  const single = resolveHudActionConfiguration(hero, base, {});
  assert.equal(single.resolvedSelections.fireMode, "single");
  assert.equal(single.ammoCost, 1);
  assert.equal(single.valid, true);
  const burst = resolveHudActionConfiguration(hero, base, { fireMode: "burst" });
  assert.equal(burst.ammoCost, 3);
  assert.equal(burst.valid, false);
});
