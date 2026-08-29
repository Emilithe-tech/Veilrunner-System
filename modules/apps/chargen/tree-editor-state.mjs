export const TREE_EDITOR_HISTORY_LIMIT = 50;
export const TREE_NODE_SHAPES = Object.freeze(["circle", "diamond", "hex", "pentagon", "square", "rounded-square", "shield", "flag", "star", "capsule"]);
export const TREE_NODE_SIZE_PRESETS = Object.freeze(["small", "medium", "large", "wide", "custom"]);
export const TREE_CONNECTION_ROUTES = Object.freeze(["linear", "curved", "rounded", "square"]);
export const TREE_PATH_STATE_ORDER = Object.freeze(["blocked", "available", "active"]);
export const TREE_ZOOM = Object.freeze({ minimum: .35, initial: 1.2, maximum: 3, step: .05, controlStep: .1 });

const STANDARD_NODE_SIZE = Object.freeze({ root: [78, 78], school: [60, 60], practice: [60, 60], spell: [56, 60] });
const PRESET_FACTORS = Object.freeze({ small: [.8, .8], medium: [1, 1], large: [1.34, 1.34], wide: [1.75, 1.05] });

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Number(value) || minimum));

export function normalizeTreeZoom(value, fallback = TREE_ZOOM.initial) {
  const requested = Number(value);
  const safe = Number.isFinite(requested) ? requested : Number(fallback);
  const snapped = Math.round(safe / TREE_ZOOM.step) * TREE_ZOOM.step;
  return Number(Math.max(TREE_ZOOM.minimum, Math.min(TREE_ZOOM.maximum, snapped)).toFixed(2));
}

export function normalizeTreeNodeShape(value, fallback = "diamond") {
  return TREE_NODE_SHAPES.includes(value) ? value : fallback;
}

export function resolveTreeNodeSize(kind = "spell", source = {}) {
  const base = STANDARD_NODE_SIZE[kind] ?? STANDARD_NODE_SIZE.spell;
  const requestedPreset = source?.preset === "standard" ? "medium" : source?.preset;
  const preset = TREE_NODE_SIZE_PRESETS.includes(requestedPreset) ? requestedPreset : "medium";
  if (preset === "custom") return { preset, width: Math.round(clamp(source.width, 40, 320)), height: Math.round(clamp(source.height, 40, 320)) };
  const factor = PRESET_FACTORS[preset] ?? PRESET_FACTORS.medium;
  return { preset, width: Math.round(base[0] * factor[0]), height: Math.round(base[1] * factor[1]) };
}

export function anchoredTreeViewport({ left = 0, top = 0, anchorX = 0, anchorY = 0, fromZoom = 1, toZoom = 1 } = {}) {
  const previous = Math.max(.01, Number(fromZoom) || 1);
  const next = Math.max(.01, Number(toZoom) || 1);
  const ratio = next / previous;
  return {
    left: Math.max(0, (Number(left) + Number(anchorX)) * ratio - Number(anchorX)),
    top: Math.max(0, (Number(top) + Number(anchorY)) * ratio - Number(anchorY))
  };
}

export function clampTreeNodeCenter({ x = 0, y = 0, width = 60, height = 60, bounds = {} } = {}) {
  const canvasWidth = Number(bounds.width) || 3840;
  const canvasHeight = Number(bounds.height) || 2160;
  const margin = Number(bounds.margin) || 60;
  const halfWidth = Math.max(1, Number(width) || 60) / 2;
  const halfHeight = Math.max(1, Number(height) || 60) / 2;
  return {
    x: Math.round(Math.max(margin + halfWidth, Math.min(canvasWidth - margin - halfWidth, Number(x) || 0))),
    y: Math.round(Math.max(margin + halfHeight, Math.min(canvasHeight - margin - halfHeight, Number(y) || 0)))
  };
}

