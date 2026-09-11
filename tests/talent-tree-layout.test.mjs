import assert from "node:assert/strict";
import {
  TALENT_TREE_CANVAS,
  TALENT_TREE_LAYOUT_VERSION,
  VEILRUNNER_TALENT_TREE_ROOTS,
  VEILRUNNER_TALENT_TREES,
  clampTalentTreePoint,
  migrateTalentTreeCatalogLayout,
  migrateTalentTreeLayout,
  talentTreeRingRadius
} from "../modules/data/talent-tree.mjs";

const legacy = {
  layoutVersion: 6,
  roots: {
    skills: { id: "skills-root", name: "Skills", x: 5000, y: 3500, size: { preset: "large" }, custom: "root-data" },
    magic: { id: "magic-root", name: "Magic", x: 5000, y: 3500, size: { preset: "custom", width: 90, height: 100 } }
  },
  skills: [{
    id: "custom-school", name: "Custom School", x: 6000, y: 5000, color: "#123456", size: { preset: "large" }, authored: true,
    rootConnection: { bend: 25, pattern: "dashed" },
    practices: [{
      id: "custom-practice", name: "Custom Practice", x: 4200, y: 3000, size: { preset: "small" }, requires: [{ id: "other", line: { glow: 2 } }],
      spells: [{ id: "custom-skill", name: "Custom Skill", x: 4400, y: 3200, size: { preset: "standard" }, description: "Keep me", traits: ["custom"] }]
    }]
  }],
  magic: []
};

const migrated = migrateTalentTreeLayout(legacy);
assert.equal(migrated.layoutVersion, TALENT_TREE_LAYOUT_VERSION);
assert.deepEqual(migrated.roots.skills, { id: "skills-root", name: "Skills", x: 1920, y: 1080, size: { preset: "medium" }, custom: "root-data" });
assert.deepEqual(migrated.roots.magic, { id: "magic-root", name: "Magic", x: 1920, y: 1080, size: { preset: "custom", width: 90, height: 100 } });
assert.equal(migrated.skills[0].x, 2470);
assert.equal(migrated.skills[0].y, 1620);
assert.equal(migrated.skills[0].practices[0].x, 1480);
assert.equal(migrated.skills[0].practices[0].y, 900);
assert.equal(migrated.skills[0].practices[0].spells[0].x, 1590);
assert.equal(migrated.skills[0].practices[0].spells[0].y, 972);
assert.equal(migrated.skills[0].authored, true);
assert.equal(migrated.skills[0].size.preset, "medium");
assert.equal(migrated.skills[0].practices[0].size.preset, "small");
assert.equal(migrated.skills[0].practices[0].spells[0].size.preset, "medium");
assert.deepEqual(migrated.skills[0].rootConnection, legacy.skills[0].rootConnection);
assert.deepEqual(migrated.skills[0].practices[0].requires, legacy.skills[0].practices[0].requires);
assert.equal(migrated.skills[0].practices[0].spells[0].description, "Keep me");
assert.deepEqual(migrated.skills[0].practices[0].spells[0].traits, ["custom"]);
assert.deepEqual(migrateTalentTreeLayout(migrated), migrated, "version 10 migration must be idempotent");
assert.notStrictEqual(migrateTalentTreeLayout(migrated), migrated, "migration must return a defensive clone");

const nativeVersionSeven = migrateTalentTreeLayout({
  layoutVersion: 7,
  roots: {
    skills: { id: "skills-root", name: "Skills", x: 1700, y: 900 },
    magic: { id: "magic-root", name: "Magic", x: 2000, y: 1200 }
  },
  skills: [{
    id: "physical", name: "Physical", x: 640, y: 720, size: { preset: "large" },
    rootConnection: { waypoints: [{ id: "root-turn", x: 700, y: 760 }] },
    practices: [{
      id: "athletics", name: "Athletics", x: 820, y: 780,
      schoolConnection: { waypoints: [{ x: 740, y: 780 }] },
      spells: [{ id: "climb", name: "Climb", x: 980, y: 840, practiceConnection: { waypoints: [{ x: 900, y: 820 }] } }]
    }]
  }],
  magic: []
});
assert.deepEqual({ x: nativeVersionSeven.roots.skills.x, y: nativeVersionSeven.roots.skills.y }, { x: 1920, y: 1080 });
assert.deepEqual({ x: nativeVersionSeven.roots.magic.x, y: nativeVersionSeven.roots.magic.y }, { x: 1920, y: 1080 });
assert.deepEqual({ x: nativeVersionSeven.skills[0].x, y: nativeVersionSeven.skills[0].y }, { x: 860, y: 900 }, "version 7 nodes must translate by the root-centering delta without legacy scaling");
assert.deepEqual({ x: nativeVersionSeven.skills[0].practices[0].x, y: nativeVersionSeven.skills[0].practices[0].y }, { x: 1040, y: 960 });
assert.deepEqual({ x: nativeVersionSeven.skills[0].practices[0].spells[0].x, y: nativeVersionSeven.skills[0].practices[0].spells[0].y }, { x: 1200, y: 1020 });
assert.deepEqual(nativeVersionSeven.skills[0].rootConnection.waypoints[0], { id: "root-turn", x: 920, y: 940 });
assert.deepEqual(nativeVersionSeven.skills[0].practices[0].schoolConnection.waypoints[0], { x: 960, y: 960 });
assert.deepEqual(nativeVersionSeven.skills[0].practices[0].spells[0].practiceConnection.waypoints[0], { x: 1120, y: 1000 });
assert.equal(nativeVersionSeven.skills[0].size.preset, "medium");

