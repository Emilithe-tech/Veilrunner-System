import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { TALENT_TREE_CANVAS } from "../modules/data/talent-tree.mjs";

const [controller, css] = await Promise.all([
  readFile(new URL("../modules/apps/character-creation.mjs", import.meta.url), "utf8"),
  readFile(new URL("../css/veilrunner.css", import.meta.url), "utf8")
]);

test("tree dimensions are provided by the configured canvas through CSS variables", () => {
  assert.ok(TALENT_TREE_CANVAS.width > 0);
  assert.ok(TALENT_TREE_CANVAS.height > 0);
  assert.match(controller, /--vr-tree-width:\$\{dimensions\.width\}px;--vr-tree-height:\$\{dimensions\.height\}px/);
  assert.match(css, /\.vr-cc-tree-world \{[^}]*width:\s*var\(--vr-tree-width\); height:\s*var\(--vr-tree-height\);/);
  assert.match(css, /\.vr-cc-tree-links \{[^}]*width:\s*var\(--vr-tree-width\); height:\s*var\(--vr-tree-height\);/);
  assert.doesNotMatch(css, /(?:width:\s*6200px|height:\s*2100px)/);
});

test("tree renderer uses shared CSS circuit-flow overlays instead of motion elements", () => {
  assert.doesNotMatch(controller, /animateMotion|vr-cc-tree-pulse-layer/);
  assert.match(controller, /vr-cc-tree-circuit-layer/);
  assert.match(css, /\.vr-cc-tree-circuit-flow \{[^}]*animation:\s*vr-cc-tree-circuit-flow 1\.8s linear infinite;/);
  assert.match(css, /@keyframes vr-cc-tree-circuit-flow \{ to \{ stroke-dashoffset: -28px; \} \}/);
  assert.doesNotMatch(css, /\.vr-cc-tree-circuit-flow \{[^}]*filter:/);
});
