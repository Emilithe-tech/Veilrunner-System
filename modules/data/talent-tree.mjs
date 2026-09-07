import { currentProgressionCatalog } from "./progression/catalog-provider.mjs";

export const TALENT_TREE_CANVAS = Object.freeze({ width: 3840, height: 2160, margin: 60 });
export const TALENT_TREE_LAYOUT_VERSION = 10;
const clone = value => structuredClone(value);

export function clampTalentTreePoint(x, y) {
  return {
    x: Math.max(TALENT_TREE_CANVAS.margin, Math.min(TALENT_TREE_CANVAS.width - TALENT_TREE_CANVAS.margin, Math.round(Number(x) || 0))),
    y: Math.max(TALENT_TREE_CANVAS.margin, Math.min(TALENT_TREE_CANVAS.height - TALENT_TREE_CANVAS.margin, Math.round(Number(y) || 0)))
  };
}

export function talentTreeRingRadius(root, requested = 500) {
  const radius = Math.max(180, Math.min(3000, Number(requested) || 500));
  const maximum = Math.max(0, Math.min(
    Number(root?.x) - TALENT_TREE_CANVAS.margin,
    TALENT_TREE_CANVAS.width - TALENT_TREE_CANVAS.margin - Number(root?.x),
    Number(root?.y) - TALENT_TREE_CANVAS.margin,
    TALENT_TREE_CANVAS.height - TALENT_TREE_CANVAS.margin - Number(root?.y)
  ));
  return Math.min(radius, maximum);
}

export function skillPointCostForLevel(level) {
  return Math.max(1, Math.ceil(Math.max(1, Number(level) || 1) / 10));
}

export function talentTreePage(key) {
  const catalog = currentProgressionCatalog();
  if (!validPage(catalog[key])) throw new TypeError(`Canonical talent-tree page is unavailable: ${key}`);
  return clone(catalog[key]);
}

export function talentTreeCatalog() {
  return clone(currentProgressionCatalog());
}

export function talentTreeRoot(key) {
  const root = currentProgressionCatalog().roots?.[key];
  if (!root) throw new TypeError(`Canonical talent-tree root is unavailable: ${key}`);
  return clone(root);
}

function validPage(page) {
  return Array.isArray(page) && (page.length === 0 || page.every(school => Array.isArray(school?.practices)));
}

