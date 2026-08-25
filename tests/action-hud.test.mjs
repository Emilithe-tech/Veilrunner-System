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
const { actionLimits, currentMapPenalty, getCombatEconomy, movementSpent, recordSuccessfulAttack } = await import("../modules/apps/action-hud/economy.mjs");
const { getTargetIntelPresentation } = await import("../modules/apps/action-hud/target-intel.mjs");
const { qualitativeHealth } = await import("../modules/apps/action-hud/pan.mjs");
const { visibleEffects } = await import("../modules/apps/action-hud/visibility.mjs");
const { projectedResourceCosts, resolveHudActionConfiguration } = await import("../modules/apps/action-hud/resolver.mjs");
const { executeHudAction } = await import("../modules/apps/action-hud/execution.mjs");
const { discoverHudActions, macroActions, searchHudActions } = await import("../modules/apps/action-hud/discovery.mjs");
const { buildHudProjection, projectMovementTrack } = await import("../modules/apps/action-hud/projection.mjs");
const { recordHudMovementUndo, undoHudActionsThrough, undoLastHudAction } = await import("../modules/apps/action-hud/undo.mjs");
const { getHudPreferences, prepareHudAction, removePreparedHudAction } = await import("../modules/apps/action-hud/preferences.mjs");
const { equipPhysicalItem, unequipPhysicalItem } = await import("../modules/items/equipment.mjs");

const collection = values => Object.assign(values, { get: id => values.find(value => value.id === id) });
const actor = (overrides = {}) => ({
  id: "hero", uuid: "Actor.hero", type: "hero", isOwner: true, items: collection([]), effects: [],
  system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: {} },
  update: async function(changes) { for (const [path, value] of Object.entries(changes)) { const keys = path.split("."); let target = this; while (keys.length > 1) target = target[keys.shift()] ??= {}; const key = keys[0]; if (key.startsWith("-=")) delete target[key.slice(2)]; else target[key] = value; } return this; },
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

test("movement remaining follows Foundry's recorded token path", () => {
  const hero = actor();
  const token = { movementHistory: [{ x: 0, y: 0 }, { x: 1, y: 0 }], measureMovementPath: history => ({ distance: history.length === 2 ? 2 : 0 }) };
  const combatant = { id: "c1", actor: hero, token, flags: { Veilrunner: { actionHud: { economy: {} } } } };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  assert.equal(movementSpent(hero, combat), 2);
  assert.equal(getCombatEconomy(hero, combat).movement, 6);
  assert.equal(getCombatEconomy(hero, combat).movementLimit, 8);
});

test("movement totals every recorded step across Foundry movement actions", () => {
  const hero = actor();
  const token = {
    movementHistory: [
      { x: 0, movementId: "move-1" }, { x: 4, movementId: "move-1" },
      { x: 5, movementId: "move-2" }
    ],
    measureMovementPath: history => ({ distance: (history.at(-1).x - history[0].x) * 2 })
  };
  const combatant = { id: "c1", actor: hero, token, flags: { Veilrunner: { actionHud: { economy: {} } } } };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  assert.equal(movementSpent(hero, combat), 10);
  assert.equal(getCombatEconomy(hero, combat).movement, 6);
  assert.equal(getCombatEconomy(hero, combat).movementLimit, 8);
  assert.equal(getCombatEconomy(hero, combat).movementActions, 2);
});

test("diagonal movement alternates between one and two spaces", () => {
  const hero = actor();
  const token = {
    movementHistory: [{}, {}, {}, {}, {}],
    measureMovementPath: () => ({ spaces: 4, diagonals: 4, distance: 8 })
  };
  const combatant = { id: "c1", actor: hero, token, flags: { Veilrunner: { actionHud: { economy: {} } } } };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  assert.equal(movementSpent(hero, combat), 12);
  assert.equal(getCombatEconomy(hero, combat).movement, 4);
  assert.equal(getCombatEconomy(hero, combat).movementActions, 2);
});

test("movement projection preserves current over total and colors the track from its total allowance", () => {
  const blue = projectMovementTrack({ movementLimit: 12, movement: 10 });
  assert.equal(blue.maximumMeters, 12);
  assert.equal(blue.remainingMeters, 10);
  assert.equal(blue.boxes.length, 6);
  assert.ok(blue.boxes.every(box => box.color === "blue"));

  const orange = projectMovementTrack({ movementLimit: 24, movement: 20 });
  assert.equal(orange.boxes.length, 12);
  assert.ok(orange.boxes.every(box => box.color === "orange"));

  const white = projectMovementTrack({ movementLimit: 36, movement: 32 });
  assert.equal(white.boxes.length, 18);
  assert.ok(white.boxes.every(box => box.color === "white"));

  const compressed = projectMovementTrack({ movementLimit: 40, movement: 40 });
  assert.equal(compressed.maximumMeters, 40);
  assert.equal(compressed.unitsPerBox, 2);
  assert.equal(compressed.boxes.length, 10);
  assert.deepEqual(compressed.boxes.map(box => box.value), Array(10).fill(2));
  assert.ok(compressed.boxes.every(box => box.color === "white"));

  const afterTwoMetres = projectMovementTrack({ movementLimit: 40, movement: 38 });
  assert.equal(afterTwoMetres.remainingMeters, 38);
  assert.equal(afterTwoMetres.boxes[0].value, 1);
  assert.deepEqual(afterTwoMetres.boxes.slice(1).map(box => box.value), Array(9).fill(2));
});

test("the latest Foundry movement can be undone", async () => {
  const hero = actor();
  let reverted = "";
  const token = {
    actor: hero, uuid: "Scene.scene.Token.hero",
    movementHistory: [{ x: 0, movementId: "move-1" }, { x: 1, movementId: "move-1" }],
    measureMovementPath: history => ({ spaces: history.at(-1).x - history[0].x, diagonals: 0, distance: 2 }),
    revertRecordedMovement: async movementId => { reverted = movementId; return true; }
  };
  const combatant = {
    id: "c1", actor: hero, token, isOwner: true, flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } },
    update: async changes => {
      if ("flags.Veilrunner.actionHud.economy" in changes) combatant.flags.Veilrunner.actionHud.economy = changes["flags.Veilrunner.actionHud.economy"];
      if ("flags.Veilrunner.actionHud.undo" in changes) combatant.flags.Veilrunner.actionHud.undo = changes["flags.Veilrunner.actionHud.undo"];
      return combatant;
    }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  assert.equal(await recordHudMovementUndo(token, { id: "move-1" }, globalThis.game.user, combat), true);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo.type, "movement");
  assert.equal(combatant.flags.Veilrunner.actionHud.undo.actionCost, 1);
  assert.equal(combatant.flags.Veilrunner.actionHud.economy.actions, 3);
  const result = await undoLastHudAction(hero, combat);
  assert.equal(result.success, true);
  assert.equal(reverted, "move-1");
  assert.equal(combatant.flags.Veilrunner.actionHud.economy.actions, 4);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo, null);
});

