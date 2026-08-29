import test from "node:test";
import assert from "node:assert/strict";
import {
  TREE_EDITOR_HISTORY_LIMIT,
  TREE_NODE_SHAPES,
  TREE_PATH_STATE_ORDER,
  TREE_ZOOM,
  anchoredTreeViewport,
  clampTreeNodeCenter,
  compileSharedTreeRoutes,
  consolidateTreePathRecords,
  computeSmartTreeRing,
  isTreeEditorShortcutTarget,
  normalizeTreeEditorTool,
  normalizeTreeConnectionStyle,
  normalizeTreeNodeShape,
  normalizeTreeZoom,
  pushTreeEditorHistory,
  recordTreeEditorMutation,
  resolveTreeNodeSize,
  snapTreeWaypoint,
  treeConnectionPath,
  treeEditorCreationContext,
  treeNodeAlignmentTarget,
  treeWaypointInsertIndex
} from "../modules/apps/chargen/tree-editor-state.mjs";

test("tree editor tools are mutually normalized", () => {
  assert.equal(normalizeTreeEditorTool("select"), "select");
  assert.equal(normalizeTreeEditorTool("move"), "move");
  assert.equal(normalizeTreeEditorTool("connect"), "connect");
  assert.equal(normalizeTreeEditorTool("legacy-mode"), "select");
});

test("tree editor history retains only the latest fifty entries", () => {
  let history = [];
  for (let index = 0; index < TREE_EDITOR_HISTORY_LIMIT + 7; index += 1) history = pushTreeEditorHistory(history, { index });
  assert.equal(history.length, 50);
  assert.equal(history[0].index, 7);
  assert.equal(history.at(-1).index, 56);
});

test("a new editor mutation invalidates redo history", () => {
  const history = recordTreeEditorMutation({ undo: [{ index: 1 }], redo: [{ index: 2 }], entry: { index: 3 } });
  assert.deepEqual(history.undo.map(entry => entry.index), [1, 3]);
  assert.deepEqual(history.redo, []);
});

test("new node context uses viewport center and selected parents", () => {
  const canvas = { width: 3840, height: 2160, margin: 60 };
  assert.deepEqual(treeEditorCreationContext({ selection: { kind: "school", id: "combat" }, center: { x: 900, y: 700 }, canvas }), {
    nodeKind: "practice", schoolId: "combat", practiceId: "", x: 900, y: 700
  });
  assert.deepEqual(treeEditorCreationContext({ selection: { kind: "practice", id: "blades", schoolId: "combat" }, center: { x: 1000, y: 800 }, canvas }), {
    nodeKind: "spell", schoolId: "combat", practiceId: "blades", x: 1000, y: 800
  });
  assert.deepEqual(treeEditorCreationContext({ openPractice: { kind: "practice", id: "blades", schoolId: "combat" }, center: { x: -40, y: 9999 }, canvas }), {
    nodeKind: "spell", schoolId: "combat", practiceId: "blades", x: 60, y: 2100
  });
});

test("new nodes without applicable context become Schools", () => {
  const context = treeEditorCreationContext({ page: "magic", center: { x: 1920, y: 1080 } });
  assert.equal(context.nodeKind, "school");
  assert.equal(context.page, "magic");
  assert.equal(context.x, 1920);
  assert.equal(context.y, 1080);
});

test("editor shortcuts ignore form and rich-text targets", () => {
  assert.equal(isTreeEditorShortcutTarget({ tagName: "INPUT" }), true);
  assert.equal(isTreeEditorShortcutTarget({ tagName: "textarea" }), true);
  assert.equal(isTreeEditorShortcutTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTreeEditorShortcutTarget({ tagName: "BUTTON", closest: () => null }), false);
});

test("node appearance supports the expanded shapes and bounded sizes", () => {
  assert.equal(TREE_NODE_SHAPES.length, 10);
  assert.equal(normalizeTreeNodeShape("shield"), "shield");
  assert.equal(normalizeTreeNodeShape("unknown", "hex"), "hex");
  assert.deepEqual(resolveTreeNodeSize("root", {}), { preset: "medium", width: 78, height: 78 });
  assert.deepEqual(resolveTreeNodeSize("root", { preset: "standard" }), { preset: "medium", width: 78, height: 78 });
  assert.deepEqual(resolveTreeNodeSize("practice", { preset: "custom", width: 12, height: 500 }), { preset: "custom", width: 40, height: 320 });
  assert.equal(resolveTreeNodeSize("spell", { preset: "wide" }).width, 98);
  for (const kind of ["root", "school", "practice", "spell"]) {
    const medium = resolveTreeNodeSize(kind, { preset: "medium" });
    const small = resolveTreeNodeSize(kind, { preset: "small" });
    const large = resolveTreeNodeSize(kind, { preset: "large" });
    const wide = resolveTreeNodeSize(kind, { preset: "wide" });
    assert.ok(small.width < medium.width && small.height < medium.height);
    assert.ok(large.width > medium.width && large.height > medium.height);
    assert.ok(wide.width > medium.width);
  }
  assert.deepEqual(clampTreeNodeCenter({ x: 0, y: 9999, width: 320, height: 40, bounds: { width: 3840, height: 2160, margin: 60 } }), { x: 220, y: 2080 });
});

