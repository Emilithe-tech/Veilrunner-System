function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort((left, right) => left.localeCompare(right))
      .map(key => [key, normalize(value[key])])
  );
}

export function stableJson(value) {
  return JSON.stringify(normalize(value));
}

function documentSummary(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = String(value._id ?? value.id ?? "").trim();
  const name = String(value.name ?? "").trim();
  const type = String(value.type ?? "").trim();
  return id || name || type ? { id, name, type } : null;
}

function indexedRows(rows) {
  const indexed = new Map();
  for (const [rawKey, value] of rows ?? []) {
    const key = String(rawKey);
    if (indexed.has(key)) throw new Error(`Duplicate decoded LevelDB key: ${key}`);
    indexed.set(key, { json: stableJson(value), value });
  }
  return indexed;
}

/** Compare already-decoded LevelDB rows without opening or writing a database. */
export function compareSnapshotRows(beforeRows = [], afterRows = []) {
  const before = indexedRows(beforeRows);
  const after = indexedRows(afterRows);
  const added = [];
  const deleted = [];
  const changed = [];

  for (const [key, entry] of before) {
    const next = after.get(key);
    if (!next) {
      deleted.push({ key, document: documentSummary(entry.value) });
      continue;
    }
    if (entry.json !== next.json) {
      changed.push({
        key,
        before: documentSummary(entry.value),
        after: documentSummary(next.value)
      });
    }
  }
  for (const [key, entry] of after) {
    if (!before.has(key)) added.push({ key, document: documentSummary(entry.value) });
  }

  const byKey = (left, right) => left.key.localeCompare(right.key);
  added.sort(byKey);
  deleted.sort(byKey);
  changed.sort(byKey);
  return {
    same: added.length === 0 && deleted.length === 0 && changed.length === 0,
    beforeRows: before.size,
    afterRows: after.size,
    added,
    deleted,
    changed
  };
}