test("crossing each movement allowance consumes one additional action", async () => {
  const hero = actor();
  const token = {
    actor: hero, uuid: "Scene.scene.Token.hero",
    movementHistory: [
      { x: 0, movementId: "move-1" }, { x: 4, movementId: "move-1" },
      { x: 5, movementId: "move-2" }
    ],
    measureMovementPath: history => ({ spaces: history.at(-1).x - history[0].x, diagonals: 0, distance: (history.at(-1).x - history[0].x) * 2 })
  };
  const combatant = {
    id: "c1", actor: hero, token, isOwner: true,
    flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 3, reactions: 1, attacks: 0 } } } },
    update: async changes => {
      if ("flags.Veilrunner.actionHud.economy" in changes) combatant.flags.Veilrunner.actionHud.economy = changes["flags.Veilrunner.actionHud.economy"];
      if ("flags.Veilrunner.actionHud.undo" in changes) combatant.flags.Veilrunner.actionHud.undo = changes["flags.Veilrunner.actionHud.undo"];
      return combatant;
    }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  assert.equal(await recordHudMovementUndo(token, { id: "move-2" }, globalThis.game.user, combat), true);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo.actionCost, 1);
  assert.equal(combatant.flags.Veilrunner.actionHud.economy.actions, 2);
});

