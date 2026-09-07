import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";

export const PROGRESSION_CANVAS_INTENT_VERSION = 2;
export const PROGRESSION_CANVAS_OPERATIONS = Object.freeze([
  "create-content",
  "place-existing",
  "remove-node",
  "update-layout",
  "replace-connections"
]);

const OPERATION_METHODS = Object.freeze({
  "create-content": "createContent",
  "place-existing": "placeExisting",
  "remove-node": "removeNode",
  "update-layout": "updateLayout",
  "replace-connections": "replaceConnections"
});
const PAGE_TYPES = Object.freeze({
  magic: new Set(["practice", "spell"]),
  skills: new Set(["practice", "skill"])
});
const PAYLOAD_FIELDS = Object.freeze({
  "create-content": new Set(["definitionSource", "idRequest", "node", "edges"]),
  "place-existing": new Set(["definitionId", "node", "edges"]),
  "remove-node": new Set(["nodeId"]),
  "update-layout": new Set(["positions"]),
  "replace-connections": new Set(["edges"])
});
const NODE_FIELDS = new Set([
  "id",
  "kind",
  "definitionId",
  "position",
  "tier",
  "rankLimit",
  "purchase",
  "rankPurchase",
  "requirements",
  "presentation"
]);
const EDGE_FIELDS = new Set(["id", "sourceId", "targetId", "kind", "requiredRank", "style"]);
const TOP_LEVEL_FIELDS = new Set(["operation", "page", "payload"]);

const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
const text = value => String(value ?? "").trim();
const token = value => text(value).toLowerCase();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function issue(code, message, path, details = {}) {
  return deepFreeze({ code, message, path, details: clone(details) });
}

function unknownFields(value, allowed, path, issues) {
  if (!record(value)) return;
  for (const field of Object.keys(value)) if (!allowed.has(field)) {
    issues.push(issue("canvas-intent-field-unsupported", `Canvas intent field '${field}' is not supported.`, `${path}.${field}`, { field }));
  }
}

function validateNode(node, issues) {
  if (!record(node)) {
    issues.push(issue("canvas-node-required", "A canonical graph node request is required.", "payload.node"));
    return;
  }
  unknownFields(node, NODE_FIELDS, "payload.node", issues);
  const nodeId = text(node.id);
  if (!nodeId) issues.push(issue("canvas-node-id-required", "A stable graph node ID is required.", "payload.node.id"));
  const x = node.position?.x;
  const y = node.position?.y;
  if (x === null || text(x) === "" || !Number.isFinite(Number(x)) || y === null || text(y) === "" || !Number.isFinite(Number(y))) {
    issues.push(issue("canvas-node-position-invalid", "Canvas placement requires finite x and y coordinates.", "payload.node.position"));
  }
}

function validateEdges(edges, nodeId, issues) {
  if (!Array.isArray(edges) || !edges.length) {
    issues.push(issue("canvas-incoming-edges-required", "Canvas placement requires at least one complete incoming edge.", "payload.edges"));
    return;
  }
  const ids = new Set();
  for (const [index, edge] of edges.entries()) {
    const path = `payload.edges.${index}`;
    if (!record(edge)) {
      issues.push(issue("canvas-edge-invalid", "Each canvas edge must be an object.", path));
      continue;
    }
    unknownFields(edge, EDGE_FIELDS, path, issues);
    const edgeId = text(edge.id);
    const sourceId = text(edge.sourceId);
    const targetId = text(edge.targetId);
    if (!edgeId) issues.push(issue("canvas-edge-id-required", "Each canvas edge requires a stable ID.", `${path}.id`));
    else if (ids.has(edgeId)) issues.push(issue("canvas-edge-id-duplicate", `Duplicate incoming edge ID: ${edgeId}`, `${path}.id`, { edgeId }));
    else ids.add(edgeId);
    if (!sourceId) issues.push(issue("canvas-edge-source-required", "Each canvas edge requires a source node ID.", `${path}.sourceId`));
    if (!targetId) issues.push(issue("canvas-edge-target-required", "Each canvas edge requires a target node ID.", `${path}.targetId`));
    else if (nodeId && targetId !== nodeId) {
      issues.push(issue("canvas-edge-target-mismatch", "Every placement edge must target the requested node.", `${path}.targetId`, { expected: nodeId, actual: targetId }));
    }
  }
}

