import path from "node:path";

function inside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/** Resolve a configured pack in either installed-system or flat backup layout. */
export function packDatabaseLocation(root, pack, { live = false } = {}) {
  const relative = live ? pack?.path : pack?.name;
  if (!relative || typeof relative !== "string") throw new TypeError(`Configured pack is missing its ${live ? "path" : "name"}.`);
  const resolvedRoot = path.resolve(root);
  const location = path.resolve(resolvedRoot, relative);
  if (!inside(location, resolvedRoot) || location === resolvedRoot) {
    throw new Error(`Configured pack location escapes its root: ${relative}`);
  }
  return location;
}
