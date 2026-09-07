export const REQUIREMENT_STATES = Object.freeze({
  SATISFIED: "satisfied",
  UNSATISFIED: "unsatisfied",
  UNKNOWN: "unknown-to-player"
});

const SAFE_PATH_PART = /^[A-Za-z0-9_-]+$/;

function valuesIn(collection) {
  if (Array.isArray(collection?.contents)) return collection.contents;
  return Array.from(collection?.values?.() ?? collection ?? []);
}

function readPath(object, path) {
  const parts = String(path ?? "").replace(/^system\./, "").split(".").filter(Boolean);
  if (!parts.length || parts.some(part => !SAFE_PATH_PART.test(part) || ["__proto__", "prototype", "constructor"].includes(part))) return undefined;
  return parts.reduce((value, part) => value?.[part], object?.system ?? object);
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function compare(left, operator, right) {
  switch (operator === "neq" ? "ne" : operator) {
    case "ne": return left !== right;
    case "gt": return left > right;
    case "gte": return left >= right;
    case "lt": return left < right;
    case "lte": return left <= right;
    case "includes": return Array.isArray(left) || typeof left === "string" ? left.includes(right) : false;
    default: return left === right;
  }
}

function result(state, reason = "", details = [], code = "") {
  return Object.freeze({
    state,
    satisfied: state === REQUIREMENT_STATES.SATISFIED,
    reason,
    code,
    details: Object.freeze(details)
  });
}

function publicUnknown() {
  return result(REQUIREMENT_STATES.UNKNOWN, "Requirement cannot be verified with the information available.", [], "hidden-information");
}

function entityFor(requirement, context) {
  const subject = String(requirement.subject ?? requirement.scope ?? "self");
  if (subject === "target") return context.target ?? null;
  if (subject === "source") return context.source ?? context.actor ?? null;
  return context.actor ?? null;
}

function canObserve(requirement, entity, context) {
  if (requirement.knowledge === "mechanical") return true;
  if (context.knowledge !== "player" || String(requirement.subject ?? requirement.scope ?? "self") !== "target") return true;
  if (typeof context.canObserve !== "function") return false;
  return context.canObserve(entity, requirement) === true;
}

function itemDefinitionId(item) {
  return String(item?.system?.definitionId ?? "");
}

function itemLevel(item) {
  return numeric(item?.system?.owned?.currentLevel ?? item?.system?.currentLevel ?? 1, 1);
}

function equippedItems(entity, context) {
  if (Array.isArray(context.equippedItems)) return context.equippedItems;
  return valuesIn(entity?.items).filter(item => {
    if (typeof context.isEquipped === "function") return context.isEquipped(entity, item);
    if (item?.system?.equipped === true) return true;
    const assignments = valuesIn(entity?.system?.equipmentAssignments);
    if (assignments.some(entry => entry?.itemId === item?.id)) return true;
    return Object.values(entity?.system?.equipment ?? {}).includes(item?.id);
  });
}

function effectMatches(entity, reference) {
  const needle = String(reference ?? "").toLowerCase();
  return valuesIn(entity?.effects).filter(effect => {
    const statuses = valuesIn(effect?.statuses).map(status => String(status).toLowerCase());
    return [effect?.id, effect?.name, effect?.system?.definitionId, effect?.system?.slug]
      .some(value => String(value ?? "").toLowerCase() === needle) || statuses.includes(needle);
  });
}

function presenceComparison(count, requirement) {
  const threshold = requirement.threshold ?? requirement.value;
  const expected = threshold === null || threshold === undefined || threshold === "" ? 1 : numeric(threshold, 1);
  return compare(count, requirement.operator ?? "gte", expected);
}

function leafResult(requirement, context) {
  const entity = entityFor(requirement, context);
  const subject = String(requirement.subject ?? requirement.scope ?? "self");
  if (!entity) {
    return result(REQUIREMENT_STATES.UNSATISFIED, subject === "target" ? "Requires a target." : "Required subject is unavailable.", [], "missing-subject");
  }
  if (!canObserve(requirement, entity, context)) return publicUnknown();

  const legacyKind = String(requirement.kind ?? requirement.type ?? "definition");
  const kind = ({ "health-percent": "health", "actor-type": "actorType" })[legacyKind] ?? legacyKind;
  const reference = String(requirement.reference ?? requirement.key ?? "");
  const operator = String(requirement.operator ?? "gte");
  const threshold = requirement.threshold ?? requirement.value;
  let passed = false;
  let actual;
  let expected;

  switch (kind) {
    case "level": {
      actual = numeric(readPath(entity, requirement.path || "level") ?? entity?.system?.experience?.level ?? entity?.level);
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "attribute": {
      const path = requirement.path || `attributes.${reference}`;
      actual = readPath(entity, path);
      if (actual === undefined) return result(REQUIREMENT_STATES.UNKNOWN, "Required attribute cannot be verified.", [], "missing-value");
      actual = numeric(actual);
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "trait": {
      const traits = [...valuesIn(entity?.system?.traits), ...valuesIn(entity?.system?.tags)].map(value => String(value).toLowerCase());
      actual = traits.filter(trait => trait === reference.toLowerCase()).length;
      passed = presenceComparison(actual, requirement);
      break;
    }
    case "definition": {
      const matches = valuesIn(entity?.items).filter(item => itemDefinitionId(item) === reference);
      actual = matches.length ? Math.max(...matches.map(itemLevel)) : 0;
      passed = presenceComparison(actual, requirement);
      break;
    }
    case "effect": {
      const matches = effectMatches(entity, reference);
      actual = matches.reduce((total, effect) => total + Math.max(1, numeric(
        effect?.system?.stacks ?? effect?.flags?.Veilrunner?.stacks ?? effect?.flags?.veilrunner?.stacks,
        1
      )), 0);
      passed = presenceComparison(actual, requirement);
      break;
    }
    case "equipped": {
      const matches = equippedItems(entity, context).filter(item => {
        const match = requirement.equipment ?? {};
        if (match.types?.length && !match.types.includes(item.type)) return false;
        if (match.traits?.length && !match.traits.every(trait => item.system?.traits?.includes(trait))) return false;
        if (match.definitionIds?.length && !match.definitionIds.includes(itemDefinitionId(item))) return false;
        if (match.capabilities?.length && !match.capabilities.every(capability => itemCapabilities(item)[capability] === true)) return false;
        if (match.timing && match.timing !== item.system?.timing?.type) return false;
        if (!reference) return true;
        const traits = valuesIn(item?.system?.traits).map(value => String(value));
        return item?.type === reference || itemDefinitionId(item) === reference || traits.includes(reference);
      });
      actual = matches.length;
      passed = presenceComparison(actual, requirement);
      break;
    }
    case "resource": {
      actual = numeric(readPath(entity, requirement.path || `resources.${reference}.value`));
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "health": {
      const pool = readPath(entity, requirement.path || "resources.health") ?? {};
      actual = numeric(pool.max) > 0 ? (numeric(pool.value) / numeric(pool.max)) * 100 : 0;
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "actorType": {
      actual = String(entity?.type ?? "");
      expected = String(threshold ?? reference);
      passed = compare(actual, operator, expected);
      break;
    }
    case "range": {
      actual = context.distance;
      if (!Number.isFinite(Number(actual))) return result(REQUIREMENT_STATES.UNKNOWN, "Range cannot be verified.", [], "missing-value");
      actual = numeric(actual);
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "progressionNode": {
      const purchased = context.progressionNodes ?? entity?.system?.talentTree?.leaves ?? [];
      actual = valuesIn(purchased).find(entry => String(entry?.id ?? entry?.nodeId) === reference)?.rank ?? 0;
      passed = presenceComparison(numeric(actual), requirement);
      break;
    }
    case "practiceInvestment": {
      const investments = context.practiceInvestment ?? entity?.system?.practiceInvestment ?? {};
      actual = numeric(investments instanceof Map ? investments.get(reference) : investments?.[reference]);
      expected = numeric(threshold);
      passed = compare(actual, operator, expected);
      break;
    }
    case "license": {
      const licenses = valuesIn(context.licenses ?? entity?.system?.licenses).map(value => String(value?.definitionId ?? value?.id ?? value));
      actual = licenses.filter(value => value === reference).length;
      passed = presenceComparison(actual, requirement);
      break;
    }
    default:
      return result(REQUIREMENT_STATES.UNKNOWN, "Requirement type cannot be verified.", [], "unknown-requirement-kind");
  }

  const description = String(requirement.description ?? "").trim();
  return result(
    passed ? REQUIREMENT_STATES.SATISFIED : REQUIREMENT_STATES.UNSATISFIED,
    passed ? "" : description || "Requirement is not satisfied.",
    [],
    passed ? "" : "comparison-failed"
  );
}

function evaluateAll(requirements, context) {
  const details = requirements.map(requirement => Object.freeze({ requirement, result: leafResult(requirement, context) }));
  const failed = details.find(detail => detail.result.state === REQUIREMENT_STATES.UNSATISFIED);
  if (failed) return result(REQUIREMENT_STATES.UNSATISFIED, failed.result.reason, details, failed.result.code);
  const unknown = details.find(detail => detail.result.state === REQUIREMENT_STATES.UNKNOWN);
  if (unknown) return result(REQUIREMENT_STATES.UNKNOWN, unknown.result.reason, details, unknown.result.code);
  return result(REQUIREMENT_STATES.SATISFIED, "", details);
}

function evaluateAny(requirements, context) {
  if (!requirements.length) return result(REQUIREMENT_STATES.SATISFIED);
  const details = requirements.map(requirement => Object.freeze({ requirement, result: leafResult(requirement, context) }));
  if (details.some(detail => detail.result.state === REQUIREMENT_STATES.SATISFIED)) return result(REQUIREMENT_STATES.SATISFIED, "", details);
  const unknown = details.find(detail => detail.result.state === REQUIREMENT_STATES.UNKNOWN);
  if (unknown) return result(REQUIREMENT_STATES.UNKNOWN, unknown.result.reason, details, unknown.result.code);
  return result(REQUIREMENT_STATES.UNSATISFIED, details[0]?.result.reason || "No alternative requirement is satisfied.", details, "no-alternative-satisfied");
}

function evaluateNone(requirements, context) {
  if (!requirements.length) return result(REQUIREMENT_STATES.SATISFIED);
  const details = requirements.map(requirement => Object.freeze({ requirement, result: leafResult(requirement, context) }));
  const present = details.find(detail => detail.result.state === REQUIREMENT_STATES.SATISFIED);
  if (present) return result(REQUIREMENT_STATES.UNSATISFIED, "A forbidden requirement is present.", details, "forbidden-requirement-present");
  const unknown = details.find(detail => detail.result.state === REQUIREMENT_STATES.UNKNOWN);
  if (unknown) return result(REQUIREMENT_STATES.UNKNOWN, unknown.result.reason, details, unknown.result.code);
  return result(REQUIREMENT_STATES.SATISFIED, "", details);
}

/** Evaluate the shared all/any/none contract without mutating actor or target state. */
export function evaluateRequirements(requirements = {}, context = {}) {
  const set = Array.isArray(requirements) ? { all: requirements } : requirements ?? {};
  const safeContext = { knowledge: "mechanical", ...context };
  const groups = Object.freeze({
    all: evaluateAll(valuesIn(set.all), safeContext),
    any: evaluateAny(valuesIn(set.any), safeContext),
    none: evaluateNone(valuesIn(set.none), safeContext)
  });
  const failed = Object.values(groups).find(group => group.state === REQUIREMENT_STATES.UNSATISFIED);
  if (failed) return Object.freeze({ ...result(REQUIREMENT_STATES.UNSATISFIED, failed.reason, Object.values(groups), failed.code), groups });
  const unknown = Object.values(groups).find(group => group.state === REQUIREMENT_STATES.UNKNOWN);
  if (unknown) return Object.freeze({ ...result(REQUIREMENT_STATES.UNKNOWN, unknown.reason, Object.values(groups), unknown.code), groups });
  return Object.freeze({ ...result(REQUIREMENT_STATES.SATISFIED, "", Object.values(groups)), groups });
}

export class RequirementEvaluator {
  evaluate(requirements, context = {}) {
    return evaluateRequirements(requirements, context);
  }
}
import { itemCapabilities } from "../data/definitions/item-capabilities.mjs";
