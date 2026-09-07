import { assertReviewedProgressionGraph } from "./reviewed-graph.mjs";

export const PROGRESSION_GRAPH_EDITING_VERSION = 1;

const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
const text = value => String(value ?? "").trim();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function record(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function progressionIdentity(progression) {
  return text(progression?.uuid ?? progression?.system?.definitionId ?? progression?._source?.system?.definitionId ?? progression?.id ?? progression?._id);
}

function progressionType(progression) {
  return text(progression?.type ?? progression?._source?.type);
}

function requiredMethod(owner, method, label) {
  if (typeof owner?.[method] !== "function") throw new TypeError(`${label} must implement ${method}().`);
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function same(left, right) {
  return stable(left) === stable(right);
}

function issue(code, message, path, details = {}) {
  return deepFreeze({ code, message, path, details: clone(details) });
}

function validateProgression(progression, issues) {
  if (!record(progression)) issues.push(issue("progression-required", "A Progression document is required.", "progression"));
  else if (progressionType(progression) !== "progression") issues.push(issue("progression-type-invalid", "Graph editing requires an Item with type 'progression'.", "progression.type", { type: progressionType(progression) }));
}

function validateGraph(graph, issues) {
  if (!record(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !text(graph.rootNodeId)) {
    issues.push(issue("progression-graph-invalid", "Progression graph editing requires node and edge arrays plus a root node ID.", "progression.system"));
    return;
  }
  const nodeIds = new Set();
  for (const [index, node] of graph.nodes.entries()) {
    const nodeId = text(node?.id);
    if (!nodeId) issues.push(issue("progression-node-id-required", "Every Progression node requires a stable ID.", `progression.nodes.${index}.id`));
    else if (nodeIds.has(nodeId)) issues.push(issue("progression-node-id-duplicate", `Duplicate Progression node ID: ${nodeId}`, `progression.nodes.${index}.id`, { nodeId }));
    else nodeIds.add(nodeId);
  }
  if (text(graph.rootNodeId) && !nodeIds.has(text(graph.rootNodeId))) {
    issues.push(issue("progression-root-missing", "The Progression root node does not resolve.", "progression.rootNodeId", { rootNodeId: text(graph.rootNodeId) }));
  }
}

function validationFailure(message, issues) {
  if (issues.length) throw new ProgressionGraphEditValidationError(message, issues);
}

function normalizePositions(positions, graph, issues) {
  if (!Array.isArray(positions) || !positions.length) {
    issues.push(issue("progression-layout-positions-required", "Layout editing requires at least one node position.", "positions"));
    return [];
  }
  const nodeIds = new Set(graph.nodes.map(node => text(node?.id)).filter(Boolean));
  const seen = new Set();
  const normalized = [];
  for (const [index, entry] of positions.entries()) {
    const path = `positions.${index}`;
    if (!record(entry)) {
      issues.push(issue("progression-layout-position-invalid", "Each layout entry must be an object.", path));
      continue;
    }
    for (const field of Object.keys(entry)) if (!new Set(["nodeId", "position"]).has(field)) {
      issues.push(issue("progression-layout-field-unsupported", `Layout field '${field}' is not supported.`, `${path}.${field}`, { field }));
    }
    const nodeId = text(entry.nodeId);
    if (!nodeId) issues.push(issue("progression-layout-node-id-required", "Each layout entry requires a node ID.", `${path}.nodeId`));
    else if (!nodeIds.has(nodeId)) issues.push(issue("progression-layout-node-missing", `Layout node does not exist: ${nodeId}`, `${path}.nodeId`, { nodeId }));
    else if (seen.has(nodeId)) issues.push(issue("progression-layout-node-duplicate", `Layout node is repeated: ${nodeId}`, `${path}.nodeId`, { nodeId }));
    else seen.add(nodeId);
    if (!record(entry.position)) {
      issues.push(issue("progression-layout-position-invalid", "Each layout entry requires a position object.", `${path}.position`));
      continue;
    }
    for (const field of Object.keys(entry.position)) if (!new Set(["x", "y"]).has(field)) {
      issues.push(issue("progression-layout-coordinate-unsupported", `Layout coordinate '${field}' is not supported.`, `${path}.position.${field}`, { field }));
    }
    const x = entry.position.x;
    const y = entry.position.y;
    if (x === null || text(x) === "" || !Number.isFinite(Number(x)) || y === null || text(y) === "" || !Number.isFinite(Number(y))) {
      issues.push(issue("progression-layout-position-invalid", "Layout coordinates must be finite numbers.", `${path}.position`));
      continue;
    }
    normalized.push({ nodeId, position: { x: Number(x), y: Number(y) } });
  }
  return normalized;
}

function normalizeEdges(edges, graph, issues) {
  if (!Array.isArray(edges)) {
    issues.push(issue("progression-connections-required", "Connection editing requires the complete edge array.", "edges"));
    return [];
  }
  const nodeIds = new Set(graph.nodes.map(node => text(node?.id)).filter(Boolean));
  const edgeIds = new Set();
  const normalized = [];
  for (const [index, edge] of edges.entries()) {
    const path = `edges.${index}`;
    if (!record(edge)) {
      issues.push(issue("progression-edge-invalid", "Each Progression edge must be an object.", path));
      continue;
    }
    const edgeId = text(edge.id);
    const sourceId = text(edge.sourceId);
    const targetId = text(edge.targetId);
    if (!edgeId) issues.push(issue("progression-edge-id-required", "Every Progression edge requires a stable ID.", `${path}.id`));
    else if (edgeIds.has(edgeId)) issues.push(issue("progression-edge-id-duplicate", `Duplicate Progression edge ID: ${edgeId}`, `${path}.id`, { edgeId }));
    else edgeIds.add(edgeId);
    if (!nodeIds.has(sourceId)) issues.push(issue("progression-edge-source-missing", `Connection source does not resolve: ${sourceId}`, `${path}.sourceId`, { sourceId }));
    if (!nodeIds.has(targetId)) issues.push(issue("progression-edge-target-missing", `Connection target does not resolve: ${targetId}`, `${path}.targetId`, { targetId }));
    if (sourceId && sourceId === targetId) issues.push(issue("progression-edge-self-reference", "A Progression edge cannot connect a node to itself.", path, { nodeId: sourceId }));
    normalized.push(clone(edge));
  }
  return normalized;
}

function receipt({ operation, progression, status, nodeIds = [], edgeIds = [], steps = [] }) {
  return deepFreeze({
    version: PROGRESSION_GRAPH_EDITING_VERSION,
    operation,
    status,
    progressionId: progressionIdentity(progression),
    nodeIds: [...nodeIds],
    edgeIds: [...edgeIds],
    steps: [...steps]
  });
}

export class ProgressionGraphEditValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ProgressionGraphEditValidationError";
    this.code = "progression-graph-edit-validation-failed";
    this.status = "failed";
    this.stage = "validation";
    this.issues = deepFreeze(issues.map(entry => clone(entry)));
  }
}

export class ProgressionGraphEditError extends Error {
  constructor(code, message, { cause = null, stage = "", status = "failed", operation = "", progression = null, nodeIds = [], edgeIds = [], rollback = [] } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProgressionGraphEditError";
    this.code = code;
    this.stage = stage;
    this.status = status;
    this.operation = operation;
    this.progressionId = progressionIdentity(progression);
    this.nodeIds = deepFreeze([...nodeIds]);
    this.edgeIds = deepFreeze([...edgeIds]);
    this.rollback = deepFreeze(rollback.map(entry => clone(entry)));
  }
}

/** Dedicated optimistic transaction for graph layout and connection edits. */
export class ProgressionGraphEditingService {
  constructor({ progressionStore, catalogValidator } = {}) {
    requiredMethod(progressionStore, "readGraph", "progressionStore");
    requiredMethod(progressionStore, "replaceGraph", "progressionStore");
    requiredMethod(catalogValidator, "previewMutation", "catalogValidator");
    this.progressionStore = progressionStore;
    this.catalogValidator = catalogValidator;
  }

  async #graph(progression, operation) {
    const issues = [];
    validateProgression(progression, issues);
    validationFailure("Progression graph edit is invalid.", issues);
    try {
      const graph = await this.progressionStore.readGraph(progression);
      validateGraph(graph, issues);
      validationFailure("Stored Progression graph is invalid.", issues);
      return clone(graph);
    } catch (cause) {
      if (cause instanceof ProgressionGraphEditValidationError) throw cause;
      throw new ProgressionGraphEditError("progression-read-failed", `Progression graph could not be read: ${cause?.message ?? cause}`, {
        cause, stage: "progression-read", operation, progression
      });
    }
  }

  async #preview({ operation, progression, beforeGraph, graph, nodeIds = [], edgeIds = [] }) {
    try {
      const catalog = await this.catalogValidator.previewMutation({ progression, graph: clone(graph) });
      return deepFreeze({
        version: PROGRESSION_GRAPH_EDITING_VERSION,
        operation: `preview-${operation}`,
        status: same(beforeGraph, graph) ? "unchanged" : "validated",
        progressionId: progressionIdentity(progression),
        nodeIds: [...nodeIds],
        edgeIds: [...edgeIds],
        beforeGraph: clone(beforeGraph),
        graph: clone(graph),
        catalog
      });
    } catch (cause) {
      throw new ProgressionGraphEditError("progression-candidate-invalid", `Progression graph candidate is invalid: ${cause?.message ?? cause}`, {
        cause, stage: "candidate-validation", operation, progression, nodeIds, edgeIds
      });
    }
  }

  async previewLayout({ progression, positions, expectedGraph } = {}) {
    const operation = "update-layout";
    const beforeGraph = await this.#graph(progression, operation);
    assertReviewedProgressionGraph(expectedGraph, beforeGraph);
    const issues = [];
    const normalized = normalizePositions(positions, beforeGraph, issues);
    validationFailure("Progression layout edit is invalid.", issues);
    const positionsById = new Map(normalized.map(entry => [entry.nodeId, entry.position]));
    const graph = {
      ...clone(beforeGraph),
      nodes: beforeGraph.nodes.map(node => positionsById.has(text(node?.id))
        ? { ...clone(node), position: clone(positionsById.get(text(node.id))) }
        : clone(node))
    };
    return this.#preview({ operation, progression, beforeGraph, graph, nodeIds: normalized.map(entry => entry.nodeId) });
  }

  async previewConnections({ progression, edges, expectedGraph } = {}) {
    const operation = "replace-connections";
    const beforeGraph = await this.#graph(progression, operation);
    assertReviewedProgressionGraph(expectedGraph, beforeGraph);
    const issues = [];
    const normalized = normalizeEdges(edges, beforeGraph, issues);
    validationFailure("Progression connection edit is invalid.", issues);
    const graph = { ...clone(beforeGraph), edges: normalized };
    return this.#preview({ operation, progression, beforeGraph, graph, edgeIds: normalized.map(edge => text(edge.id)) });
  }

  async #recover({ operation, progression, beforeGraph, graph, nodeIds, edgeIds }) {
    let current;
    try {
      current = await this.progressionStore.readGraph(progression);
    } catch (error) {
      return [{ step: "progression-state-read", status: "failed", message: text(error?.message ?? error) }];
    }
    if (same(current, beforeGraph)) return [{ step: "progression-restore", status: "not-required" }];
    if (!same(current, graph)) {
      return [{ step: "progression-restore", status: "failed", message: "The stored graph matches neither the pre-edit nor requested state." }];
    }
    try {
      await this.progressionStore.replaceGraph(progression, clone(beforeGraph), {
        operation: "rollback",
        authoringOperation: operation,
        expectedGraph: clone(graph),
        nodeIds: [...nodeIds],
        edgeIds: [...edgeIds]
      });
      return [{ step: "progression-restore", status: "succeeded" }];
    } catch (error) {
      return [{ step: "progression-restore", status: "failed", message: text(error?.message ?? error) }];
    }
  }

  async #commit(preview, progression) {
    const operation = preview.operation.replace(/^preview-/, "");
    if (preview.status === "unchanged") {
      return {
        progression,
        graph: clone(preview.graph),
        receipt: receipt({ operation, progression, status: "unchanged", nodeIds: preview.nodeIds, edgeIds: preview.edgeIds, steps: ["candidate-validated", "no-change"] })
      };
    }
    try {
      await this.progressionStore.replaceGraph(progression, clone(preview.graph), {
        operation: "commit",
        authoringOperation: operation,
        expectedGraph: clone(preview.beforeGraph),
        nodeIds: [...preview.nodeIds],
        edgeIds: [...preview.edgeIds]
      });
      return {
        progression,
        graph: clone(preview.graph),
        receipt: receipt({ operation, progression, status: "committed", nodeIds: preview.nodeIds, edgeIds: preview.edgeIds, steps: ["candidate-validated", "progression-graph-updated"] })
      };
    } catch (cause) {
      if (cause?.code === "optimistic-conflict") {
        throw new ProgressionGraphEditError("progression-edit-conflict", "Progression graph changed after the edit was previewed.", {
          cause, stage: "progression-update", status: "failed", operation, progression, nodeIds: preview.nodeIds, edgeIds: preview.edgeIds,
          rollback: [{ step: "progression-restore", status: "not-attempted", message: "Optimistic conflict occurred before this transaction could write." }]
        });
      }
      const rollback = await this.#recover({ operation, progression, beforeGraph: preview.beforeGraph, graph: preview.graph, nodeIds: preview.nodeIds, edgeIds: preview.edgeIds });
      const complete = rollback.every(entry => ["succeeded", "not-required"].includes(entry.status));
      throw new ProgressionGraphEditError("progression-edit-failed", `Progression graph edit failed: ${cause?.message ?? cause}`, {
        cause, stage: "progression-update", status: complete ? "rolled-back" : "partial", operation, progression, nodeIds: preview.nodeIds, edgeIds: preview.edgeIds, rollback
      });
    }
  }

  async updateLayout(request = {}) {
    return this.#commit(await this.previewLayout(request), request.progression);
  }

  async replaceConnections(request = {}) {
    return this.#commit(await this.previewConnections(request), request.progression);
  }
}