test("rank and enhancement configuration resolves one authoritative cost", () => {
  const hero = actor({ system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, stamina: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: {} } });
  const action = { id: "spell", actionCount: 1, costs: { mana: 1, stamina: 2 }, rankScaling: { enabled: true, min: 1, max: 5, manaPerRank: 2, staminaPerRank: 3, actionPerRank: 0 }, enhancements: [{ id: "quick", label: "Quickened", maxStacks: 2, costs: { mana: 1 }, actionAdjustment: 0 }] };
  const levelOne = resolveHudActionConfiguration(hero, action, { rank: "1" });
  assert.deepEqual(levelOne.costs, { mana: 1, stamina: 2 }, "level 1 uses only the initial costs");
  const resolved = resolveHudActionConfiguration(hero, action, { rank: "3", "enhancement:quick": "2" });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.costs.mana, 7, "level 3 applies two mana increases, then enhancements");
  assert.equal(resolved.costs.stamina, 8, "level 3 applies two stamina increases");
  assert.equal(resolveHudActionConfiguration(hero, action, { rank: "9" }).valid, false);
});

test("spell modifiers stack from base mana and resolve spell outcomes", () => {
  const hero = actor({ system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 100, max: 100 } }, equipment: {} } });
  const spell = { id: "spell", isSpell: true, actionCount: 3, range: 20, traits: ["summoning"], costs: { mana: 2 }, composer: [], enhancements: [], augments: [] };
  const resolved = resolveHudActionConfiguration(hero, spell, {
    "spellModifier:twinned": "1",
    "spellModifier:long-distance": "1",
    "spellModifier:increased-potency": "1",
    "spellModifier:extended": "1",
    "spellModifier:quickened": "2",
    "spellModifier:subtle": "1"
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.costs.mana, 46);
  assert.equal(resolved.actionCount, 1);
  assert.equal(resolved.range, 30);
  assert.deepEqual(resolved.spellComposer.outcome, { effectMultiplier: 2, additionalTargets: 1, rangeBonus: 10, potencyMultiplier: 2, summonDurationBonus: 2, ignoresSilence: true, delayTurns: 0, conservativeStacks: 0 });
  assert.equal(resolved.selectedSpellModifiers.length, 6);
  assert.deepEqual(resolved.breakdown.filter(entry => !["Base Cost", "Final Cost"].includes(entry.label)).map(entry => entry.label), ["Twinned Spell", "Long Distance", "Increased Potency", "Extended Spell", "Quickened Spell", "Subtle Spell"]);
  assert.equal(resolved.breakdown.find(entry => entry.label === "Increased Potency").value, "Mana 10 × 3 = 30");
  assert.equal(resolved.breakdown.find(entry => entry.label === "Quickened Spell").value, "+8 Mana (2 × 2 × 2) · −2 AP");
  assert.deepEqual(resolved.breakdown.at(-1), { label: "Final Cost", value: "1 AP · 46 Mana", final: true });
});

test("spell level updates the estimated damage", () => {
  const hero = actor();
  const spell = { id: "leveled-spell", isSpell: true, currentLevel: 7, maxLevel: 10, baseSpellDamage: "2d6", spellDamagePerLevel: "1d6", actionCount: 1, traits: [], costs: { mana: 1 }, composer: [], enhancements: [], augments: [] };
  const levelFour = resolveHudActionConfiguration(hero, spell, { spellLevel: "4" });
  assert.deepEqual(levelFour.spellComposer.level, { min: 1, max: 7, value: 4 });
  assert.equal(levelFour.spellComposer.estimatedDamage.formula, "6d6");
  assert.equal(levelFour.spellComposer.estimatedDamage.minimum, 6);
  assert.equal(levelFour.spellComposer.estimatedDamage.maximum, 36);
  assert.equal(levelFour.spellComposer.estimatedDamage.average, 21);
  const potent = resolveHudActionConfiguration(hero, spell, { spellLevel: "4", "spellModifier:increased-potency": "1" });
  assert.equal(potent.spellComposer.estimatedDamage.formula, "12d6");
  assert.equal(potent.spellComposer.estimatedDamage.average, 42);
});

