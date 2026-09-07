import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import { ArchitectureValidationError } from "../definitions/validation.mjs";

export const DEFINITION_REFERENCE_DISCOVERY_VERSION = 1;
export const DEFINITION_REFERENCE_SCOPES = Object.freeze([
  "progression-nodes",
  "canonical-definitions",
  "world-items",
  "actor-items",
  "semantic-links",
  "world-settings"
]);
export const HISTORICAL_REFERENCE_PATH_PREFIXES = Object.freeze([
  "flags.Veilrunner.migrations"
]);

const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function compareEvidence(left, right) {
  return [left.scope, left.ownerId, left.recordId, left.path, left.location, left.occurrenceKind, left.code]
    .map(text).join(":")
    .localeCompare([right.scope, right.ownerId, right.recordId, right.path, right.location, right.occurrenceKind, right.code].map(text).join(":"));
}

function countBy(values, keyOf) {
  const counts = {};
  for (const value of values) {
    const key = text(keyOf(value)) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function pathJoin(prefix, path) {
  return [text(prefix), text(path)].filter(Boolean).join(".") || "$";
}

function propertyKeyPath(path, key) {
  return `${text(path) || "$"}[${JSON.stringify(String(key))}]`;
}

function pathWithin(path, prefix) {
  const value = text(path);
  const base = text(prefix);
  return Boolean(base) && (
    value === base
    || value.startsWith(`${base}.`)
    || value.endsWith(`.${base}`)
    || value.includes(`.${base}.`)
  );
}

function recordIdentity(scope, record) {
  const value = record?.value;
  return {
    scope,
    ownerId: text(record?.ownerId),
    ownerName: text(record?.ownerName),
    ownerType: text(record?.ownerType),
    collection: text(record?.collection),
    recordId: text(record?.recordId ?? value?._id ?? value?.id),
    recordName: text(record?.recordName ?? value?.name)
  };
}

function unresolvedRecord(scope, record, code, message, path = "") {
  return Object.freeze({
    ...recordIdentity(scope, record),
    code,
    message,
    path: pathJoin(record?.pathPrefix, path)
  });
}

function occurrenceKind(scope, relativePath) {
  if (scope === "progression-nodes") return "progression-node-reference";
  if (scope === "canonical-definitions") return "canonical-definition-reference";
  if (scope === "world-items") return relativePath === "system.definitionId" ? "world-item-snapshot" : "world-item-reference";
  if (scope === "actor-items") return relativePath === "system.definitionId" ? "actor-item-snapshot" : "actor-item-reference";
  if (scope === "semantic-links") return "semantic-link";
  if (scope === "world-settings") return "world-setting-reference";
  return "definition-reference";
}

function walkScalarStrings(value, visit, onUnresolved, path = "", seen = new WeakSet()) {
  if (typeof value === "string") {
    visit(value, path, "value");
    return 1;
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return 0;
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    onUnresolved("unsupported-value", `Unsupported ${value === undefined ? "undefined" : typeof value} value.`, path);
    return 0;
  }
  if (typeof value !== "object") return 0;
  if (seen.has(value)) {
    onUnresolved("cyclic-value", "Cyclic source data cannot be exhaustively inspected.", path);
    return 0;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.reduce((count, entry, index) => count + walkScalarStrings(entry, visit, onUnresolved, path ? `${path}.${index}` : String(index), seen), 0);
  }

  let prototype;
  let entries;
  try {
    prototype = Object.getPrototypeOf(value);
    entries = Object.entries(value);
  } catch (error) {
    onUnresolved("unreadable-value", `Source data could not be enumerated: ${error instanceof Error ? error.message : String(error)}`, path);
    return 0;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    onUnresolved("unsupported-object", `Unsupported source object: ${prototype?.constructor?.name ?? "unknown"}.`, path);
    return 0;
  }
  return entries.reduce((count, [key, entry]) => {
    visit(key, propertyKeyPath(path, key), "key");
    return count + walkScalarStrings(entry, visit, onUnresolved, path ? `${path}.${key}` : key, seen);
  }, 0);
}

function normalizeProviderEvidence(scope, entry, fallbackCode) {
  const source = entry && typeof entry === "object" ? entry : {};
  return Object.freeze({
    scope,
    ownerId: text(source.ownerId),
    ownerName: text(source.ownerName),
    ownerType: text(source.ownerType),
    collection: text(source.collection),
    recordId: text(source.recordId),
    recordName: text(source.recordName),
    path: text(source.path),
    code: text(source.code) || fallbackCode,
    message: text(source.message) || "Reference source could not be inspected completely."
  });
}

async function invokeReader(reader) {
  if (typeof reader === "function") return reader();
  if (typeof reader?.read === "function") return reader.read();
  throw new TypeError("Reference scope reader must be a function or implement read().");
}

function readerFor(readers, scope) {
  return readers instanceof Map ? readers.get(scope) : readers?.[scope];
}

function normalizeScopes(scopes) {
  return [...new Set(Array.from(scopes ?? [], value => text(value)).filter(Boolean))];
}

export class DefinitionReferenceDiscoveryValidationError extends ArchitectureValidationError {
  constructor(message, result) {
    super(message, result);
    this.name = "DefinitionReferenceDiscoveryValidationError";
    this.code = "definition-reference-discovery-validation-failed";
  }
}

/**
 * Scans plain, decoded snapshots supplied by explicit scope readers. Readers
 * must return every record in their scope as { complete, records, ... } and
 * never filter by the requested definition ID.
 */
export class DefinitionReferenceDiscovery {
  constructor({
    readers = {},
    idBuilder = canonicalIdBuilder,
    scopes = DEFINITION_REFERENCE_SCOPES,
    historicalPathPrefixes = HISTORICAL_REFERENCE_PATH_PREFIXES
  } = {}) {
    if (typeof idBuilder?.validate !== "function") throw new TypeError("idBuilder must implement validate().");
    const normalizedScopes = normalizeScopes(scopes);
    if (!normalizedScopes.length) throw new TypeError("scopes must contain at least one explicit reference scope.");
    this.readers = readers;
    this.idBuilder = idBuilder;
    this.scopes = Object.freeze(normalizedScopes);
    this.historicalPathPrefixes = Object.freeze(normalizeScopes(historicalPathPrefixes));
  }

  async #readScope(scope, definitionId) {
    const reader = readerFor(this.readers, scope);
    if (!reader) {
      return {
        scanned: false,
        records: 0,
        strings: 0,
        references: [],
        identities: [],
        excluded: [],
        unresolved: [],
        failures: [Object.freeze({ scope, code: "scope-reader-missing", message: `Reference reader is missing for scope: ${scope}` })]
      };
    }

    let result;
    try {
      result = await invokeReader(reader);
    } catch (error) {
      return {
        scanned: false,
        records: 0,
        strings: 0,
        references: [],
        identities: [],
        excluded: [],
        unresolved: [],
        failures: [Object.freeze({ scope, code: "scope-read-failed", message: error instanceof Error ? error.message : String(error) })]
      };
    }
    if (!result || typeof result !== "object" || Array.isArray(result) || !Array.isArray(result.records)) {
      return {
        scanned: false,
        records: 0,
        strings: 0,
        references: [],
        identities: [],
        excluded: [],
        unresolved: [],
        failures: [Object.freeze({ scope, code: "scope-result-invalid", message: `Reference reader returned an invalid result for scope: ${scope}` })]
      };
    }

    const failuresValid = result.failures === undefined || Array.isArray(result.failures);
    const unresolvedValid = result.unresolved === undefined || Array.isArray(result.unresolved);
    const failures = list(result.failures).map(entry => normalizeProviderEvidence(scope, entry, "scope-read-failed"));
    if (!failuresValid || !unresolvedValid) {
      failures.push(Object.freeze({ scope, code: "scope-result-invalid", message: `Reference reader returned malformed evidence arrays for scope: ${scope}` }));
    }
    if (result.complete !== true) failures.push(Object.freeze({ scope, code: "scope-read-incomplete", message: `Reference reader did not declare scope complete: ${scope}` }));
    const unresolved = list(result.unresolved).map(entry => normalizeProviderEvidence(scope, entry, "scope-source-unresolved"));
    const references = [];
    const identities = [];
    const excluded = [];
    let records = 0;
    let strings = 0;

    for (const record of result.records) {
      records += 1;
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        unresolved.push(unresolvedRecord(scope, record, "record-invalid", "Reference source record must be an object."));
        continue;
      }
      const identity = recordIdentity(scope, record);
      if (!identity.recordId) {
        unresolved.push(unresolvedRecord(scope, record, "record-id-missing", "Reference source record requires a stable record ID."));
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(record, "value")) {
        unresolved.push(unresolvedRecord(scope, record, "record-value-missing", "Reference source record requires decoded value data."));
        continue;
      }
      const canonicalIdentityPath = text(record.identityPath) || "system.definitionId";
      const visit = (value, relativePath, location) => {
        if (value !== definitionId) return;
        const path = pathJoin(record.pathPrefix, relativePath);
        const evidence = {
          ...identity,
          definitionId,
          path,
          location
        };
        if (this.historicalPathPrefixes.some(prefix => pathWithin(relativePath, prefix) || pathWithin(path, prefix))) {
          excluded.push(Object.freeze({ ...evidence, occurrenceKind: "historical-provenance" }));
        } else if (scope === "canonical-definitions" && location === "value" && relativePath === canonicalIdentityPath) {
          identities.push(Object.freeze({ ...evidence, occurrenceKind: "canonical-definition-identity" }));
        } else {
          references.push(Object.freeze({ ...evidence, occurrenceKind: occurrenceKind(scope, relativePath) }));
        }
      };
      strings += walkScalarStrings(record.value, visit, (code, message, path) => {
        unresolved.push(unresolvedRecord(scope, record, code, message, path));
      });
    }
    return {
      scanned: result.complete === true && failures.length === 0,
      records,
      strings,
      references,
      identities,
      excluded,
      unresolved,
      failures
    };
  }

  async discover(definitionId) {
    const canonicalId = text(definitionId);
    const validation = this.idBuilder.validate(canonicalId);
    if (!validation.ok) throw new DefinitionReferenceDiscoveryValidationError("Canonical definition identity is invalid.", validation);

    const outcomes = await Promise.all(this.scopes.map(scope => this.#readScope(scope, canonicalId)));
    const scannedScopes = this.scopes.filter((scope, index) => outcomes[index].scanned);
    const references = outcomes.flatMap(outcome => outcome.references).sort(compareEvidence);
    const identities = outcomes.flatMap(outcome => outcome.identities).sort(compareEvidence);
    const excluded = outcomes.flatMap(outcome => outcome.excluded).sort(compareEvidence);
    const unresolved = outcomes.flatMap(outcome => outcome.unresolved).sort(compareEvidence);
    const failures = outcomes.flatMap(outcome => outcome.failures).sort(compareEvidence);
    const complete = scannedScopes.length === this.scopes.length && failures.length === 0;

    return deepFreeze({
      version: DEFINITION_REFERENCE_DISCOVERY_VERSION,
      definitionId: canonicalId,
      complete,
      scannedScopes,
      references,
      unresolved,
      failures,
      identities,
      excluded,
      summary: {
        requiredScopes: this.scopes.length,
        scannedScopes: scannedScopes.length,
        records: outcomes.reduce((total, outcome) => total + outcome.records, 0),
        stringValues: outcomes.reduce((total, outcome) => total + outcome.strings, 0),
        references: references.length,
        identities: identities.length,
        excluded: excluded.length,
        unresolved: unresolved.length,
        failures: failures.length,
        referencesByScope: countBy(references, entry => entry.scope),
        referencesByKind: countBy(references, entry => entry.occurrenceKind)
      }
    });
  }
}