export function treeNodeAlignmentTarget(nodes = [], property = "x", alignToFirst = false) {
  const values = nodes.map(node => Number(node?.[property])).filter(Number.isFinite);
  if (!values.length) return 0;
  return alignToFirst ? values[0] : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function normalizeTreeConnectionStyle(source = {}) {
  const bend = Math.max(-100, Math.min(100, Number(source.bend) || 0));
  const route = TREE_CONNECTION_ROUTES.includes(source.route) ? source.route : bend ? "curved" : "linear";
  const waypoints = Array.isArray(source.waypoints)
    ? source.waypoints
      .map(point => ({
        ...(String(point?.id ?? "").trim() ? { id: String(point.id).trim() } : {}),
        x: Number(point?.x),
        y: Number(point?.y),
        ...(point?.lockX === true ? { lockX: true } : {}),
        ...(point?.lockY === true ? { lockY: true } : {})
      }))
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
    : [];
  const startJunction = source.startJunction && typeof source.startJunction === "object"
    ? { parentConnectionKey: String(source.startJunction.parentConnectionKey ?? "").trim(), waypointId: String(source.startJunction.waypointId ?? "").trim() }
    : null;
  const { startJunction: _ignoredStartJunction, ...rest } = source;
  return { ...rest, route, bend, cornerRadius: Math.max(4, Math.min(160, Number(source.cornerRadius) || 36)), flip: source.flip === true, waypoints, ...(startJunction?.parentConnectionKey && startJunction.waypointId ? { startJunction } : {}) };
}

export function snapTreeWaypoint({ point = {}, origin = {}, lockX = false, lockY = false, candidates = {}, threshold = 12, bypass = false } = {}) {
  const next = {
    x: lockX ? Number(origin.x) || 0 : Number(point.x) || 0,
    y: lockY ? Number(origin.y) || 0 : Number(point.y) || 0,
    snapX: null,
    snapY: null
  };
  const nearest = (entries, value) => (entries ?? [])
    .map(entry => ({ ...entry, value: Number(entry.value), distance: Math.abs(Number(entry.value) - value) }))
    .filter(entry => Number.isFinite(entry.value) && entry.distance <= threshold)
    .sort((left, right) => (Number(left.priority) || 0) - (Number(right.priority) || 0) || left.distance - right.distance)[0] ?? null;
  if (!bypass && !lockX) {
    const match = nearest(candidates.x, next.x);
    if (match) { next.x = match.value; next.snapX = match; }
  }
  if (!bypass && !lockY) {
    const match = nearest(candidates.y, next.y);
    if (match) { next.y = match.value; next.snapY = match; }
  }
  return next;
}

function roundedPolylinePath(points, cornerRadius) {
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const toward = (a, b, amount) => {
    const length = distance(a, b);
    if (!length) return { ...a };
    const ratio = Math.min(1, amount / length);
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  };
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const radius = Math.min(cornerRadius, distance(previous, corner) / 2, distance(corner, next) / 2);
    if (!radius) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }
    const before = toward(corner, previous, radius);
    const after = toward(corner, next, radius);
    path += ` L ${before.x} ${before.y} Q ${corner.x} ${corner.y} ${after.x} ${after.y}`;
  }
  const end = points.at(-1);
  return `${path} L ${end.x} ${end.y}`;
}

const treePointKey = point => `${Number(point.x)},${Number(point.y)}`;
const treePointsEqual = (left, right) => Number(left?.x) === Number(right?.x) && Number(left?.y) === Number(right?.y);
const treePointDistance = (left, right) => Math.hypot(Number(right.x) - Number(left.x), Number(right.y) - Number(left.y));
const treePointToward = (from, to, amount) => {
  const length = treePointDistance(from, to);
  if (!length) return { x: Number(from.x), y: Number(from.y) };
  const ratio = Math.min(1, amount / length);
  return { x: Number(from.x) + (Number(to.x) - Number(from.x)) * ratio, y: Number(from.y) + (Number(to.y) - Number(from.y)) * ratio };
};

function routedTreeControlPoints(start, end, style) {
  if (style.waypoints.length) return [start, ...style.waypoints, end].map(point => ({ x: Number(point.x), y: Number(point.y) }));
  if (!["rounded", "square"].includes(style.route)) return [start, end].map(point => ({ x: Number(point.x), y: Number(point.y) }));
  const horizontal = style.flip ? Math.abs(end.x - start.x) < Math.abs(end.y - start.y) : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const points = horizontal
    ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]
    : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end];
  return points.map(point => ({ x: Number(point.x), y: Number(point.y) }));
}