test("an actor-owned spell's current level caps casting below its purchasable maximum", () => {
  const hero = actor({ system: { networkLinked: true, intelligence: 7, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 500, max: 500 } }, equipment: {} } });
  const spell = { id: "ranked-spell", isSpell: true, currentLevel: 10, maxLevel: 20, governingAttribute: "intelligence", baseSpellDamage: "attribute", spellDamagePerLevel: "1d4", actionCount: 1, traits: [], costs: { mana: 5 }, rankScaling: { enabled: true, min: 1, max: 20, manaPerRank: 5, staminaPerRank: 0, actionPerRank: 0 }, composer: [], enhancements: [], augments: [] };
  const levelTen = resolveHudActionConfiguration(hero, spell, {});
  assert.deepEqual(levelTen.spellComposer.level, { min: 1, max: 10, value: 10 });
  assert.equal(levelTen.damageOutcome.formula, "7 + 10d4");
  assert.equal(levelTen.costs.mana, 50);
  const levelEleven = resolveHudActionConfiguration(hero, spell, { spellLevel: "11" });
  assert.equal(levelEleven.valid, false);
  assert.ok(levelEleven.errors.includes("Spell level must be between 1 and 10."));
});

test("Focused Spell doubles current mana and raises the damage floor by half the range", () => {
  const hero = actor({ system: { networkLinked: true, intelligence: 7, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 100, max: 100 } }, equipment: {} } });
  const spell = { id: "focused-spell", isSpell: true, currentLevel: 1, maxLevel: 1, governingAttribute: "intelligence", baseSpellDamage: "attribute + 2d4", spellDamagePerLevel: "", actionCount: 1, traits: [], costs: { mana: 5 }, composer: [], enhancements: [], augments: [] };
  const focused = resolveHudActionConfiguration(hero, spell, { "spellModifier:focused": "1" });
  assert.equal(focused.costs.mana, 10);
  assert.equal(focused.breakdown.find(entry => entry.label === "Focused Spell").value, "Mana 5 × 2 = 10");
  assert.deepEqual(focused.damageOutcome, {
    available: true,
    formula: "7 + 2d4",
    average: 13.5,
    minimum: 12,
    maximum: 15,
    terms: [{ kind: "dice", label: "2d4" }, { kind: "attribute", label: "+ Intelligence (7)" }],
    baseSpellDamage: "attribute + 2d4",
    spellDamagePerLevel: "",
    level: 1,
    naturalMinimum: 9,
    focused: true
  });
  assert.equal(focused.damageFormula, "max(7 + 2d4, 12)");
  assert.equal(focused.spellComposer.outcome.focusedDamageFloor, 12);
});

test("Firebolt level 16 includes its base damage and dice beginning at level 1", () => {
  const hero = actor({ system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 100, max: 100 } }, equipment: {} } });
  const firebolt = { id: "firebolt", isSpell: true, currentLevel: 20, maxLevel: 20, baseSpellDamage: "1d4", spellDamagePerLevel: "1d4", actionCount: 1, traits: [], costs: { mana: 5 }, rankScaling: { enabled: true, min: 1, max: 20, manaPerRank: 5, staminaPerRank: 0, actionPerRank: 0 }, composer: [], enhancements: [], augments: [] };
  const resolved = resolveHudActionConfiguration(hero, firebolt, { spellLevel: "16" });
  assert.deepEqual(resolved.spellComposer.estimatedDamage, { available: true, formula: "17d4", average: 42.5, minimum: 17, maximum: 68, terms: [{ kind: "dice", label: "17d4" }], baseSpellDamage: "1d4", spellDamagePerLevel: "1d4", level: 16 });
  assert.equal(resolved.costs.mana, 80);
  assert.equal(resolved.breakdown.find(entry => entry.label === "Spell Level 16").value, "Mana 5 + (15 × 5) = 80");
  assert.deepEqual(resolved.breakdown.at(-1), { label: "Final Cost", value: "1 AP · 80 Mana", final: true });
  const levelTwoPotent = resolveHudActionConfiguration(hero, firebolt, { spellLevel: "2", "spellModifier:increased-potency": "1" });
  assert.equal(levelTwoPotent.costs.mana, 30, "level 2 mana is resolved to 10 before Increased Potency multiplies it by 3");
  assert.equal(levelTwoPotent.breakdown.find(entry => entry.label === "Increased Potency").value, "Mana 10 × 3 = 30");
  assert.deepEqual(levelTwoPotent.breakdown.at(-1), { label: "Final Cost", value: "1 AP · 30 Mana", final: true });
  const overBudget = resolveHudActionConfiguration(hero, firebolt, { spellLevel: "20" });
  assert.equal(overBudget.valid, true, "the actor can afford exactly 100 mana");
  const tooCostly = resolveHudActionConfiguration(hero, firebolt, { spellLevel: "20", "spellModifier:twinned": "1" });
  assert.equal(tooCostly.valid, false);
  assert.ok(tooCostly.errors.includes("Insufficient mana."));
  assert.deepEqual(projectedResourceCosts(hero, tooCostly), [{ key: "mana", before: 100, after: 0, cost: 400, affordable: false, shortfall: 300 }]);
});