const repairedVersionEight = migrateTalentTreeLayout({
  layoutVersion: 8,
  roots: {
    skills: { id: "skills-root", name: "Skills", x: 1920, y: 1080 },
    magic: { id: "magic-root", name: "Magic", x: 1920, y: 1080 }
  },
  skills: [
    { id: "physical", name: "Physical", x: 2600, y: 1260, rootConnection: { waypoints: [{ x: 2700, y: 1260 }] }, practices: [] },
    { id: "social", name: "Social", x: 2900, y: 1260, practices: [] }
  ],
  magic: []
});
assert.deepEqual({ x: repairedVersionEight.skills[0].x, y: repairedVersionEight.skills[0].y }, { x: 1770, y: 1080 });
assert.deepEqual({ x: repairedVersionEight.skills[1].x, y: repairedVersionEight.skills[1].y }, { x: 2070, y: 1080 });
assert.deepEqual(repairedVersionEight.skills[0].rootConnection.waypoints[0], { x: 1870, y: 1080 });
assert.deepEqual({ x: repairedVersionEight.roots.skills.x, y: repairedVersionEight.roots.skills.y }, { x: 1920, y: 1080 });

const repairedVersionNine = migrateTalentTreeLayout({
  layoutVersion: 9,
  roots: {
    skills: { id: "skills-root", name: "Skills", x: 1920, y: 1080 },
    magic: { id: "magic-root", name: "Magic", x: 1920, y: 1080 }
  },
  skills: [
    { id: "physical", name: "Physical", x: 2600, y: 1260, rootConnection: { waypoints: [{ x: 2700, y: 1260 }] }, practices: [] },
    { id: "social", name: "Social", x: 2900, y: 1260, practices: [] },
    {
      id: "authored-group", name: "Authored", authored: true, x: 3200, y: 1460, rootConnection: { waypoints: [{ x: 3100, y: 1360 }] },
      practices: [{ id: "authored-practice", name: "Custom", x: 3300, y: 1560, schoolConnection: { waypoints: [{ x: 3250, y: 1510 }] }, spells: [] }]
    }
  ],
  magic: []
});
assert.deepEqual({ x: repairedVersionNine.skills[0].x, y: repairedVersionNine.skills[0].y }, { x: 1770, y: 1080 });
assert.deepEqual({ x: repairedVersionNine.skills[2].x, y: repairedVersionNine.skills[2].y }, { x: 2370, y: 1280 });
assert.deepEqual(repairedVersionNine.skills[2].rootConnection.waypoints[0], { x: 2270, y: 1180 });
assert.deepEqual({ x: repairedVersionNine.skills[2].practices[0].x, y: repairedVersionNine.skills[2].practices[0].y }, { x: 2470, y: 1380 });
assert.deepEqual(repairedVersionNine.skills[2].practices[0].schoolConnection.waypoints[0], { x: 2420, y: 1330 });

const alreadyCenteredVersionNine = {
  layoutVersion: 9,
  roots: structuredClone(VEILRUNNER_TALENT_TREE_ROOTS),
  skills: structuredClone(VEILRUNNER_TALENT_TREES.skills),
  magic: structuredClone(VEILRUNNER_TALENT_TREES.magic)
};
const preservedVersionNine = migrateTalentTreeLayout(alreadyCenteredVersionNine);
assert.deepEqual(preservedVersionNine.skills, alreadyCenteredVersionNine.skills, "an already-correct version 9 Skills layout must not move");
assert.deepEqual(preservedVersionNine.magic, alreadyCenteredVersionNine.magic, "an already-correct version 9 Magic layout must not move");

const empty = migrateTalentTreeLayout({});
assert.equal(empty.layoutVersion, TALENT_TREE_LAYOUT_VERSION);
assert.deepEqual(empty.skills, VEILRUNNER_TALENT_TREES.skills);
assert.deepEqual(empty.magic, VEILRUNNER_TALENT_TREES.magic);
assert.deepEqual(empty.roots, VEILRUNNER_TALENT_TREE_ROOTS);

for (const page of [empty.skills, empty.magic]) {
  for (const school of page) {
    for (const node of [school, ...(school.practices ?? []).flatMap(practice => [practice, ...(practice.spells ?? [])])]) {
      assert.ok(node.x >= TALENT_TREE_CANVAS.margin && node.x <= TALENT_TREE_CANVAS.width - TALENT_TREE_CANVAS.margin);
      assert.ok(node.y >= TALENT_TREE_CANVAS.margin && node.y <= TALENT_TREE_CANVAS.height - TALENT_TREE_CANVAS.margin);
    }
  }
}

assert.deepEqual(clampTalentTreePoint(-100, 9999), { x: 60, y: 2100 });
assert.deepEqual(clampTalentTreePoint(125.7, 300.2), { x: 126, y: 300 });
assert.equal(talentTreeRingRadius({ x: 1920, y: 1080 }, 500), 500);
assert.equal(talentTreeRingRadius({ x: 200, y: 1080 }, 500), 140, "ring must stay inside the left canvas margin");

let persisted;
globalThis.game = {
  system: { id: "Veilrunner" },
  user: { isGM: true },
  settings: {
    get: () => legacy,
    set: async (_system, _key, value) => { persisted = value; return value; }
  }
};
globalThis.Hooks = { callAll: () => {} };
assert.deepEqual(await migrateTalentTreeCatalogLayout(), { migrated: true, from: 6, to: 10 });
assert.equal(persisted.layoutVersion, 10);
game.settings.get = () => persisted;
assert.deepEqual(await migrateTalentTreeCatalogLayout(), { migrated: false });

console.log("talent-tree native canvas layout checks passed");