function roundedTreeRoute(points, radii) {
  if (points.length < 3 || !radii.some(radius => radius > 0)) {
    const path = `M ${treePointKey(points[0])}${points.slice(1).map(point => ` L ${treePointKey(point)}`).join("")}`;
    return { path, fragments: points.slice(1).map((point, index) => ({ segmentStart: points[index], segmentEnd: point, d: `M ${treePointKey(points[index])} L ${treePointKey(point)}`, kind: "line" })).filter(fragment => !treePointsEqual(fragment.segmentStart, fragment.segmentEnd)) };
  }
  let path = `M ${treePointKey(points[0])}`;
  const fragments = [];
  let current = points[0];
  for (let index = 1; index < points.length - 1; index += 1) {
    const corner = points[index];
    const radius = radii[index - 1] ?? 0;
    const before = radius ? treePointToward(corner, points[index - 1], radius) : corner;
    const after = radius ? treePointToward(corner, points[index + 1], radius) : corner;
    if (!treePointsEqual(current, before)) {
      const d = `M ${treePointKey(current)} L ${treePointKey(before)}`;
      fragments.push({ d, kind: "line", segmentStart: current, segmentEnd: before });
      path += ` L ${treePointKey(before)}`;
    }
    if (radius) {
      const d = `M ${treePointKey(before)} Q ${treePointKey(corner)} ${treePointKey(after)}`;
      fragments.push({ d, kind: "curve", segmentStart: before, control: corner, segmentEnd: after });
      path += ` Q ${treePointKey(corner)} ${treePointKey(after)}`;
    }
    current = after;
  }
  const end = points.at(-1);
  if (!treePointsEqual(current, end)) {
    const d = `M ${treePointKey(current)} L ${treePointKey(end)}`;
    fragments.push({ d, kind: "line", segmentStart: current, segmentEnd: end });
    path += ` L ${treePointKey(end)}`;
  }
  return { path, fragments };
}

function treeFragmentLength(fragment) {
  if (!fragment?.segmentStart || !fragment?.segmentEnd) return 0;
  if (fragment.kind !== "curve" || !fragment.control) return treePointDistance(fragment.segmentStart, fragment.segmentEnd);
  let length = 0;
  let previous = fragment.segmentStart;
  for (let index = 1; index <= 12; index += 1) {
    const t = index / 12;
    const inverse = 1 - t;
    const point = {
      x: inverse * inverse * fragment.segmentStart.x + 2 * inverse * t * fragment.control.x + t * t * fragment.segmentEnd.x,
      y: inverse * inverse * fragment.segmentStart.y + 2 * inverse * t * fragment.control.y + t * t * fragment.segmentEnd.y
    };
    length += treePointDistance(previous, point);
    previous = point;
  }
  return length;
}

function phaseTreeFragments(fragments) {
  let pulsePhase = 0;
  return fragments.map(fragment => {
    const phased = { ...fragment, pulsePhase };
    pulsePhase += treeFragmentLength(fragment);
    return phased;
  });
}

function treeFragmentsLength(fragments) {
  return fragments.reduce((total, fragment) => total + treeFragmentLength(fragment), 0);
}