test("extended spell is limited to summoning and subtle bypasses silence", () => {
  const silenced = actor({ effects: [{ id: "silenced", disabled: false }], system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 100, max: 100 } }, equipment: {} } });
  const spell = { id: "spell", isSpell: true, actionCount: 1, traits: [], costs: { mana: 2 }, composer: [], enhancements: [], augments: [] };
  assert.equal(resolveHudActionConfiguration(silenced, spell, {}).valid, false);
  assert.equal(resolveHudActionConfiguration(silenced, spell, { "spellModifier:subtle": "1" }).valid, true);
  assert.equal(resolveHudActionConfiguration(silenced, spell, { "spellModifier:extended": "1", "spellModifier:subtle": "1" }).valid, false);
  assert.equal(resolveHudActionConfiguration(silenced, spell, {}).spellComposer.modifiers.some(modifier => modifier.id === "extended"), false);
  assert.equal(resolveHudActionConfiguration(silenced, { ...spell, traits: ["summoning"] }, {}).spellComposer.modifiers.some(modifier => modifier.id === "extended"), true);
});

test("delayed and conservative spell reductions compound iteratively", () => {
  const hero = actor({ system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 100, max: 100 } }, equipment: {} } });
  const spell = { id: "discount-spell", isSpell: true, actionCount: 1, traits: [], costs: { mana: 100 }, composer: [], enhancements: [], augments: [] };
  const resolved = resolveHudActionConfiguration(hero, spell, {
    "spellModifier:delayed": "2",
    "spellModifier:conservative": "2"
  });
  assert.equal(resolved.valid, true);
  assert.equal(resolved.costs.mana, 31.64);
  assert.equal(resolved.actionCount, 3);
  assert.equal(resolved.spellComposer.outcome.delayTurns, 2);
  assert.equal(resolved.spellComposer.outcome.conservativeStacks, 2);
  assert.equal(resolved.breakdown.find(entry => entry.label === "Delayed Spell").value, "Mana 100 × 75%^2 = 56.25 · 2 turns delayed");
  assert.equal(resolved.breakdown.find(entry => entry.label === "Conservative Spell").value, "Mana 56.25 × 75%^2 = 31.64 · +2 AP");
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

test("undo restores the last successful HUD action", async () => {
  const hero = actor();
  const apply = (document, changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split(".");
      let target = document;
      while (keys.length > 1) target = target[keys.shift()] ??= {};
      target[keys[0]] = value;
    }
  };
  const combatant = {
    id: "c1", actor: hero, isOwner: true,
    flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } },
    update: async changes => { apply(combatant, changes); return combatant; }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  globalThis.game.combat = combat;
  const action = { id: "test-undo", name: "Undo Test", sourceType: "definition", source: { execute: async () => true }, costs: { mana: 3 }, actionCount: 0, actionType: "free", traits: [], composer: [], enhancements: [], augments: [] };
  assert.equal((await executeHudAction(hero, action)).success, true);
  assert.equal(hero.system.resources.mana.value, 7);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo.actionName, "Undo Test");
  const result = await undoLastHudAction(hero, combat);
  assert.equal(result.success, true);
  assert.equal(hero.system.resources.mana.value, 10);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo, null);
  delete globalThis.game.combat;
});

