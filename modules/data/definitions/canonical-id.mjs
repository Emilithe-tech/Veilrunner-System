import {
  ArchitectureValidationError,
  validationIssue,
  validationResult
} from "./validation.mjs";

export const CANONICAL_ID_PREFIX = "veilrunner";
export const CANONICAL_ID_PATTERN = /^veilrunner(?:\.[a-z0-9][a-z0-9-]*){2,}$/;

export const SEMANTIC_TYPE_DOMAINS = Object.freeze({
  action: "ability",
  ability: "ability",
  spell: "ability",
  talent: "ability",
  skill: "ability",
  quality: "quality",
  practice: "progression",
  progression: "progression",
  trait: "trait",
  condition: "effect",
  weapon: "equipment",
  armor: "equipment",
  shield: "equipment",
  ammunition: "equipment",
  magazine: "equipment",
  accessory: "equipment",
  consumable: "equipment",
  container: "equipment",
  equipment: "equipment",
  treasure: "equipment",
  species: "character",
  origin: "character",
  background: "character",
  archetype: "character",
  profession: "character",
  discipline: "character",
  language: "character"
});

const QUALITY_KINDS = new Set(["perk", "flaw"]);

/** Convert an author-facing label into one canonical lowercase ASCII segment. */
export function normalizeCanonicalSegment(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function requestScopes(request) {
  const values = request?.scopes ?? request?.scope ?? [];
  const entries = Array.isArray(values) ? values : [values];
  return entries.map(normalizeCanonicalSegment).filter(Boolean);
}

function existingDefinitionIds(entries) {
  return new Set(Array.from(entries ?? [], entry => String(
    typeof entry === "string" ? entry : entry?.definitionId ?? entry?.system?.definitionId ?? ""
  ).trim().toLowerCase()).filter(Boolean));
}

export class CanonicalIdCollisionError extends ArchitectureValidationError {
  constructor(definitionId) {
    const result = validationResult([validationIssue(
      "definition-id-collision",
      `Canonical definition ID already exists: ${definitionId}`,
      { path: "system.definitionId", details: { definitionId } }
    )]);
    super(result.errors[0].message, result);
    this.name = "CanonicalIdCollisionError";
    this.definitionId = definitionId;
  }
}

export class CanonicalIdBuilder {
  constructor({ prefix = CANONICAL_ID_PREFIX, typeDomains = SEMANTIC_TYPE_DOMAINS } = {}) {
    this.prefix = normalizeCanonicalSegment(prefix);
    this.typeDomains = Object.freeze({ ...typeDomains });
  }

  validateRequest(request = {}) {
    const issues = [];
    const type = normalizeCanonicalSegment(request.type);
    const name = normalizeCanonicalSegment(request.name);
    const classification = normalizeCanonicalSegment(request.classification ?? request.kind);
    const domain = this.typeDomains[type];

    if (!type) issues.push(validationIssue("definition-type-required", "A semantic Item type is required.", { path: "type" }));
    else if (!domain) issues.push(validationIssue("definition-type-unknown", `Unknown semantic Item type: ${request.type}`, { path: "type", details: { type } }));
    if (!name) issues.push(validationIssue("definition-name-required", "A name that produces a canonical slug is required.", { path: "name" }));
    if (type === "quality" && !QUALITY_KINDS.has(classification)) {
      issues.push(validationIssue("quality-kind-required", "Quality definitions require a perk or flaw classification.", {
        path: "classification",
        details: { classification }
      }));
    }
    return validationResult(issues);
  }

  propose(request = {}) {
    const result = this.validateRequest(request);
    if (!result.ok) throw new ArchitectureValidationError("Cannot build a canonical definition ID.", result);

    const type = normalizeCanonicalSegment(request.type);
    const domain = this.typeDomains[type];
    const classification = normalizeCanonicalSegment(request.classification ?? request.kind);
    const scopes = requestScopes(request);
    const name = normalizeCanonicalSegment(request.name);
    const semanticSegments = type === "quality"
      ? [domain, classification]
      : domain === type
        ? [domain, ...(classification ? [classification] : [])]
        : [domain, type, ...(classification ? [classification] : [])];
    const segments = Object.freeze([this.prefix, ...semanticSegments, ...scopes, name]);
    const definitionId = segments.join(".");

    return Object.freeze({ definitionId, domain, type, classification, scopes: Object.freeze(scopes), segments });
  }

  build(request = {}) {
    return this.propose(request).definitionId;
  }

  validate(definitionId) {
    const value = String(definitionId ?? "").trim();
    const issues = [];
    if (!value) {
      issues.push(validationIssue("definition-id-required", "A canonical definition ID is required.", { path: "system.definitionId" }));
    } else if (!CANONICAL_ID_PATTERN.test(value)) {
      issues.push(validationIssue("definition-id-invalid", `Invalid canonical definition ID: ${value}`, {
        path: "system.definitionId",
        details: { definitionId: value }
      }));
    }
    return validationResult(issues);
  }

  isValid(definitionId) {
    return this.validate(definitionId).ok;
  }

  parse(definitionId) {
    const result = this.validate(definitionId);
    if (!result.ok) throw new ArchitectureValidationError("Cannot parse a canonical definition ID.", result);
    const segments = Object.freeze(String(definitionId).split("."));
    return Object.freeze({
      definitionId: String(definitionId),
      prefix: segments[0],
      domain: segments[1],
      slug: segments.at(-1),
      segments
    });
  }

  assertAvailable(definitionId, entries = []) {
    const result = this.validate(definitionId);
    if (!result.ok) throw new ArchitectureValidationError("Cannot check an invalid canonical definition ID.", result);
    if (existingDefinitionIds(entries).has(definitionId)) throw new CanonicalIdCollisionError(definitionId);
    return definitionId;
  }

  /** Preserve a locked canonical ID unless an explicit migration authorizes a change. */
  forUpdate(currentDefinitionId, request = {}, { allowChange = false } = {}) {
    if (!allowChange && this.isValid(currentDefinitionId)) return currentDefinitionId;
    return this.build(request);
  }
}

export const canonicalIdBuilder = new CanonicalIdBuilder();
