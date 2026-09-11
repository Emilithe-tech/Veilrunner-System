import assert from "node:assert/strict";
import test from "node:test";
import { runMigrationPlan } from "../modules/migration-plan.mjs";

test("migration plan runs only versions missing from the world", async () => {
  const ran = [];
  const saved = [];
  const migrations = [
    { version: 1, label: "one", migrate: async () => ran.push(1) },
    { version: 2, label: "two", migrate: async () => ran.push(2) },
    { version: 3, label: "three", migrate: async () => ran.push(3) }
  ];
  const version = await runMigrationPlan({ currentVersion: 1, migrations, saveVersion: async value => saved.push(value), log: () => {} });
  assert.equal(version, 3);
  assert.deepEqual(ran, [2, 3]);
  assert.deepEqual(saved, [2, 3]);
});

test("current schema version does not rerun migrations", async () => {
  let ran = false;
  const version = await runMigrationPlan({ currentVersion: 2, migrations: [{ version: 2, label: "current", migrate: async () => { ran = true; } }], saveVersion: async () => { throw new Error("must not save"); }, log: () => {} });
  assert.equal(version, 2);
  assert.equal(ran, false);
});

test("failed migration does not advance its schema version", async () => {
  const saved = [];
  await assert.rejects(() => runMigrationPlan({
    currentVersion: 1,
    migrations: [{ version: 2, label: "broken", migrate: async () => { throw new Error("boom"); } }],
    saveVersion: async value => saved.push(value),
    log: () => {}
  }), /boom/);
  assert.deepEqual(saved, []);
});

test("incomplete migration does not advance the schema or skip later work", async () => {
  const ran = [];
  const saved = [];
  const version = await runMigrationPlan({
    currentVersion: 1,
    migrations: [
      { version: 2, label: "waiting", migrate: async () => ({ ready: false }), isComplete: result => result.ready },
      { version: 3, label: "later", migrate: async () => ran.push(3) }
    ],
    saveVersion: async value => saved.push(value),
    log: () => {}
  });
  assert.equal(version, 1);
  assert.deepEqual(ran, []);
  assert.deepEqual(saved, []);
});
