const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function systemSource(definition) {
  const system = definition?.system ?? definition ?? {};
  if (typeof system?.toObject === "function") return system.toObject();
  return clone(system);
}

function pathParts(path) {
  const parts = String(path ?? "").replace(/^system\./, "").split(".").filter(Boolean);
  return parts.length && parts.every(part => SAFE_PATH_PART.test(part) && !["__proto__", "prototype", "constructor"].includes(part)) ? parts : [];
}

function getPath(object, path) {
  return pathParts(path).reduce((value, part) => value?.[part], object);
}

function setPath(object, path, value) {
  const parts = pathParts(path);
  if (!parts.length) return false;
  const last = parts.pop();
  const target = parts.reduce((entry, part) => entry[part] ??= {}, object);
  target[last] = value;
  return true;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function occurrenceCount(entry, level) {
  const start = Math.max(1, Math.trunc(finite(entry.level, 1)));
  if (level < start) return 0;
  if (entry.kind === "milestone") return 1;
  const interval = Math.max(1, Math.trunc(finite(entry.interval, 1)));
  return Math.floor((level - start) / interval) + 1;
}

function scaledValue(value, count) {
  if (typeof value === "number") return value * count;
  const source = String(value ?? "").trim();
  if (!source) return "";
  const numeric = Number(source);
  if (Number.isFinite(numeric)) return numeric * count;
  const dice = source.match(/^([+-]?\d*)d(\d+)$/i);
  if (dice) {
    const amount = dice[1] === "" || dice[1] === "+" ? 1 : dice[1] === "-" ? -1 : Number(dice[1]);
    return `${amount * count}d${dice[2]}`;
  }
  return Array.from({ length: count }, () => source).join(" + ");
}

function addValue(before, value) {
  if (value === "" || value === undefined || value === null) return before;
  if (before === undefined || before === null || before === "") return clone(value);
  if (Array.isArray(before)) return [...before, ...(Array.isArray(value) ? value : [value])];
  if (typeof before === "number" && typeof value === "number") return before + value;
  return `${before} + ${value}`;
}

function applyScalingEntry(system, entry, count) {
  const selector = String(entry.selector ?? "");
  const before = clone(getPath(system, selector));
  const mode = String(entry.mode ?? "add");
  const value = scaledValue(entry.value, count);
  let after;
  if (mode === "multiply") after = finite(before, 0) * (finite(entry.value, 1) ** count);
  else if (mode === "override") after = clone(entry.value);
  else if (mode === "append" || mode === "grant") after = addValue(Array.isArray(before) ? before : before === undefined ? [] : [before], value);
  else after = addValue(before, value);
  if (!setPath(system, selector, after)) return null;
  return Object.freeze({
    id: String(entry.id ?? ""),
    kind: String(entry.kind ?? "perLevel"),
    selector,
    count,
    mode,
    before,
    after: clone(after),
    description: String(entry.description ?? "")
  });
}

function progressionFor(system) {
  return system.progression ?? {};
}

export function purchaseCostAtLevel(definition, level) {
  const progression = progressionFor(definition?.system ?? definition ?? {});
  const purchase = progression.purchase ?? {};
  const rank = Math.max(1, Math.trunc(finite(level, 1)));
  return Object.freeze({
    resource: String(purchase.resource ?? "talentPoints"),
    customResource: String(purchase.customResource ?? ""),
    amount: Math.max(0, finite(purchase.base, 0) + (Math.max(0, rank - 1) * finite(purchase.perRank, 0)))
  });
}

/** Resolve a fresh canonical projection at one level; never mutate the definition. */
export function resolveAtLevel(definition, { actor = null, level = 1 } = {}) {
  const system = systemSource(definition);
  const progression = progressionFor(system);
  const maxLevel = Math.max(1, Math.trunc(finite(progression.maxLevel ?? system.maxLevel, 1)));
  const resolvedLevel = Math.min(maxLevel, Math.max(1, Math.trunc(finite(level, 1))));
  const applied = [];
  const invalid = [];
  for (const entry of progression.scaling ?? system.scaling ?? []) {
    const count = occurrenceCount(entry, resolvedLevel);
    if (!count) continue;
    const change = applyScalingEntry(system, entry, count);
    if (change) applied.push(change);
    else invalid.push(Object.freeze({ id: String(entry?.id ?? ""), selector: String(entry?.selector ?? ""), reason: "invalid-selector" }));
  }
  return Object.freeze({
    definitionId: String(system.definitionId ?? ""),
    actorId: String(actor?.id ?? ""),
    level: resolvedLevel,
    maxLevel,
    purchase: purchaseCostAtLevel(system, resolvedLevel),
    system,
    applied: Object.freeze(applied),
    invalid: Object.freeze(invalid)
  });
}

function deltaValue(before, after) {
  if (typeof before === "number" && typeof after === "number") return after - before;
  if (Array.isArray(before) && Array.isArray(after)) {
    return Object.freeze({
      added: Object.freeze(after.filter(value => !before.includes(value))),
      removed: Object.freeze(before.filter(value => !after.includes(value)))
    });
  }
  return Object.is(before, after) ? "" : `${before ?? ""} -> ${after ?? ""}`;
}

export function previewUpgrade(definition, { actor = null, fromLevel = 1, toLevel = fromLevel + 1 } = {}) {
  const before = resolveAtLevel(definition, { actor, level: fromLevel });
  const after = resolveAtLevel(definition, { actor, level: toLevel });
  const selectors = [...new Set([...before.applied, ...after.applied].map(change => change.selector))];
  const changes = selectors.map(selector => {
    const previous = clone(getPath(before.system, selector));
    const next = clone(getPath(after.system, selector));
    const milestones = (after.system.progression?.scaling ?? [])
      .filter(entry => entry.kind === "milestone" && entry.selector === selector)
      .filter(entry => Number(entry.level) > before.level && Number(entry.level) <= after.level)
      .map(entry => String(entry.id ?? entry.description ?? entry.selector));
    return Object.freeze({ selector, before: previous, after: next, delta: deltaValue(previous, next), milestones: Object.freeze(milestones) });
  }).filter(change => !Object.is(change.before, change.after) && JSON.stringify(change.before) !== JSON.stringify(change.after));
  const purchase = [];
  if (after.level > before.level) {
    for (let rank = before.level + 1; rank <= after.level; rank += 1) purchase.push(purchaseCostAtLevel(definition, rank));
  }
  const purchaseTotals = new Map();
  for (const cost of purchase) {
    const key = cost.resource === "custom" ? cost.customResource : cost.resource;
    purchaseTotals.set(key, (purchaseTotals.get(key) ?? 0) + cost.amount);
  }
  return Object.freeze({
    definitionId: after.definitionId,
    fromLevel: before.level,
    toLevel: after.level,
    before,
    after,
    changes: Object.freeze(changes),
    purchase: Object.freeze([...purchaseTotals].map(([resource, amount]) => Object.freeze({ resource, amount })))
  });
}