test("a player can undo every successful action from the current turn", async () => {
  const hero = actor();
  const apply = (document, changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split(".");
      let target = document;
      while (keys.length > 1) target = target[keys.shift()] ??= {};
      target[keys[0]] = value;
    }
  };
  const combatant = {
    id: "c1", actor: hero, isOwner: true,
    flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } },
    update: async changes => { apply(combatant, changes); return combatant; }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  globalThis.game.combat = combat;
  const action = { id: "turn-action", name: "Turn Action", sourceType: "definition", source: { execute: async () => true }, costs: { mana: 2 }, actionCount: 0, actionType: "free", traits: [], composer: [], enhancements: [], augments: [] };
  assert.equal((await executeHudAction(hero, action)).success, true);
  assert.equal((await executeHudAction(hero, action)).success, true);
  assert.equal(hero.system.resources.mana.value, 6);
  assert.equal(combatant.flags.Veilrunner.actionHud.undoHistory.length, 2);
  assert.equal((await undoLastHudAction(hero, combat)).success, true);
  assert.equal(hero.system.resources.mana.value, 8);
  assert.equal(combatant.flags.Veilrunner.actionHud.undoHistory.length, 1);
  assert.equal((await undoLastHudAction(hero, combat)).success, true);
  assert.equal(hero.system.resources.mana.value, 10);
  assert.equal(combatant.flags.Veilrunner.actionHud.undoHistory.length, 0);
  assert.equal(combatant.flags.Veilrunner.actionHud.undo, null);
  delete globalThis.game.combat;
});

test("history rewind restores every action through the selected moment and affected targets", async () => {
  const hero = actor();
  const target = actor({ id: "target", uuid: "Actor.target", name: "Target", system: { resources: { health: { value: 10, max: 10 } } } });
  const apply = (document, changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split(".");
      let subject = document;
      while (keys.length > 1) subject = subject[keys.shift()] ??= {};
      const key = keys[0];
      if (key.startsWith("-=")) delete subject[key.slice(2)];
      else subject[key] = value;
    }
  };
  const combatant = {
    id: "c1", actor: hero, isOwner: true,
    flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } },
    update: async changes => { apply(combatant, changes); return combatant; }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  globalThis.game.combat = combat;
  globalThis.game.user.targets = new Set([{ actor: target }]);
  const first = { id: "history-one", name: "First Action", sourceType: "definition", source: { execute: async () => { await target.update({ "system.resources.health.value": 4 }); return true; } }, costs: { mana: 2 }, actionCount: 0, actionType: "free", traits: [], composer: [], enhancements: [], augments: [] };
  const second = { id: "history-two", name: "Second Action", sourceType: "definition", source: { execute: async () => true }, costs: { mana: 3 }, actionCount: 0, actionType: "free", traits: [], composer: [], enhancements: [], augments: [] };
  assert.equal((await executeHudAction(hero, first)).success, true);
  assert.equal((await executeHudAction(hero, second)).success, true);
  assert.equal(hero.system.resources.mana.value, 5);
  assert.equal(target.system.resources.health.value, 4);
  const view = buildHudProjection(hero);
  assert.deepEqual(view.economy.undo.entries.map(entry => entry.actionName), ["Second Action", "First Action"]);
  const result = await undoHudActionsThrough(hero, 0, combat);
  assert.equal(result.success, true);
  assert.equal(result.count, 2);
  assert.deepEqual(result.undone, ["Second Action", "First Action"]);
  assert.equal(hero.system.resources.mana.value, 10);
  assert.equal(target.system.resources.health.value, 10);
  assert.equal(combatant.flags.Veilrunner.actionHud.undoHistory.length, 0);
  globalThis.game.user.targets = new Set();
  delete globalThis.game.combat;
});

test("equipping and unequipping each cost one action point and remain undoable", async () => {
  const weapon = { id: "sidearm", name: "Sidearm", type: "weapon", parent: { id: "hero" }, system: { requiredSlots: ["mainHand"], rules: [] } };
  const hero = actor({ items: collection([weapon]), system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 } }, equipment: {} } });
  const apply = (document, changes) => {
    for (const [path, value] of Object.entries(changes)) {
      const keys = path.split(".");
      let target = document;
      while (keys.length > 1) target = target[keys.shift()] ??= {};
      const key = keys[0];
      if (key.startsWith("-=")) delete target[key.slice(2)];
      else target[key] = value;
    }
  };
  const combatant = {
    id: "c1", actor: hero, isOwner: true,
    flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } },
    update: async changes => { apply(combatant, changes); return combatant; }
  };
  const combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  globalThis.game.combat = combat;
  assert.equal(await equipPhysicalItem(hero, weapon), true);
  assert.equal(hero.system.equipment.mainHand, weapon.id);
  assert.equal(getCombatEconomy(hero, combat).actions, 3);
  assert.equal(await unequipPhysicalItem(hero, weapon), true);
  assert.equal(hero.system.equipment.mainHand ?? "", "");
  assert.equal(getCombatEconomy(hero, combat).actions, 2);
  assert.equal((await undoLastHudAction(hero, combat)).success, true);
  assert.equal(hero.system.equipment.mainHand, weapon.id);
  assert.equal(getCombatEconomy(hero, combat).actions, 3);
  assert.equal((await undoLastHudAction(hero, combat)).success, true);
  assert.equal(hero.system.equipment.mainHand ?? "", "");
  assert.equal(getCombatEconomy(hero, combat).actions, 4);
  delete globalThis.game.combat;
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

