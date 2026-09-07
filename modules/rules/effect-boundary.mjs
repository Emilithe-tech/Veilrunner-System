const UNSAFE_PATH_PARTS = new Set(["__proto__", "prototype", "constructor"]);

export const ACTIVE_EFFECT_MODES = Object.freeze({
  custom: 0,
  multiply: 1,
  add: 2,
  downgrade: 3,
  upgrade: 4,
  override: 5
});

export const EFFECT_DISCLOSURE = Object.freeze({
  OBSERVABLE: "observable",
  SELF: "self-known",
  PAN: "pan-telemetry",
  BIOMONITOR: "biomonitor",
  SYSTEM: "system-telemetry",
  MAGICAL: "magical-detection",
  DIGITAL: "digital-detection",
  HIDDEN: "hidden"
});

const EFFECT_SCOPES = new Set(["actor", "action", "target", "area"]);
const MODE_BY_ID = new Map(Object.entries(ACTIVE_EFFECT_MODES).map(([name, id]) => [id, name]));
const DISCLOSURES = new Set(Object.values(EFFECT_DISCLOSURE));

const list = value => Array.isArray(value) ? value : value && typeof value[Symbol.iterator] === "function" ? [...value] : [];
const text = value => String(value ?? "").trim();
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function clone(value) {
  return globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function systemFlags(effect, systemId) {
  return effect?.flags?.[systemId] ?? effect?.flags?.Veilrunner ?? effect?.flags?.veilrunner ?? {};
}

export function isSafeEffectPath(path) {
  const value = text(path);
  if (!value || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(value)) return false;
  return !value.split(".").some(part => UNSAFE_PATH_PARTS.has(part));
}

export function normalizeEffectMode(value) {
  const raw = text(value);
  const numeric = Number(raw);
  if (raw && Number.isInteger(numeric) && MODE_BY_ID.has(numeric)) {
    return Object.freeze({ id: numeric, name: MODE_BY_ID.get(numeric), valid: true });
  }
  const name = raw.toLowerCase();
  if (Object.hasOwn(ACTIVE_EFFECT_MODES, name)) {
    return Object.freeze({ id: ACTIVE_EFFECT_MODES[name], name, valid: true });
  }
  return Object.freeze({ id: ACTIVE_EFFECT_MODES.custom, name: "custom", valid: false });
}

export function effectDisclosure(effect, { systemId = "Veilrunner" } = {}) {
  const flags = systemFlags(effect, systemId);
  const value = text(flags?.visibility?.disclosure ?? flags?.actionHud?.visibility?.disclosure);
  return DISCLOSURES.has(value) ? value : EFFECT_DISCLOSURE.HIDDEN;
}

function intelHas(intel, key) {
  return Boolean(intel?.[key] || intel?.modules?.includes?.(key));
}

/** Pure disclosure policy. Foundry ownership checks are supplied by the caller. */
export function canObserveEffect(effect, {
  systemId = "Veilrunner",
  isGM = false,
  isOwner = false,
  isSelf = false,
  panState = "link-lost",
  intel = {}
} = {}) {
  if (!effect || effect.disabled) return false;
  if (isGM || isOwner) return true;
  const mode = effectDisclosure(effect, { systemId });
  if (mode === EFFECT_DISCLOSURE.OBSERVABLE) return true;
  if (mode === EFFECT_DISCLOSURE.SELF) return isSelf;
  if (mode === EFFECT_DISCLOSURE.PAN) return ["stable", "degraded"].includes(panState);
  if (mode === EFFECT_DISCLOSURE.BIOMONITOR) return intelHas(intel, "biomonitor");
  if (mode === EFFECT_DISCLOSURE.SYSTEM) return intelHas(intel, "conditions") || intelHas(intel, "system");
  if (mode === EFFECT_DISCLOSURE.MAGICAL) return intelHas(intel, "magical");
  if (mode === EFFECT_DISCLOSURE.DIGITAL) return intelHas(intel, "digital");
  return false;
}

export function normalizeEffectSource(source = {}, index = 0, { systemId = "Veilrunner" } = {}) {
  const document = source.document ?? source.effect ?? source;
  const flags = systemFlags(document, systemId);
  const rawScope = text(source.scope ?? flags.scope ?? "actor").toLowerCase();
  const sourceId = text(source.sourceId ?? document.id ?? document._id ?? `source-${index}`);
  const sourceUuid = text(source.sourceUuid ?? document.uuid ?? document.origin);
  const kind = text(source.kind ?? (document.documentName === "ActiveEffect" ? "active-effect" : "rule-source")) || "rule-source";
  return deepFreeze({
    kind,
    scope: EFFECT_SCOPES.has(rawScope) ? rawScope : "actor",
    sourceId,
    sourceUuid,
    sourceName: text(source.sourceName ?? document.name ?? document.label),
    definitionId: text(source.definitionId ?? document.system?.definitionId),
    origin: text(source.origin ?? document.origin),
    condition: Boolean(source.condition ?? document.type === "condition"),
    disclosure: effectDisclosure(document, { systemId }),
    disabled: Boolean(source.disabled ?? document.disabled),
    changes: list(source.changes ?? document.changes).map(change => clone(change?.toObject?.() ?? change))
  });
}

export function normalizeEffectChange(change = {}, { source = {}, index = 0 } = {}) {
  const path = text(change.key ?? change.path);
  const mode = normalizeEffectMode(change.mode ?? "add");
  const errors = [];
  if (!isSafeEffectPath(path)) errors.push("A safe effect path is required.");
  if (!mode.valid) errors.push("Unsupported ActiveEffect change mode.");
  const priority = Math.trunc(finite(change.priority, mode.id * 10));
  const value = text(change.value);
  const provenance = Object.freeze({
    kind: text(source.kind) || "rule-source",
    scope: EFFECT_SCOPES.has(source.scope) ? source.scope : "actor",
    sourceId: text(source.sourceId),
    sourceUuid: text(source.sourceUuid),
    sourceName: text(source.sourceName),
    definitionId: text(source.definitionId),
    origin: text(source.origin),
    condition: Boolean(source.condition),
    disclosure: DISCLOSURES.has(source.disclosure) ? source.disclosure : EFFECT_DISCLOSURE.HIDDEN,
    changeIndex: Math.max(0, Math.trunc(finite(index)))
  });
  const orderKey = [
    String(priority).padStart(8, "0"), provenance.kind, provenance.sourceUuid,
    provenance.sourceId, String(provenance.changeIndex).padStart(6, "0"), path
  ].join(":");
  return deepFreeze({
    path,
    key: path,
    mode: mode.name,
    modeId: mode.id,
    value,
    valueNumber: Number.isFinite(Number(value)) ? Number(value) : null,
    priority,
    provenance,
    orderKey,
    valid: errors.length === 0,
    errors
  });
}

function compareChanges(left, right) {
  return left.priority - right.priority || left.orderKey.localeCompare(right.orderKey);
}

/**
 * Normalize rule/action/ActiveEffect sources without applying Foundry documents.
 * Native ActiveEffect application remains Foundry's responsibility.
 */
export function resolveEffectChanges(sources = [], { systemId = "Veilrunner" } = {}) {
  const changes = [];
  const errors = [];
  for (const [sourceIndex, sourceData] of list(sources).entries()) {
    const source = normalizeEffectSource(sourceData, sourceIndex, { systemId });
    if (source.disabled) continue;
    for (const [changeIndex, changeData] of source.changes.entries()) {
      const change = normalizeEffectChange(changeData, { source, index: changeIndex });
      if (!change.valid) {
        errors.push(Object.freeze({ provenance: change.provenance, errors: [...change.errors] }));
        continue;
      }
      changes.push(change);
    }
  }
  changes.sort(compareChanges);
  const result = {
    changes,
    actorChanges: changes.filter(change => change.provenance.scope !== "action"),
    actionModifiers: changes.filter(change => change.provenance.scope === "action"),
    errors
  };
  return deepFreeze(result);
}

/** Convert legacy Action effect rows into native Foundry ActiveEffect creation data. */
export function prepareActionEffectDocument(action, effect, { systemId = "Veilrunner" } = {}) {
  const target = text(effect?.target);
  const path = target.startsWith("system.") ? target : target ? `system.${target}` : "";
  const source = {
    kind: "action-effect",
    scope: effect?.scope,
    sourceId: action?.id ?? action?._id,
    sourceUuid: action?.uuid,
    sourceName: action?.name,
    definitionId: action?.system?.definitionId,
    origin: action?.uuid,
    changes: [{ key: path, mode: "add", value: effect?.value, priority: 20 }]
  };
  const resolved = resolveEffectChanges([source], { systemId });
  if (!resolved.changes.length) {
    return deepFreeze({ valid: false, errors: resolved.errors.flatMap(entry => entry.errors), data: null });
  }
  const change = resolved.changes[0];
  const data = {
    name: text(action?.name) || "Action Effect",
    img: text(action?.img),
    origin: text(action?.uuid),
    changes: [{ key: change.path, mode: change.modeId, value: change.value, priority: change.priority }],
    flags: {
      [systemId]: {
        duration: text(effect?.duration),
        scope: change.provenance.scope,
        notes: text(effect?.notes),
        provenance: { ...change.provenance }
      }
    }
  };
  return deepFreeze({ valid: true, errors: [], data });
}
