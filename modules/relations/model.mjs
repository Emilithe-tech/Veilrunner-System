/** Original, platform-independent social ledger. No game rules are inferred. */
export const ENTITY_KINDS = ["character", "faction", "location"];
export const TABLES = ["entities", "relations", "maps", "events", "links"];
export const emptyLedger = () => ({ version: 1, revision: 0, entities: [], relations: [], maps: [], events: [], links: [], adoptions: [], tiers: [], bounds: { min: null, max: null }, clock: 0 });
const copy = value => structuredClone(value);
const fail = message => { throw new Error(message); };
const finite = value => typeof value === "number" && Number.isFinite(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const text = value => typeof value === "string" ? value : "";
export function audienceAllows(record, userId) { return record?.audience?.includes("all") || record?.audience?.includes(userId); }
export function tierFor(value, tiers = []) {
  if (value === null || value === undefined) return "Unrated";
  return [...tiers].sort((a, b) => b.threshold - a.threshold).find(tier => value >= tier.threshold)?.label ?? String(value);
}
function assertAudience(record) {
  if (!Array.isArray(record.audience) || record.audience.some(id => typeof id !== "string" || !id)) fail("Choose an audience or leave this record private.");
}
function assertValue(value, bounds) {
  if (value === null) return;
  if (!finite(value)) fail("Standing must be a finite number or unrated.");
  if (bounds.min !== null && value < bounds.min || bounds.max !== null && value > bounds.max) fail("Standing is outside the configured bounds.");
}
function hierarchy(entities, entity) {
  const visited = new Set([entity.id]);
  let parentId = entity.parentId;
  while (parentId) {
    if (visited.has(parentId)) fail("A hierarchy cannot contain a cycle.");
    visited.add(parentId);
    const parent = entities.find(e => e.id === parentId);
    if (!parent || parent.kind !== entity.kind || entity.kind === "character") fail("Parent must be a faction or location of the same kind.");
    parentId = parent.parentId;
  }
}
function assertEntity(entity, entities) {
  if (!ENTITY_KINDS.includes(entity.kind) || !text(entity.name).trim()) fail("Choose an entity type and name.");
  hierarchy(entities, entity);
  const ref = (id, kind) => !id || entities.some(e => e.id === id && (!kind || e.kind === kind));
  if (!ref(entity.controllerId, "faction")) fail("Location controller must be an existing faction.");
  for (const id of entity.associatedIds ?? []) if (!ref(id)) fail("An associated entity is unavailable.");
  for (const member of entity.memberships ?? []) {
    const faction = entities.find(e => e.id === member.factionId && e.kind === "faction");
    if (!faction || (member.rank && !(faction.ranks ?? []).includes(member.rank))) fail("Membership needs an existing faction and rank.");
  }
  for (const clock of entity.clocks ?? []) if (!finite(clock.value) || !finite(clock.max) || clock.max <= 0 || clock.value < 0 || clock.value > clock.max) fail("Clock values must fit their positive maximum.");
  for (const resource of entity.resources ?? []) if (!finite(resource.value)) fail("Resource values must be finite numbers.");
}
export function validateLedger(state) {
  if (state.version !== 1) fail("Unsupported relations ledger version.");
  for (const table of TABLES) {
    const ids = new Set();
    for (const record of state[table]) {
      if (!record.id || ids.has(record.id)) fail("Record IDs must be unique.");
      ids.add(record.id); assertAudience(record);
    }
  }
  const { min, max } = state.bounds;
  if (min !== null && !finite(min) || max !== null && !finite(max) || min !== null && max !== null && min > max) fail("Invalid standing bounds.");
  for (const tier of state.tiers) if (!finite(tier.threshold) || !text(tier.label).trim() || !/^#[\da-f]{6}$/i.test(tier.color)) fail("Tiers need a label, numeric threshold, and hex color.");
  for (const entity of state.entities) assertEntity(entity, state.entities);
  const entityExists = id => state.entities.some(e => e.id === id);
  const directions = new Set();
  for (const relation of state.relations) {
    if (relation.acquainted !== undefined && typeof relation.acquainted !== "boolean") fail("Acquaintance must be true or false.");
    if (!entityExists(relation.targetId)) fail("Relationship target is unavailable.");
    if (!(relation.source?.startsWith("Actor.") || entityExists(relation.source))) fail("Choose a character, party, or tracked entity as the source.");
    const key = `${relation.source}/${relation.targetId}`;
    if (directions.has(key)) fail("A directed relationship already exists for this source and target.");
    directions.add(key); assertValue(relation.value, state.bounds);
  }
  for (const map of state.maps) {
    if (!text(map.name).trim() || !finite(map.width) || !finite(map.height) || map.width <= 0 || map.height <= 0 || map.width > 50000 || map.height > 50000 || !finite(map.gridSize) || map.gridSize < 10 || !Number.isInteger(map.gridType) || map.gridType < 0 || map.gridType > 5) fail("Map dimensions and grid are invalid.");
    if (map.locationId && !state.entities.some(e => e.id === map.locationId && e.kind === "location")) fail("Map location is unavailable.");
    for (const pin of map.pins ?? []) if (!entityExists(pin.entityId) || !finite(pin.x) || !finite(pin.y) || pin.x < 0 || pin.y < 0 || pin.x > map.width || pin.y > map.height) fail("Pins need an existing entity and coordinates inside the map.");
    for (const territory of map.territories ?? []) {
      if (!state.entities.some(e => e.id === territory.factionId && e.kind === "faction") || !/^#[\da-f]{6}$/i.test(territory.color) || !Array.isArray(territory.points) || territory.points.length < 3) fail("Territories need a faction, color, and at least three points.");
      for (const point of territory.points ?? []) if (!Array.isArray(point) || point.length !== 2 || point.some(v => !finite(v)) || point[0] < 0 || point[1] < 0 || point[0] > map.width || point[1] > map.height) fail("Territory points must be inside the map.");
    }
  }
  for (const event of state.events) {
    if (!text(event.name).trim() || !["draft", "applied"].includes(event.status) || event.due !== null && !finite(event.due)) fail("Event name, status, or scheduled time is invalid.");
  }
  for (const link of state.links) if (!text(link.journalUuid).startsWith("JournalEntry.") || ![...state.entities, ...state.maps, ...state.events].some(r => r.id === link.targetId)) fail("A link needs an existing target and journal UUID.");
  return state;
}

/** Only explicit effect fields are writable by events; permissions and identity never are. */
function applyEffects(state, effects) {
  const changes = [];
  const seen = new Set();
  for (const effect of effects) {
    const allowed = effect.table === "relations" ? ["value", "acquainted"] : effect.table === "entities" ? ["resources", "clocks", "controllerId", "memberships"] : [];
    if (!allowed.includes(effect.field)) fail("Unsupported event effect.");
    const key = `${effect.table}/${effect.id}/${effect.field}`;
    if (seen.has(key)) fail("An event can change each field only once.");
    seen.add(key);
    const record = state[effect.table].find(r => r.id === effect.id);
    if (!record) fail("An event target is unavailable.");
    const before = copy(record[effect.field] ?? null);
    record[effect.field] = copy(effect.value);
    changes.push({ table: effect.table, id: effect.id, field: effect.field, before, after: copy(effect.value) });
  }
  return changes;
}
export function transact(current, command, { id, author, time, isGM }) {
  if (!isGM) fail("Only a GM may change relations.");
  if (command.type === "applyEvent" && current.events.find(e => e.id === command.id)?.status === "applied") return current;
  if (command.type === "reverseEvent" && current.events.some(e => e.reverses === command.id)) return current;
  if (command.revision !== current.revision) fail("Relations changed. Refresh and try again.");
  const state = copy(current);
  if (command.type === "put") {
    if (!["entities", "relations", "maps", "events", "links"].includes(command.table)) fail("Unknown record type.");
    const record = copy(command.record);
    record.id ||= id(); record.audience ??= [];
    const prior = state[command.table].find(r => r.id === record.id);
    if (command.table === "events") {
      if (prior?.status === "applied") fail("Applied events are immutable.");
      record.status = "draft"; record.effects ??= []; record.due ??= null;
      delete record.changes; delete record.reverses; delete record.author; delete record.time;
    }
    state[command.table] = [...state[command.table].filter(r => r.id !== record.id), record];
  } else if (command.type === "remove") {
    if (!["entities", "relations", "maps", "links", "events"].includes(command.table)) fail("Unknown record type.");
    if (command.table === "events" && state.events.find(e => e.id === command.id)?.status === "applied") fail("Applied history cannot be deleted.");
    state[command.table] = state[command.table].filter(r => r.id !== command.id);
    // Validation rejects referenced entities instead of silently severing relationships.
  } else if (command.type === "configure") {
    state.bounds = copy(command.bounds); state.tiers = copy(command.tiers);
  } else if (command.type === "advance") {
    if (!finite(command.time) || command.time < state.clock) fail("Manual time cannot move backwards.");
    state.clock = command.time;
  } else if (command.type === "applyEvent") {
    const event = state.events.find(e => e.id === command.id);
    if (!event) fail("Event unavailable.");
    event.changes = applyEffects(state, event.effects);
    event.status = "applied"; event.author = author; event.time = time;
  } else if (command.type === "reverseEvent") {
    const event = state.events.find(e => e.id === command.id && e.status === "applied");
    if (!event) fail("Applied event unavailable.");
    for (const change of event.changes) {
      const record = state[change.table].find(r => r.id === change.id);
      if (!record || !same(record[change.field] ?? null, change.after)) fail("Cannot reverse: affected values have changed.");
    }
    const effects = event.changes.map(c => ({ table: c.table, id: c.id, field: c.field, value: c.before }));
    const changes = applyEffects(state, effects);
    state.events.push({ id: id(), name: `Reversal: ${event.name}`, reason: command.reason || "GM reversal", audience: copy(event.audience), status: "applied", due: null, effects, changes, reverses: event.id, author, time });
  } else if (command.type === "standing") {
    const target = state.entities.find(e => e.id === command.targetId);
    if (!target) fail("Relationship target is unavailable.");
    let relation = state.relations.find(r => r.source === command.source && r.targetId === command.targetId);
    if (!relation) {
      relation = { id: id(), source: command.source, targetId: target.id, value: null, acquainted: false, audience: copy(target.audience) };
      state.relations.push(relation);
    }
    const value = command.toggleAcquaintance ? relation.value : command.delta !== undefined ? (relation.value ?? 0) + command.delta : command.value;
    if (command.delta !== undefined && !finite(command.delta)) fail("Adjustment must be a finite number.");
    const effects = [{ table: "relations", id: relation.id, field: "value", value }];
    if (command.acquainted !== undefined) effects.push({ table: "relations", id: relation.id, field: "acquainted", value: command.acquainted });
    if (command.toggleAcquaintance) effects.push({ table: "relations", id: relation.id, field: "acquainted", value: !relation.acquainted });
    const changes = applyEffects(state, effects);
    state.events.push({ id: id(), name: command.reason || "Standing adjustment", reason: command.reason || "Standing adjustment", audience: copy(relation.audience), status: "applied", due: null, effects, changes, author, time });
  } else if (command.type === "adopt") {
    const key = command.actorUuid;
    if (state.adoptions.includes(key)) return current;
    for (const legacy of command.entries) {
      const entityId = id();
      state.entities.push({ id: entityId, kind: legacy.kind, name: legacy.name || "Unnamed legacy relation", img: legacy.img || "", description: "", legacyLabel: legacy.label || "", audience: [] });
      state.relations.push({ id: id(), source: key, targetId: entityId, value: finite(legacy.value) ? legacy.value : null, acquainted: false, audience: [], legacyLabel: legacy.label || "" });
    }
    state.adoptions.push(key);
  } else fail("Unknown relations operation.");
  validateLedger(state); state.revision++;
  return state;
}

/** A whitelist projection, including only data whose referents are also visible. */
export function projectLedger(state, { userId, perspectives = [], actorUuids = [], journalUuids = [] }) {
  const out = emptyLedger();
  out.revision = state.revision; out.bounds = copy(state.bounds); out.tiers = copy(state.tiers);
  const visible = state.entities.filter(e => audienceAllows(e, userId));
  const ids = new Set(visible.map(e => e.id));
  const actors = new Set(actorUuids), sources = new Set([...perspectives, ...ids]);
  const pick = (record, keys) => Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, copy(record[key])]));
  out.entities = visible.map(e => ({
    ...pick(e, ["id", "kind", "name", "img", "description", "ranks", "legacyLabel"]),
    actorUuid: actors.has(e.actorUuid) ? e.actorUuid : "",
    parentId: ids.has(e.parentId) ? e.parentId : "", controllerId: ids.has(e.controllerId) ? e.controllerId : "",
    associatedIds: (e.associatedIds ?? []).filter(id => ids.has(id)),
    memberships: (e.memberships ?? []).filter(m => ids.has(m.factionId)).map(m => pick(m, ["factionId", "rank"]))
  }));
  out.relations = state.relations.filter(r => audienceAllows(r, userId) && sources.has(r.source) && ids.has(r.targetId)).map(r => pick(r, ["id", "source", "targetId", "value", "acquainted", "legacyLabel"]));
  out.maps = state.maps.filter(m => audienceAllows(m, userId) && (!m.locationId || ids.has(m.locationId))).map(m => ({
    ...pick(m, ["id", "name", "background", "width", "height", "gridType", "gridSize", "locationId"]),
    pins: (m.pins ?? []).filter(p => ids.has(p.entityId)).map(p => pick(p, ["entityId", "x", "y"])),
    territories: (m.territories ?? []).filter(t => ids.has(t.factionId)).map(t => pick(t, ["factionId", "color", "points"]))
  }));
  const relationIds = new Set(out.relations.map(r => r.id));
  out.events = state.events.filter(e => e.status === "applied" && audienceAllows(e, userId)
    && (e.changes ?? []).every(c => c.table === "relations" ? relationIds.has(c.id) : ids.has(c.id))
    && (e.changes ?? []).every(c => c.table === "relations" && ["value", "acquainted"].includes(c.field)))
    .map(e => pick(e, ["id", "name", "reason", "status", "time", "reverses", "changes"]));
  // Public event summaries may be explicitly authored separately from private mechanical effects.
  for (const event of state.events.filter(e => e.status === "applied" && audienceAllows(e, userId) && text(e.publicSummary))) {
    if (!out.events.some(e => e.id === event.id)) out.events.push({ ...pick(event, ["id", "status", "time"]), name: "Faction event", reason: event.publicSummary, changes: [] });
  }
  const eventIds = new Set(out.events.map(e => e.id));
  for (const event of out.events) if (!eventIds.has(event.reverses)) delete event.reverses;
  const targets = new Set([...ids, ...out.maps.map(m => m.id), ...eventIds]);
  out.links = state.links.filter(l => audienceAllows(l, userId) && targets.has(l.targetId) && journalUuids.includes(l.journalUuid)).map(l => pick(l, ["id", "targetId", "journalUuid"]));
  return out;
}