test("HUD projection marks magic actions as spells and builds footer trackers", () => {
  const magic = { id: "firebolt", name: "Firebolt", img: "fire.webp", type: "action", documentName: "Item", system: { category: "magic", damageType: "pyro", actions: 1, resourceCosts: { mana: 1 }, traits: [] } };
  const hero = actor({ items: collection([magic]), system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: {}, assetLinks: [] } });
  magic.parent = hero;
  const combatant = { id: "c1", actor: hero, flags: { Veilrunner: { actionHud: { economy: { actions: 3, reactions: 1 } } } } };
  globalThis.game.combat = { id: "combat", round: 1, combatant, combatants: [combatant] };
  const view = buildHudProjection(hero);
  assert.equal(view.allActions.find(action => action.id === "firebolt").isSpell, true);
  assert.equal(view.allActions.find(action => action.id === "firebolt").damageIcon, "fa-solid fa-fire");
  assert.equal(view.economy.movement, 8);
  assert.equal(view.economy.movementTrack.maximumMeters, 8);
  assert.equal(view.economy.movementTrack.boxes.length, 4);
  assert.deepEqual(view.economy.actionHexes.map(hex => hex.filled), [true, true, true, false]);
  assert.deepEqual(view.economy.reactionHexes.map(hex => hex.filled), [true]);
  delete globalThis.game.combat;
});

test("actions can be prepared with composer choices and multiple target context", async () => {
  delete userFlags["actionHud.preferences"];
  const spell = { id: "planned-spell", name: "Planned Spell", img: "spell.webp", type: "action", documentName: "Item", system: { category: "magic", actions: 1, resourceCosts: { mana: 1 }, traits: [] } };
  const hero = actor({ items: collection([spell]), system: { networkLinked: true, attributes: { physical: { agility: 20, reaction: 12 } }, resources: { mana: { value: 10, max: 10 }, health: { value: 6, max: 10 } }, equipment: {}, assetLinks: [] } });
  spell.parent = hero;
  const enemyOne = actor({ id: "enemy-1", name: "Enemy One", img: "one.webp", isOwner: false });
  const enemyTwo = actor({ id: "enemy-2", name: "Enemy Two", img: "two.webp", isOwner: false });
  const targets = [
    { document: { uuid: "Scene.scene.Token.enemy-1" }, actor: enemyOne },
    { document: { uuid: "Scene.scene.Token.enemy-2" }, actor: enemyTwo }
  ];
  globalThis.game.user.targets = new Set(targets);
  const combatant = { id: "c1", actor: hero, flags: { Veilrunner: { actionHud: { economy: { key: "combat:1:c1", actions: 4, reactions: 1, attacks: 0 } } } } };
  globalThis.game.combat = { id: "combat", round: 1, combatant, combatants: [combatant], flags: {} };
  await prepareHudAction(hero, spell.id, { spellLevel: "3" });
  const preferences = getHudPreferences(hero);
  assert.equal(preferences.prepared.length, 1);
  assert.equal(preferences.prepared[0].combatId, "combat");
  assert.deepEqual(preferences.prepared[0].selections, { spellLevel: "3" });
  const view = buildHudProjection(hero);
  assert.equal(view.target.multiple, true);
  assert.equal(view.target.count, 2);
  assert.deepEqual(view.target.selectedActors.map(entry => entry.name), ["Enemy One", "Enemy Two"]);
  assert.equal(view.prepared[0].plannedTargetCount, 2);
  assert.equal(view.prepared[0].targetsMatch, true);
  await removePreparedHudAction(hero, preferences.prepared[0].id);
  assert.equal(getHudPreferences(hero).prepared.length, 0);
  globalThis.game.user.targets = new Set();
  delete globalThis.game.combat;
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
