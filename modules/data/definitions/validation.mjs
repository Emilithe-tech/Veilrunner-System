export const VALIDATION_SEVERITIES = Object.freeze(["error", "warning"]);

/** Build one serializable validation issue for schemas, services, and authoring UI. */
export function validationIssue(code, message, {
  severity = "error",
  path = "",
  details = undefined
} = {}) {
  if (!VALIDATION_SEVERITIES.includes(severity)) {
    throw new TypeError(`Unknown validation severity: ${severity}`);
  }
  return Object.freeze({
    code: String(code ?? "validation-error"),
    message: String(message ?? "Validation failed."),
    severity,
    path: String(path ?? ""),
    ...(details === undefined ? {} : { details })
  });
}

/** Normalize issues into one immutable result contract. */
export function validationResult(issues = []) {
  const entries = Object.freeze(Array.from(issues ?? []));
  const errors = Object.freeze(entries.filter(issue => issue?.severity !== "warning"));
  const warnings = Object.freeze(entries.filter(issue => issue?.severity === "warning"));
  return Object.freeze({ ok: errors.length === 0, issues: entries, errors, warnings });
}

export function combineValidationResults(...results) {
  return validationResult(results.flatMap(result => result?.issues ?? []));
}

export class ArchitectureValidationError extends Error {
  constructor(message, result, options = {}) {
    super(message, options);
    this.name = "ArchitectureValidationError";
    this.result = result?.issues ? result : validationResult(result ?? []);
    this.issues = this.result.issues;
  }
}

export function assertValid(result, message = "Veilrunner data validation failed.") {
  if (!result?.ok) throw new ArchitectureValidationError(message, result);
  return result;
}