test("anchored zoom preserves the world point under the viewport focus", () => {
  assert.deepEqual(anchoredTreeViewport({ left: 1200, top: 600, anchorX: 400, anchorY: 300, fromZoom: 1.2, toZoom: 1.8 }), { left: 2000, top: 1050 });
  assert.deepEqual(anchoredTreeViewport({ left: 2000, top: 1050, anchorX: 400, anchorY: 300, fromZoom: 1.8, toZoom: 1.2 }), { left: 1200, top: 600 });
});

test("tree zoom uses exact shared bounds and five-percent increments", () => {
  assert.deepEqual(TREE_ZOOM, { minimum: .35, initial: 1.2, maximum: 3, step: .05, controlStep: .1 });
  assert.equal(normalizeTreeZoom(.99), 1);
  assert.equal(normalizeTreeZoom(1.573), 1.55);
  assert.equal(normalizeTreeZoom(4), 3);
  assert.equal(normalizeTreeZoom(.1), .35);
  assert.equal(normalizeTreeZoom("invalid"), 1.2);
});

test("node alignment can preserve the first selected node as its axis anchor", () => {
  const nodes = [{ x: 420, y: 180 }, { x: 100, y: 600 }, { x: 800, y: 300 }];
  assert.equal(treeNodeAlignmentTarget(nodes, "x", true), 420);
  assert.equal(treeNodeAlignmentTarget(nodes, "y", true), 180);
  assert.equal(treeNodeAlignmentTarget(nodes, "x", false), 440);
  assert.equal(treeNodeAlignmentTarget(nodes, "y", false), 360);
});

test("connection routing covers linear, curved, rounded, and square paths", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 100 };
  assert.equal(treeConnectionPath(start, end, { route: "linear" }), "M 0 0 L 200 100");
  assert.match(treeConnectionPath(start, end, { route: "curved", bend: 50 }), / C /);
  assert.match(treeConnectionPath(start, end, { route: "rounded", cornerRadius: 24 }), / Q /);
  assert.match(treeConnectionPath(start, end, { route: "rounded", cornerRadius: 24, flip: true }), /L 0 26 Q 0 50 24 50/);
  assert.match(treeConnectionPath(start, end, { route: "square" }), / L 100 0 L 100 100 /);
  assert.equal(normalizeTreeConnectionStyle({ bend: 20 }).route, "curved");
});

test("rounded connections stay smooth when the corner radius exceeds a short segment", () => {
  assert.equal(
    treeConnectionPath({ x: 0, y: 0 }, { x: 200, y: 20 }, { route: "rounded", cornerRadius: 160 }),
    "M 0 0 L 90 0 Q 100 0 100 10 L 100 10 Q 100 20 110 20 L 200 20"
  );
  assert.equal(
    treeConnectionPath({ x: 0, y: 40 }, { x: 200, y: 40 }, { route: "rounded", cornerRadius: 80 }),
    "M 0 40 L 200 40"
  );
});

test("manual waypoints take precedence and support free-angle rounded routes", () => {
  const start = { x: 0, y: 0 };
  const end = { x: 200, y: 100 };
  assert.equal(
    treeConnectionPath(start, end, { route: "linear", waypoints: [{ x: 40, y: 70 }, { x: 150, y: 20 }] }),
    "M 0 0 L 40 70 L 150 20 L 200 100"
  );
  const rounded = treeConnectionPath(start, end, { route: "rounded", cornerRadius: 12, waypoints: [{ x: 40, y: 70 }, { x: 150, y: 20 }] });
  assert.match(rounded, /^M 0 0 L .* Q 40 70 .* Q 150 20 .* L 200 100$/);
  assert.deepEqual(normalizeTreeConnectionStyle({ waypoints: [{ x: "12", y: 30 }, { x: "bad", y: 2 }] }).waypoints, [{ x: 12, y: 30 }]);
});