function splitSharedTreeLineFragments(fragments) {
  const lines = fragments.filter(fragment => fragment.kind === "line" && fragment.segmentStart && fragment.segmentEnd);
  const pointOnLine = (point, line) => {
    const dx = line.segmentEnd.x - line.segmentStart.x;
    const dy = line.segmentEnd.y - line.segmentStart.y;
    const lengthSquared = dx * dx + dy * dy;
    if (!lengthSquared) return null;
    const ratio = ((point.x - line.segmentStart.x) * dx + (point.y - line.segmentStart.y) * dy) / lengthSquared;
    const projected = { x: line.segmentStart.x + dx * ratio, y: line.segmentStart.y + dy * ratio };
    return Math.hypot(projected.x - point.x, projected.y - point.y) <= .01 && ratio > .000001 && ratio < .999999 ? ratio : null;
  };
  const interpolate = (line, ratio) => ({ x: line.segmentStart.x + (line.segmentEnd.x - line.segmentStart.x) * ratio, y: line.segmentStart.y + (line.segmentEnd.y - line.segmentStart.y) * ratio });
  return fragments.flatMap(fragment => {
    if (fragment.kind !== "line" || !fragment.segmentStart || !fragment.segmentEnd) return [fragment];
    const cuts = [0, 1];
    for (const line of lines) for (const point of [line.segmentStart, line.segmentEnd]) {
      const ratio = pointOnLine(point, fragment);
      if (ratio !== null) cuts.push(ratio);
    }
    const sorted = [...new Set(cuts.map(value => Number(value.toFixed(8))))].sort((left, right) => left - right);
    return sorted.slice(1).map((endRatio, index) => {
      const start = interpolate(fragment, sorted[index]);
      const end = interpolate(fragment, endRatio);
      return {
        ...fragment,
        segmentStart: start,
        segmentEnd: end,
        pulsePhase: (Number(fragment.pulsePhase) || 0) + treePointDistance(fragment.segmentStart, start),
        d: `M ${treePointKey(start)} L ${treePointKey(end)}`,
        path: `M ${treePointKey(start)} L ${treePointKey(end)}`
      };
    });
  });
}

/** Compile logical tree routes into independently paintable, deduplicated fragments. */
export function compileSharedTreeRoutes(records = []) {
  const routes = records.map((record, recordIndex) => {
    const style = normalizeTreeConnectionStyle(record.line);
    const points = routedTreeControlPoints(record.start, record.end, style);
    const radii = style.route === "rounded" ? points.slice(1, -1).map((corner, cornerIndex) => Math.min(style.cornerRadius, treePointDistance(points[cornerIndex], corner) / 2, treePointDistance(corner, points[cornerIndex + 2]) / 2)) : [];
    return { ...record, recordIndex, style, points, radii };
  });
  const sharedCorners = new Map();
  for (const route of routes) {
    if (route.style.route !== "rounded") continue;
    for (let cornerIndex = 0; cornerIndex < route.radii.length; cornerIndex += 1) {
      const pointIndex = cornerIndex + 1;
      const suffix = route.points.slice(pointIndex).map(treePointKey).join("|");
      const key = `${treePointKey(route.points[pointIndex])}>${suffix}`;
      const current = sharedCorners.get(key);
      sharedCorners.set(key, current === undefined ? route.radii[cornerIndex] : Math.min(current, route.radii[cornerIndex]));
    }
  }
  const logical = [];
  const fragments = [];
  for (const route of routes) {
    if (route.style.route === "rounded") {
      const radii = route.radii.map((_radius, cornerIndex) => {
        const pointIndex = cornerIndex + 1;
        const suffix = route.points.slice(pointIndex).map(treePointKey).join("|");
        return sharedCorners.get(`${treePointKey(route.points[pointIndex])}>${suffix}`) ?? route.radii[cornerIndex];
      });
      const compiled = roundedTreeRoute(route.points, radii);
      const phasedFragments = phaseTreeFragments(compiled.fragments);
      logical.push({ ...route, path: compiled.path, effectiveCornerRadii: radii, pulseLength: treeFragmentsLength(compiled.fragments) });
      fragments.push(...phasedFragments.map(fragment => ({ ...route, ...fragment, path: fragment.d })));
      continue;
    }
    if (route.style.waypoints.length || route.style.route === "square") {
      const routeFragments = route.points.slice(1).map((point, index) => ({ segmentStart: route.points[index], segmentEnd: point, d: `M ${treePointKey(route.points[index])} L ${treePointKey(point)}`, kind: "line" })).filter(fragment => !treePointsEqual(fragment.segmentStart, fragment.segmentEnd));
      const path = `M ${treePointKey(route.points[0])}${route.points.slice(1).map(point => ` L ${treePointKey(point)}`).join("")}`;
      logical.push({ ...route, path, pulseLength: treeFragmentsLength(routeFragments) });
      fragments.push(...phaseTreeFragments(routeFragments).map(fragment => ({ ...route, ...fragment, path: fragment.d })));
      continue;
    }
    const path = treeConnectionPath(route.start, route.end, route.style);
    logical.push({ ...route, path, pulseLength: treePointDistance(route.start, route.end) });
    fragments.push({ ...route, d: path, path, kind: route.style.route, pulsePhase: 0 });
  }
  return { logical, fragments: consolidateTreePathRecords(splitSharedTreeLineFragments(fragments)) };
}