function validateLayoutPositions(positions, issues) {
  if (!Array.isArray(positions) || !positions.length) {
    issues.push(issue("canvas-layout-positions-required", "Canvas layout requires at least one node position.", "payload.positions"));
    return;
  }
  const ids = new Set();
  for (const [index, entry] of positions.entries()) {
    const path = `payload.positions.${index}`;
    if (!record(entry)) {
      issues.push(issue("canvas-layout-position-invalid", "Each canvas layout entry must be an object.", path));
      continue;
    }
    unknownFields(entry, new Set(["nodeId", "position"]), path, issues);
    const nodeId = text(entry.nodeId);
    if (!nodeId) issues.push(issue("canvas-node-id-required", "Each canvas layout entry requires a node ID.", `${path}.nodeId`));
    else if (ids.has(nodeId)) issues.push(issue("canvas-layout-node-duplicate", `Canvas layout node is repeated: ${nodeId}`, `${path}.nodeId`, { nodeId }));
    else ids.add(nodeId);
    if (!record(entry.position)) {
      issues.push(issue("canvas-layout-position-invalid", "Each canvas layout entry requires a position object.", `${path}.position`));
      continue;
    }
    unknownFields(entry.position, new Set(["x", "y"]), `${path}.position`, issues);
    const x = entry.position.x;
    const y = entry.position.y;
    if (x === null || text(x) === "" || !Number.isFinite(Number(x)) || y === null || text(y) === "" || !Number.isFinite(Number(y))) {
      issues.push(issue("canvas-layout-position-invalid", "Canvas layout coordinates must be finite numbers.", `${path}.position`));
    }
  }
}

function validateReplacementEdges(edges, issues) {
  if (!Array.isArray(edges)) {
    issues.push(issue("canvas-connections-required", "Canvas connection replacement requires the complete edge array.", "payload.edges"));
    return;
  }
  const ids = new Set();
  for (const [index, edge] of edges.entries()) {
    const path = `payload.edges.${index}`;
    if (!record(edge)) {
      issues.push(issue("canvas-edge-invalid", "Each canvas edge must be an object.", path));
      continue;
    }
    unknownFields(edge, EDGE_FIELDS, path, issues);
    const edgeId = text(edge.id);
    if (!edgeId) issues.push(issue("canvas-edge-id-required", "Each canvas edge requires a stable ID.", `${path}.id`));
    else if (ids.has(edgeId)) issues.push(issue("canvas-edge-id-duplicate", `Duplicate canvas edge ID: ${edgeId}`, `${path}.id`, { edgeId }));
    else ids.add(edgeId);
    if (!text(edge.sourceId)) issues.push(issue("canvas-edge-source-required", "Each canvas edge requires a source node ID.", `${path}.sourceId`));
    if (!text(edge.targetId)) issues.push(issue("canvas-edge-target-required", "Each canvas edge requires a target node ID.", `${path}.targetId`));
  }
}

function validationFailure(issues) {
  if (issues.length) throw new ProgressionCanvasIntentValidationError("Progression canvas intent is invalid.", issues);
}