test("extended waypoints preserve junction ids, axis locks, and visual start references", () => {
  const normalized = normalizeTreeConnectionStyle({
    waypoints: [{ id: "junction-a", x: "12", y: 30, lockX: true, lockY: false }],
    startJunction: { parentConnectionKey: "practice:a->spell:b", waypointId: "junction-a" }
  });
  assert.deepEqual(normalized.waypoints, [{ id: "junction-a", x: 12, y: 30, lockX: true }]);
  assert.deepEqual(normalized.startJunction, { parentConnectionKey: "practice:a->spell:b", waypointId: "junction-a" });
  assert.equal(normalizeTreeConnectionStyle({ startJunction: { parentConnectionKey: "", waypointId: "x" } }).startJunction, undefined);
});

test("waypoint snapping honors priority, locks, and Alt bypass", () => {
  const candidates = {
    x: [{ value: 102, priority: 2, label: "segment" }, { value: 105, priority: 0, label: "node" }],
    y: [{ value: 198, priority: 1, label: "waypoint" }]
  };
  const snapped = snapTreeWaypoint({ point: { x: 100, y: 200 }, origin: { x: 50, y: 60 }, candidates, threshold: 8 });
  assert.equal(snapped.x, 105);
  assert.equal(snapped.y, 198);
  assert.equal(snapped.snapX.label, "node");
  assert.equal(snapped.snapY.label, "waypoint");
  assert.deepEqual(snapTreeWaypoint({ point: { x: 100, y: 200 }, origin: { x: 50, y: 60 }, lockX: true, lockY: true, candidates, threshold: 8 }), {
    x: 50, y: 60, snapX: null, snapY: null
  });
  assert.deepEqual(snapTreeWaypoint({ point: { x: 100, y: 200 }, origin: { x: 50, y: 60 }, candidates, threshold: 8, bypass: true }), {
    x: 100, y: 200, snapX: null, snapY: null
  });
});

test("waypoints insert on the nearest controlled segment", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
  assert.equal(treeWaypointInsertIndex(points, { x: 40, y: 5 }), 0);
  assert.equal(treeWaypointInsertIndex(points, { x: 95, y: 70 }), 1);
});

test("identical connection geometry renders once using the strongest state", () => {
  assert.deepEqual(TREE_PATH_STATE_ORDER, ["blocked", "available", "active"]);
  const records = [
    { id: "blocked", path: "M 0 0 L 100 100", state: "blocked" },
    { id: "available", path: "M 0 0 L 100 100", state: "available" },
    { id: "active", path: "M 0 0 L 100 100", state: "active" },
    { id: "other", path: "M 0 0 L 100 101", state: "blocked" }
  ];
  const consolidated = consolidateTreePathRecords(records);
  assert.equal(consolidated.length, 2);
  assert.equal(consolidated.find(record => record.path.endsWith("100 100")).id, "active");
});

test("shared rounded trunks use one adaptive downstream geometry", () => {
  const line = { route: "rounded", cornerRadius: 40, waypoints: [{ x: 0, y: 0 }, { x: 0, y: 100 }] };
  const compiled = compileSharedTreeRoutes([
    { id: "long", start: { x: -100, y: 0 }, end: { x: 100, y: 100 }, line, state: "available" },
    { id: "short", start: { x: -20, y: 0 }, end: { x: 100, y: 100 }, line, state: "active" }
  ]);
  assert.deepEqual(compiled.logical.map(route => route.effectiveCornerRadii[0]), [10, 10]);
  assert.equal(compiled.fragments.filter(fragment => fragment.path === "M 0,10 L 0,60").length, 1);
  assert.equal(compiled.fragments.find(fragment => fragment.path === "M 0,10 L 0,60").state, "active");
  const partial = compileSharedTreeRoutes([
    { id: "upper", start: { x: -100, y: 0 }, end: { x: 100, y: 100 }, line, state: "available" },
    { id: "lower", start: { x: -20, y: 40 }, end: { x: 100, y: 100 }, line: { ...line, waypoints: [{ x: 0, y: 40 }, { x: 0, y: 100 }] }, state: "active" }
  ]);
  assert.equal(partial.fragments.filter(fragment => fragment.path === "M 0,50 L 0,70").length, 1);
  assert.equal(partial.fragments.find(fragment => fragment.path === "M 0,50 L 0,70").state, "active");
  const compact = compileSharedTreeRoutes([{ start: { x: -100, y: 0 }, end: { x: 100, y: 20 }, line: { ...line, waypoints: [{ x: 0, y: 0 }, { x: 0, y: 20 }] }, state: "available" }]);
  assert.ok(compact.logical[0].effectiveCornerRadii.every(radius => radius <= 10));
});