export function treeConnectionPath(start, end, source = {}) {
  const style = normalizeTreeConnectionStyle(source);
  if (style.waypoints.length) {
    const points = [start, ...style.waypoints, end];
    if (style.route === "rounded") return roundedPolylinePath(points, style.cornerRadius);
    return `M ${points.map((point, index) => `${index ? "L " : ""}${point.x} ${point.y}`).join(" ")}`;
  }
  if (style.route === "linear") return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  if (style.route === "curved") {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const offset = Math.min(360, distance * .45) * (style.bend / 100);
    const nx = -dy / distance;
    const ny = dx / distance;
    return `M ${start.x} ${start.y} C ${start.x + dx / 3 + nx * offset} ${start.y + dy / 3 + ny * offset}, ${start.x + dx * 2 / 3 + nx * offset} ${start.y + dy * 2 / 3 + ny * offset}, ${end.x} ${end.y}`;
  }
  const horizontal = style.flip ? Math.abs(end.x - start.x) < Math.abs(end.y - start.y) : Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  const points = horizontal
    ? [start, { x: (start.x + end.x) / 2, y: start.y }, { x: (start.x + end.x) / 2, y: end.y }, end]
    : [start, { x: start.x, y: (start.y + end.y) / 2 }, { x: end.x, y: (start.y + end.y) / 2 }, end];
  if (style.route === "square") return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y} L ${points[2].x} ${points[2].y} L ${points[3].x} ${points[3].y}`;
  const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const firstLength = distance(points[0], points[1]);
  const middleLength = distance(points[1], points[2]);
  const lastLength = distance(points[2], points[3]);
  // An axis-aligned link has no corners to round. More importantly, avoiding
  // two zero-length quadratic turns prevents a visible knot in its casing.
  if (!firstLength || !middleLength || !lastLength) return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  const toward = (a, b, amount) => {
    const length = distance(a, b);
    const ratio = Math.min(1, amount / length);
    return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
  };
  // Both corners consume the shared middle segment. Cap each turn to half of
  // that segment so large authored radii never cross and backtrack.
  const sharedRadius = Math.min(style.cornerRadius, middleLength / 2);
  const firstRadius = Math.min(sharedRadius, firstLength);
  const secondRadius = Math.min(sharedRadius, lastLength);
  const before1 = toward(points[1], points[0], firstRadius);
  const after1 = toward(points[1], points[2], firstRadius);
  const before2 = toward(points[2], points[1], secondRadius);
  const after2 = toward(points[2], points[3], secondRadius);
  return `M ${points[0].x} ${points[0].y} L ${before1.x} ${before1.y} Q ${points[1].x} ${points[1].y} ${after1.x} ${after1.y} L ${before2.x} ${before2.y} Q ${points[2].x} ${points[2].y} ${after2.x} ${after2.y} L ${points[3].x} ${points[3].y}`;
}

export function treeWaypointInsertIndex(points = [], point = {}) {
  if (points.length < 2) return 0;
  let best = { index: 0, distance: Number.POSITIVE_INFINITY };
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared)) : 0;
    const x = start.x + dx * ratio;
    const y = start.y + dy * ratio;
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < best.distance) best = { index, distance };
  }
  return best.index;
}

export function consolidateTreePathRecords(records = []) {
  const priority = Object.fromEntries(TREE_PATH_STATE_ORDER.map((state, index) => [state, index]));
  const consolidated = new Map();
  for (const record of records) {
    const endpoints = record?.kind === "line" && record.segmentStart && record.segmentEnd
      ? [treePointKey(record.segmentStart), treePointKey(record.segmentEnd)].sort()
      : null;
    const key = endpoints ? `line:${endpoints.join("|")}` : String(record?.path ?? "");
    if (!key) continue;
    const current = consolidated.get(key);
    if (!current || (priority[record.state] ?? 0) > (priority[current.state] ?? 0)) consolidated.set(key, { ...record });
  }
  return [...consolidated.values()];
}

function ringOrder(nodes, anchor, radius, rotation) {
  const clockwise = [...nodes].sort((a, b) => Math.atan2(a.y - anchor.y, a.x - anchor.x) - Math.atan2(b.y - anchor.y, b.x - anchor.x));
  const candidates = [clockwise, [...clockwise].reverse()];
  let best = null;
  for (const order of candidates) for (let offset = 0; offset < order.length; offset += 1) {
    const shifted = order.map((_, index) => order[(index + offset) % order.length]);
    const cost = shifted.reduce((sum, node, index) => {
      const angle = rotation + index * Math.PI * 2 / shifted.length;
      return sum + Math.hypot(node.x - (anchor.x + Math.cos(angle) * radius), node.y - (anchor.y + Math.sin(angle) * radius));
    }, 0);
    if (!best || cost < best.cost) best = { ids: shifted.map(node => node.id), cost };
  }
  return best?.ids ?? nodes.map(node => node.id);
}

function ringPlacements(nodes, assignment, anchor, radius, rotation) {
  const selectedIds = new Set(nodes.map(node => node.id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const placements = assignment.map((id, index) => {
    const node = byId.get(id);
    const angle = rotation + index * Math.PI * 2 / assignment.length;
    const x = Math.round(anchor.x + Math.cos(angle) * radius);
    const y = Math.round(anchor.y + Math.sin(angle) * radius);
    return { ...node, x, y, currentX: node.x, currentY: node.y, angle, order: index + 1, carried: false, distance: Math.round(Math.hypot(x - node.x, y - node.y)) };
  });
  for (const placement of [...placements]) for (const child of placement.children ?? []) {
    if (selectedIds.has(child.id)) continue;
    const x = Math.round(child.x + placement.x - placement.currentX);
    const y = Math.round(child.y + placement.y - placement.currentY);
    placements.push({ ...child, x, y, currentX: child.x, currentY: child.y, parentId: placement.id, order: placement.order, carried: true, distance: placement.distance });
  }
  return placements;
}

function validateRingPlacements(placements, bounds, gap) {
  const issues = [];
  for (const node of placements) {
    const halfWidth = node.width / 2;
    const halfHeight = node.height / 2;
    if (node.x - halfWidth < bounds.margin || node.x + halfWidth > bounds.width - bounds.margin || node.y - halfHeight < bounds.margin || node.y + halfHeight > bounds.height - bounds.margin) issues.push({ type: "edge", ids: [node.id] });
  }
  for (let left = 0; left < placements.length; left += 1) for (let right = left + 1; right < placements.length; right += 1) {
    const a = placements[left];
    const b = placements[right];
    // A carried child keeps its authored offset from its Practice. That existing
    // parent/child footprint is not a new ring conflict; collisions with every
    // other destination still participate in validation.
    if (a.parentId === b.id || b.parentId === a.id) continue;
    if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.y - b.y) < (a.height + b.height) / 2 + gap) issues.push({ type: "collision", ids: [a.id, b.id] });
  }
  return issues;
}

export function computeSmartTreeRing({ nodes = [], anchor = {}, requestedRadius = 500, rotation = -90, assignment = null, bounds = {}, gap = 20 } = {}) {
  const normalizedBounds = { width: Number(bounds.width) || 3840, height: Number(bounds.height) || 2160, margin: Number(bounds.margin) || 60 };
  const candidates = nodes.filter(node => node?.id && node.id !== anchor.id).map(node => ({ ...node, x: Number(node.x) || 0, y: Number(node.y) || 0, width: Math.max(1, Number(node.width) || 60), height: Math.max(1, Number(node.height) || 60) }));
  if (candidates.length < 2) return { valid: false, assignment: [], placements: [], requestedRadius, effectiveRadius: 0, minimumSafeRadius: null, maximumAvailableRadius: null, issues: [{ type: "selection", ids: [] }] };
  const radians = Number(rotation) * Math.PI / 180;
  const requested = Math.max(180, Math.min(3000, Number(requestedRadius) || 500));
  const stableAssignment = Array.isArray(assignment) && assignment.length === candidates.length && assignment.every(id => candidates.some(node => node.id === id)) ? [...assignment] : ringOrder(candidates, anchor, requested, radians);
  const collisionFreeRadii = [];
  const edgeFreeRadii = [];
  for (let radius = 180; radius <= 3000; radius += 10) {
    const placements = ringPlacements(candidates, stableAssignment, anchor, radius, radians);
    const radiusIssues = validateRingPlacements(placements, normalizedBounds, gap);
    if (!radiusIssues.some(issue => issue.type === "collision")) collisionFreeRadii.push(radius);
    if (!radiusIssues.some(issue => issue.type === "edge")) edgeFreeRadii.push(radius);
  }
  const minimumSafeRadius = collisionFreeRadii[0] ?? null;
  const maximumAvailableRadius = edgeFreeRadii.at(-1) ?? 0;
  const effectiveRadius = minimumSafeRadius === null ? requested : Math.max(requested, minimumSafeRadius);
  const placements = ringPlacements(candidates, stableAssignment, anchor, effectiveRadius, radians);
  const issues = validateRingPlacements(placements, normalizedBounds, gap);
  const valid = minimumSafeRadius !== null && effectiveRadius <= maximumAvailableRadius && !issues.length;
  return { valid, assignment: stableAssignment, placements, requestedRadius: requested, effectiveRadius, minimumSafeRadius, maximumAvailableRadius, issues };
}

export function normalizeTreeEditorTool(value) {
  return ["select", "move", "connect"].includes(value) ? value : "select";
}

export function pushTreeEditorHistory(stack, entry, limit = TREE_EDITOR_HISTORY_LIMIT) {
  const next = [...(Array.isArray(stack) ? stack : []), entry];
  return next.slice(-Math.max(1, Number(limit) || TREE_EDITOR_HISTORY_LIMIT));
}

export function recordTreeEditorMutation({ undo = [], entry, limit = TREE_EDITOR_HISTORY_LIMIT } = {}) {
  return { undo: pushTreeEditorHistory(undo, entry, limit), redo: [] };
}

export function treeEditorCreationContext({ selection = null, openPractice = null, page = "skills", center = {}, canvas = {} } = {}) {
  const width = Number(canvas.width) || 3840;
  const height = Number(canvas.height) || 2160;
  const margin = Number(canvas.margin) || 60;
  const centerX = Number.isFinite(Number(center.x)) ? Number(center.x) : width / 2;
  const centerY = Number.isFinite(Number(center.y)) ? Number(center.y) : height / 2;
  const x = Math.max(margin, Math.min(width - margin, Math.round(centerX)));
  const y = Math.max(margin, Math.min(height - margin, Math.round(centerY)));
  const practice = selection?.kind === "practice" ? selection : openPractice;
  if (practice) return { nodeKind: "spell", schoolId: practice.schoolId ?? practice.school?.id ?? "", practiceId: practice.id ?? practice.practice?.id ?? "", x, y };
  if (selection?.kind === "school") return { nodeKind: "practice", schoolId: selection.id ?? selection.school?.id ?? "", practiceId: "", x, y };
  return { nodeKind: "school", schoolId: "", practiceId: "", x, y, page: page === "magic" ? "magic" : "skills" };
}

export function isTreeEditorShortcutTarget(target) {
  const tag = String(target?.tagName ?? "").toUpperCase();
  return Boolean(target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(tag) || target?.closest?.("[contenteditable='true'], .prosemirror, .editor-content"));
}
