import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import {
  ArchitectureValidationError,
  validationIssue,
  validationResult
} from "../definitions/validation.mjs";

export const PROGRESSION_DEFINITION_PICKER_VERSION = 1;
export const PROGRESSION_PLACEABLE_TYPES = Object.freeze(["practice", "spell", "skill"]);

const PLACEABLE_TYPES = new Set(PROGRESSION_PLACEABLE_TYPES);
const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
const text = value => String(value ?? "").trim();
const token = value => text(value).toLowerCase();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function issue(code, message, path, details) {
  return validationIssue(code, message, { path, ...(details === undefined ? {} : { details }) });
}

function requiredMethod(owner, method, label) {
  if (typeof owner?.[method] !== "function") throw new TypeError(`${label} must implement ${method}().`);
}

function progressionType(progression) {
  return text(progression?.type ?? progression?._source?.type);
}

function progressionCategory(progression) {
  const definitionId = text(progression?.system?.definitionId ?? progression?._source?.system?.definitionId);
  const match = /^veilrunner\.progression\.(magic|skills)$/.exec(definitionId);
  return match?.[1] ?? "";
}

function typeAllowedForCategory(type, category) {
  if (type === "practice") return true;
  return category === "magic" ? type === "spell" : category === "skills" ? type === "skill" : false;
}

export class ProgressionDefinitionPickerValidationError extends ArchitectureValidationError {
  constructor(message, result) {
    super(message, result);
    this.name = "ProgressionDefinitionPickerValidationError";
    this.code = "progression-definition-picker-validation-failed";
  }
}

export class ProgressionDefinitionPickerError extends Error {
  constructor(code, message, { cause = null, details = {} } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProgressionDefinitionPickerError";
    this.code = code;
    this.details = deepFreeze(clone(details));
  }
}

/**
 * Produces immutable, reference-only placement candidates from the canonical
 * definition index. It has no Foundry, UI, write-store, or World Item fallback.
 */
export class ProgressionDefinitionPickerService {
  constructor({ index, progressionStore, idBuilder = canonicalIdBuilder } = {}) {
    requiredMethod(index, "records", "index");
    requiredMethod(index, "audit", "index");
    requiredMethod(progressionStore, "readGraph", "progressionStore");
    requiredMethod(idBuilder, "validate", "idBuilder");
    this.index = index;
    this.progressionStore = progressionStore;
    this.idBuilder = idBuilder;
  }

  async list({ progression, query = "", types = PROGRESSION_PLACEABLE_TYPES, school = "", practice = "", limit = 100 } = {}) {
    const issues = [];
    if (!progression || progressionType(progression) !== "progression") {
      issues.push(issue("progression-type-invalid", "Definition placement requires a Progression Item.", "progression.type", { type: progressionType(progression) }));
    }
    const category = progressionCategory(progression);
    if (!category) issues.push(issue("progression-category-invalid", "Definition placement requires the canonical Magic or Skills Progression identity.", "progression.system.definitionId"));
    const requestedTypes = [...new Set(Array.from(types ?? [], token).filter(Boolean))];
    if (!requestedTypes.length || requestedTypes.some(type => !PLACEABLE_TYPES.has(type))) {
      issues.push(issue("picker-types-invalid", "Picker types must be a non-empty subset of practice, spell, and skill.", "types", { types: requestedTypes }));
    }
    const boundedLimit = Number(limit);
    if (!Number.isInteger(boundedLimit) || boundedLimit < 1 || boundedLimit > 500) {
      issues.push(issue("picker-limit-invalid", "Picker limit must be an integer from 1 through 500.", "limit", { limit }));
    }
    const validation = validationResult(issues);
    if (!validation.ok) throw new ProgressionDefinitionPickerValidationError("Progression definition picker request is invalid.", validation);

    let graph;
    let records;
    try {
      [graph, records] = await Promise.all([
        this.progressionStore.readGraph(progression),
        this.index.records()
      ]);
    } catch (cause) {
      throw new ProgressionDefinitionPickerError("picker-read-failed", `Canonical placement candidates could not be read: ${cause?.message ?? cause}`, { cause });
    }
    if (!graph || !Array.isArray(graph.nodes)) {
      throw new ProgressionDefinitionPickerError("progression-graph-invalid", "Progression picker requires a readable graph node array.");
    }
    if (!Array.isArray(records)) {
      throw new ProgressionDefinitionPickerError("definition-index-invalid", "Canonical definition index did not return an array.");
    }
    const audit = this.index.audit();
    if ((audit?.duplicates?.length ?? 0) || (audit?.invalid?.length ?? 0)) {
      throw new ProgressionDefinitionPickerError("definition-index-ambiguous", "Canonical definition index contains duplicate or invalid identities.", { details: audit });
    }

    const placed = new Set(graph.nodes.map(node => text(node?.definitionId)).filter(Boolean));
    const queryToken = token(query);
    const schoolToken = token(school);
    const practiceToken = token(practice);
    const allowedTypes = new Set(requestedTypes);
    const candidates = [];
    const excludedPlaced = [];
    const excludedInvalid = [];
    for (const record of records) {
      const definitionId = text(record?.definitionId);
      const type = token(record?.type);
      if (!allowedTypes.has(type) || !typeAllowedForCategory(type, category)) continue;
      const identity = this.idBuilder.validate(definitionId);
      const recordCategory = token(record?.category);
      if (!identity.ok || recordCategory !== category) {
        excludedInvalid.push({ definitionId, reason: !identity.ok ? "invalid-identity" : "classification-mismatch" });
        continue;
      }
      if (schoolToken && token(record?.school) !== schoolToken) continue;
      if (practiceToken && token(record?.practice) !== practiceToken) continue;
      const haystack = token(record?.searchText || [record?.name, type, record?.school, record?.practice, definitionId].join(" "));
      if (queryToken && !haystack.includes(queryToken)) continue;
      if (placed.has(definitionId)) {
        excludedPlaced.push(definitionId);
        continue;
      }
      candidates.push({
        definitionId,
        documentId: text(record?.documentId),
        uuid: text(record?.uuid),
        name: text(record?.name),
        type,
        img: text(record?.img),
        category: recordCategory,
        school: text(record?.school),
        practice: text(record?.practice),
        packCollection: text(record?.packCollection)
      });
    }
    candidates.sort((left, right) => left.name.localeCompare(right.name) || left.definitionId.localeCompare(right.definitionId));
    return deepFreeze({
      version: PROGRESSION_DEFINITION_PICKER_VERSION,
      operation: "list-placement-candidates",
      category,
      query: text(query),
      filters: { types: [...requestedTypes], school: text(school), practice: text(practice) },
      items: candidates.slice(0, boundedLimit),
      total: candidates.length,
      excludedPlaced: [...new Set(excludedPlaced)].sort(),
      excludedInvalid,
      truncated: candidates.length > boundedLimit
    });
  }
}