function requestFor(operation, page, payload, issues, idBuilder) {
  unknownFields(payload, PAYLOAD_FIELDS[operation], "payload", issues);
  if (operation === "update-layout") {
    validateLayoutPositions(payload.positions, issues);
    return { page, positions: clone(payload.positions) };
  }
  if (operation === "replace-connections") {
    validateReplacementEdges(payload.edges, issues);
    return { page, edges: clone(payload.edges) };
  }
  if (operation === "remove-node") {
    const nodeId = text(payload.nodeId);
    if (!nodeId) issues.push(issue("canvas-node-id-required", "A stable graph node ID is required.", "payload.nodeId"));
    if (nodeId.startsWith("root:")) issues.push(issue("canvas-root-removal-forbidden", "A Progression root cannot be removed.", "payload.nodeId", { nodeId }));
    return { page, nodeId };
  }

  validateNode(payload.node, issues);
  const nodeId = text(payload.node?.id);
  validateEdges(payload.edges, nodeId, issues);
  if (operation === "place-existing") {
    const definitionId = text(payload.definitionId);
    if (!definitionId) issues.push(issue("canvas-definition-id-required", "Existing-content placement requires a canonical definition ID.", "payload.definitionId"));
    else {
      const identity = idBuilder.validate(definitionId);
      if (!identity.ok) issues.push(issue("canvas-definition-id-invalid", "Existing-content placement requires a valid canonical definition ID.", "payload.definitionId", { definitionId, issues: identity.issues }));
    }
    return { page, definitionId, node: clone(payload.node), edges: clone(payload.edges) };
  }

  if (!record(payload.definitionSource)) issues.push(issue("canvas-definition-source-required", "Content creation requires a canonical definition source.", "payload.definitionSource"));
  const type = token(payload.definitionSource?.type);
  if (!type) issues.push(issue("canvas-definition-type-required", "Content creation requires an Item type.", "payload.definitionSource.type"));
  else if (!PAGE_TYPES[page].has(type)) {
    issues.push(issue("canvas-definition-type-page-mismatch", `Item type '${type}' cannot be created on the ${page} page.`, "payload.definitionSource.type", { page, type }));
  }
  const expectedKind = type === "practice" ? "practice" : "content";
  const requestedKind = token(payload.node?.kind);
  if (requestedKind && requestedKind !== expectedKind) {
    issues.push(issue("canvas-node-kind-mismatch", `Item type '${type}' must use a '${expectedKind}' graph node.`, "payload.node.kind", { expected: expectedKind, actual: requestedKind }));
  }
  if (payload.idRequest !== undefined && !record(payload.idRequest)) {
    issues.push(issue("canvas-id-request-invalid", "Canonical identity input must be an object.", "payload.idRequest"));
  }
  return {
    page,
    definitionSource: clone(payload.definitionSource),
    idRequest: clone(payload.idRequest ?? {}),
    node: clone(payload.node),
    edges: clone(payload.edges)
  };
}

export class ProgressionCanvasIntentValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ProgressionCanvasIntentValidationError";
    this.code = "progression-canvas-intent-validation-failed";
    this.status = "failed";
    this.stage = "canvas-intent-validation";
    this.issues = deepFreeze(issues.map(entry => clone(entry)));
  }
}

/** Convert one UI-safe intent into the exact page-oriented runtime request. */
export function prepareProgressionCanvasIntent(intent, { idBuilder = canonicalIdBuilder } = {}) {
  const issues = [];
  if (!record(intent)) throw new ProgressionCanvasIntentValidationError("Progression canvas intent is invalid.", [issue("canvas-intent-required", "A canvas intent object is required.", "intent")]);
  unknownFields(intent, TOP_LEVEL_FIELDS, "intent", issues);
  const operation = token(intent.operation);
  const page = token(intent.page);
  if (!PROGRESSION_CANVAS_OPERATIONS.includes(operation)) {
    issues.push(issue("canvas-operation-invalid", "Canvas operation must be create-content, place-existing, remove-node, update-layout, or replace-connections.", "intent.operation", { operation }));
  }
  if (!Object.hasOwn(PAGE_TYPES, page)) issues.push(issue("canvas-page-invalid", "Canvas intents require the magic or skills page.", "intent.page", { page }));
  if (!record(intent.payload)) issues.push(issue("canvas-payload-required", "A canvas operation payload is required.", "intent.payload"));
  validationFailure(issues);
  const request = requestFor(operation, page, intent.payload, issues, idBuilder);
  validationFailure(issues);
  return deepFreeze({
    version: PROGRESSION_CANVAS_INTENT_VERSION,
    operation,
    method: OPERATION_METHODS[operation],
    page,
    request
  });
}

function errorIssues(error) {
  const entries = error?.issues ?? error?.result?.issues ?? [];
  return Array.isArray(entries) ? clone(entries) : [];
}

function errorRollback(error) {
  return Array.isArray(error?.rollback) ? clone(error.rollback) : [];
}

function failureState(status, code) {
  if (code === "live-mutation-not-authorized") return "blocked";
  if (["rolled-back", "partial", "unknown"].includes(status)) return status;
  return "refused";
}

