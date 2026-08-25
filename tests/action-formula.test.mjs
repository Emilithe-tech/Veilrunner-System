import assert from "node:assert/strict";
import test from "node:test";

import {
  legacyActionDamageFormula,
  migrateActionSystemData,
  normalizeActionMode,
  resolveActionDamageFormula,
  resolveSpellDamageFormula,
  spellDamageFields
} from "../modules/data/item/action-formula.mjs";
import { actionMigrationUpdate } from "../modules/data/item/action-migration.mjs";

test("compact action modes normalize legacy action types", () => {
  assert.equal(normalizeActionMode({ actionType: "bonus" }), "action");
  assert.equal(normalizeActionMode({ actionType: "free" }), "ability");
  assert.equal(normalizeActionMode({ actionType: "reaction" }), "reaction");
  assert.equal(normalizeActionMode({ category: "tech" }), "digital");
  assert.equal(normalizeActionMode({}, "spell"), "spell");
});

test("action migration keeps abilities free and clamps paid actions", () => {
  assert.deepEqual(migrateActionSystemData({ actionType: "free", actions: 4 }), {
    actionType: "free", actions: 0, actionMode: "ability", activationKind: "ability", damageFormula: ""
  });
  assert.equal(migrateActionSystemData({ actionType: "bonus", actions: 12 }).actions, 7);
  assert.equal(migrateActionSystemData({ category: "digital", actions: 2 }).actionMode, "digital");
});

test("data-model migration leaves unrelated partial updates untouched", () => {
  assert.deepEqual(migrateActionSystemData({ favorite: true }, { complete: false }), { favorite: true });
  assert.deepEqual(migrateActionSystemData({ actionMode: "ability" }, { complete: false }), {
    actionMode: "ability", activationKind: "ability", actionType: "free", actions: 0
  });
});

test("persistent migration reads legacy source data and emits targeted updates", () => {
  const update = actionMigrationUpdate({
    id: "legacy-digital", type: "action",
    _source: { system: { category: "tech", actionType: "bonus", actions: 9, damageDice: 1, damageDie: 8, damageLevelInterval: 2 } }
  });
  assert.deepEqual(update, {
    _id: "legacy-digital",
    "system.actionMode": "digital",
    "system.activationKind": "action",
    "system.actionType": "standard",
    "system.category": "digital",
    "system.actions": 7,
    "system.damageFormula": "1d8 (every 2 levels)"
  });
});

test("legacy featured abilities migrate into the shared favorite field", () => {
  const update = actionMigrationUpdate({
    id: "legacy-ability", type: "ability",
    _source: { system: { featured: true, activationKind: "ability", actionType: "free", actions: 0 } }
  });
  assert.equal(update["system.actionMode"], "ability");
  assert.equal(update["system.favorite"], true);
  assert.equal(update["system.actions"], undefined, "already-free ability cost is not rewritten");
});

test("persistent migration enables level cost scaling for Skills and Spells", () => {
  for (const type of ["skill", "spell"]) {
    const update = actionMigrationUpdate({
      id: `legacy-${type}`, type,
      _source: { system: { actionMode: type === "spell" ? "spell" : "action", rankScaling: { enabled: false, manaPerRank: 2, staminaPerRank: 1 } } }
    });
    assert.equal(update["system.rankScaling.enabled"], true);
  }
});

test("legacy dice migrate without changing their level interval", () => {
  assert.equal(legacyActionDamageFormula({ damageDice: 2, damageDie: 6, damageLevelInterval: 3 }), "2d6 (every 3 levels)");
  assert.equal(resolveActionDamageFormula("2d6 (every 3 levels)", { level: 4 }).formula, "4d6");
});

test("smart spell formula scales dice and resolves the governing attribute", () => {
  const result = resolveActionDamageFormula("1d4 (per spell level) + attribute", {
    level: 4,
    attributeValue: 3,
    attributeLabel: "Intelligence"
  });
  assert.equal(result.formula, "4d4 + 3");
  assert.equal(result.average, 13);
  assert.deepEqual(result.terms, [
    { kind: "dice", label: "4d4" },
    { kind: "attribute", label: "+ Intelligence (3)" }
  ]);
});

test("spell damage combines one base application with per-level dice starting at level 1", () => {
  const result = resolveSpellDamageFormula({ baseSpellDamage: "1d6 + attribute", spellDamagePerLevel: "1d4" }, {
    level: 4,
    attributeValue: 3,
    attributeLabel: "Intelligence"
  });
  assert.equal(result.formula, "1d6 + 3 + 4d4");
  assert.equal(result.minimum, 8);
  assert.equal(result.maximum, 25);
  assert.equal(result.average, 16.5);
  assert.deepEqual(result.terms, [
    { kind: "dice", label: "1d6" },
    { kind: "attribute", label: "+ Intelligence (3)" },
    { kind: "dice", label: "4d4" }
  ]);
});

test("matching base and per-level dice collapse into one final die amount", () => {
  const result = resolveSpellDamageFormula({ baseSpellDamage: "1d4", spellDamagePerLevel: "1d4" }, { level: 16 });
  assert.equal(result.formula, "17d4");
  assert.equal(result.minimum, 17);
  assert.equal(result.maximum, 68);
  assert.equal(result.average, 42.5);
  assert.deepEqual(result.terms, [{ kind: "dice", label: "17d4" }]);
});

test("legacy combined spell damage separates fixed and per-level terms", () => {
  assert.deepEqual(spellDamageFields({ damageFormula: "1d4 (per spell level) + attribute" }), {
    baseSpellDamage: "attribute",
    spellDamagePerLevel: "1d4"
  });
  const migrated = migrateActionSystemData({ damageFormula: "1d4 (per spell level) + attribute" }, { itemType: "spell" });
  assert.equal(migrated.baseSpellDamage, "attribute");
  assert.equal(migrated.spellDamagePerLevel, "1d4");
});