test("connection fragments retain a continuous deterministic pulse phase", () => {
  const compiled = compileSharedTreeRoutes([{
    id: "active-route",
    start: { x: 0, y: 0 },
    end: { x: 200, y: 100 },
    line: { route: "rounded", cornerRadius: 20, waypoints: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
    state: "active"
  }]);
  const phases = compiled.fragments.map(fragment => fragment.pulsePhase);
  assert.equal(phases[0], 0);
  assert.ok(phases.every((phase, index) => index === 0 || phase > phases[index - 1]));
  assert.ok(compiled.logical[0].pulseLength > 200, "the complete logical route exposes its travel length for one continuous bead");

  const shared = compileSharedTreeRoutes([
    { id: "available", start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, line: { route: "square", waypoints: [{ x: 100, y: 0 }] }, state: "available" },
    { id: "active", start: { x: 50, y: 0 }, end: { x: 200, y: 0 }, line: { route: "square", waypoints: [{ x: 100, y: 0 }] }, state: "active" }
  ]);
  const trunk = shared.fragments.find(fragment => fragment.path === "M 100,0 L 200,0");
  assert.equal(trunk.state, "active");
  assert.equal(trunk.pulsePhase, 50);
  assert.equal(shared.fragments.filter(fragment => fragment.path === "M 100,0 L 200,0").length, 1);

  const reversed = consolidateTreePathRecords([
    { id: "forward", kind: "line", segmentStart: { x: 0, y: 0 }, segmentEnd: { x: 100, y: 0 }, path: "M 0,0 L 100,0", state: "active", pulsePhase: 0 },
    { id: "reverse", kind: "line", segmentStart: { x: 100, y: 0 }, segmentEnd: { x: 0, y: 0 }, path: "M 100,0 L 0,0", state: "active", pulsePhase: 100 }
  ]);
  assert.equal(reversed.length, 1, "reversed shared line geometry must not stack duplicate pulses");
  assert.equal(reversed[0].id, "forward", "equal-state shared geometry uses stable route order");
});

test("smart ring produces stable named placements on a true circle", () => {
  const nodes = [
    { id: "a", x: 500, y: 400, width: 60, height: 60 },
    { id: "b", x: 600, y: 500, width: 60, height: 60 },
    { id: "c", x: 400, y: 500, width: 60, height: 60 }
  ];
  const first = computeSmartTreeRing({ nodes, anchor: { id: "root", x: 500, y: 500 }, requestedRadius: 180, bounds: { width: 1000, height: 1000, margin: 60 } });
  assert.equal(first.valid, true);
  assert.equal(first.placements.filter(node => !node.carried).length, 3);
  for (const node of first.placements) assert.ok(Math.abs(Math.hypot(node.x - 500, node.y - 500) - first.effectiveRadius) < 1);
  const second = computeSmartTreeRing({ nodes, anchor: { id: "root", x: 500, y: 500 }, requestedRadius: 200, assignment: first.assignment, bounds: { width: 1000, height: 1000, margin: 60 } });
  assert.deepEqual(second.assignment, first.assignment);
});

test("smart ring expands for collisions, carries children, and blocks impossible bounds", () => {
  const nodes = [
    { id: "a", x: 500, y: 500, width: 260, height: 260, children: [{ id: "leaf", x: 540, y: 540, width: 40, height: 40 }] },
    { id: "b", x: 520, y: 500, width: 260, height: 260 },
    { id: "c", x: 510, y: 520, width: 260, height: 260 },
    { id: "d", x: 490, y: 520, width: 260, height: 260 }
  ];
  const layout = computeSmartTreeRing({ nodes, anchor: { id: "root", x: 500, y: 500 }, requestedRadius: 180, bounds: { width: 1200, height: 1200, margin: 60 } });
  assert.ok(layout.effectiveRadius > 180);
  assert.equal(layout.placements.some(node => node.id === "leaf" && node.carried), true);
  const impossible = computeSmartTreeRing({ nodes, anchor: { id: "root", x: 100, y: 100 }, requestedRadius: 180, bounds: { width: 400, height: 400, margin: 60 } });
  assert.equal(impossible.valid, false);
  assert.ok(impossible.minimumSafeRadius > impossible.maximumAvailableRadius);
  assert.ok(impossible.issues.length);
});