export function projectProgressionCanvasFailure(prepared, error) {
  // The pack coordinator wraps operation failures after restoring locks. Preserve
  // the underlying rollback outcome, without losing a partial lock restoration.
  const operationError = error?.code === "authoring-operation-failed" && error?.cause ? error.cause : error;
  const code = text(operationError?.code) || "progression-canvas-operation-failed";
  const status = text(operationError?.status) || "failed";
  const receipt = error?.operationResult?.receipt ?? null;
  const causes = [];
  const seen = new Set();
  for (let cause = error?.cause; cause && !seen.has(cause) && causes.length < 8; cause = cause.cause) {
    seen.add(cause);
    causes.push({ code: text(cause.code), status: text(cause.status), message: text(cause.message), issues: errorIssues(cause), rollback: errorRollback(cause) });
  }
  return deepFreeze({
    version: PROGRESSION_CANVAS_INTENT_VERSION,
    operation: text(prepared?.operation),
    page: text(prepared?.page),
    state: failureState(status, code),
    status,
    code,
    stage: text(operationError?.stage ?? error?.phase),
    message: text(error?.message) || "Progression canvas operation failed.",
    definitionId: text(operationError?.definitionId ?? receipt?.definitionId),
    definitionDocumentId: text(receipt?.definitionDocumentId),
    progressionId: text(receipt?.progressionId),
    nodeId: text(operationError?.nodeId ?? receipt?.nodeId),
    nodeIds: Array.isArray(operationError?.nodeIds) ? clone(operationError.nodeIds) : [],
    edgeIds: Array.isArray(operationError?.edgeIds) ? clone(operationError.edgeIds) : [],
    issues: errorIssues(operationError),
    rollback: errorRollback(operationError),
    receipt: record(receipt) ? clone(receipt) : null,
    steps: Array.isArray(receipt?.steps) ? clone(receipt.steps) : [],
    causes,
    lockSession: Array.isArray(error?.transitions) ? {
      code: text(error.code), phase: text(error.phase), status: text(error.status),
      collections: Array.isArray(error.collections) ? clone(error.collections) : [],
      transitions: clone(error.transitions)
    } : null
  });
}

export function projectProgressionCanvasReceipt(prepared, result) {
  const receipt = record(result?.receipt) ? result.receipt : record(result) ? result : {};
  return deepFreeze({
    version: PROGRESSION_CANVAS_INTENT_VERSION,
    operation: prepared.operation,
    page: prepared.page,
    state: "committed",
    status: text(receipt.status) || "committed",
    definitionId: text(receipt.definitionId),
    definitionDocumentId: text(receipt.definitionDocumentId),
    progressionId: text(receipt.progressionId),
    nodeId: text(receipt.nodeId),
    nodeIds: Array.isArray(receipt.nodeIds) ? clone(receipt.nodeIds) : [],
    edgeIds: Array.isArray(receipt.edgeIds) ? clone(receipt.edgeIds) : [],
    steps: Array.isArray(receipt.steps) ? clone(receipt.steps) : [],
    route: record(receipt.route) ? clone(receipt.route) : null,
    receipt: clone(receipt),
    lockSession: record(result?.lockSession) ? clone(result.lockSession) : null
  });
}

/**
 * Execute only an explicitly prepared operation. A production runtime without
 * mutation authorization is refused before any runtime mutation method runs.
 */
export async function executeProgressionCanvasIntent({ runtime, intent, expectedGraph } = {}) {
  let prepared;
  try {
    prepared = prepareProgressionCanvasIntent(intent);
  } catch (error) {
    return projectProgressionCanvasFailure(null, error);
  }
  let capabilities;
  try {
    capabilities = runtime?.capabilities?.();
  } catch (error) {
    return projectProgressionCanvasFailure(prepared, error);
  }
  if (capabilities?.liveMutationApproved !== true) {
    return projectProgressionCanvasFailure(prepared, {
      code: "live-mutation-not-authorized",
      status: "failed",
      stage: "authorization",
      message: "Live Progression authoring mutation requires a distinct approved runtime authorization."
    });
  }
  const mutate = runtime?.[prepared.method];
  if (typeof mutate !== "function") {
    return projectProgressionCanvasFailure(prepared, {
      code: "runtime-method-unavailable",
      status: "failed",
      stage: "dispatch",
      message: `Progression runtime method '${prepared.method}' is unavailable.`
    });
  }
  try {
    const request = expectedGraph === undefined ? prepared.request : deepFreeze({ ...prepared.request, expectedGraph: clone(expectedGraph) });
    return projectProgressionCanvasReceipt(prepared, await mutate.call(runtime, request));
  } catch (error) {
    return projectProgressionCanvasFailure(prepared, error);
  }
}
