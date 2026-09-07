import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import { assertReviewedProgressionGraph } from "./reviewed-graph.mjs";
import {
  ArchitectureValidationError,
  validationIssue,
  validationResult
} from "../definitions/validation.mjs";

export const CONTENT_CREATION_TRANSACTION_VERSION = 2;
export const CONTENT_CREATION_STATUSES = Object.freeze(["committed", "failed", "rolled-back", "partial", "unknown"]);

const FORBIDDEN_DEFINITION_IDENTITY_FIELDS = Object.freeze(["_id", "id", "uuid"]);
const ALLOWED_GRAPH_NODE_FIELDS = new Set([
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
const ALLOWED_GRAPH_EDGE_FIELDS = new Set(["id", "sourceId", "targetId", "kind", "requiredRank", "style"]);
const GRAPH_EDGE_KINDS = new Set(["path", "prerequisite"]);

const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
const text = value => String(value ?? "").trim();
const progressionIdentity = progression => text(
  progression?.uuid ?? progression?.system?.definitionId ?? progression?._source?.system?.definitionId ?? progression?.id ?? progression?._id
);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function asErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function documentIdentity(document) {
  return {
    documentId: text(document?._id ?? document?.id ?? document?._source?._id),
    definitionId: text(document?.system?.definitionId ?? document?._source?.system?.definitionId),
    type: text(document?.type ?? document?._source?.type)
  };
}

function progressionType(progression) {
  return text(progression?.type ?? progression?._source?.type);
}

function issue(code, message, path, details) {
  return validationIssue(code, message, { path, ...(details === undefined ? {} : { details }) });
}

function throwValidation(message, issues) {
  const result = validationResult(issues);
  if (!result.ok) throw new ContentCreationValidationError(message, result);
}

function routeReceipt(route) {
  return deepFreeze({
    routeKey: text(route?.routeKey),
    packName: text(route?.packName),
    collection: text(route?.collection)
  });
}

function operationReceipt({ operation, definitionId, definitionDocumentId = "", metadata = null, route = null, progression, nodeId, edgeIds = [], steps }) {
  return deepFreeze({
    version: CONTENT_CREATION_TRANSACTION_VERSION,
    operation,
    status: "committed",
    definitionId,
    definitionDocumentId,
    definitionPack: text(metadata?.packCollection ?? route?.collection),
    progressionId: progressionIdentity(progression),
    nodeId,
    edgeIds: [...edgeIds],
    route: route ? routeReceipt(route) : null,
    steps: [...steps]
  });
}

export class ContentCreationValidationError extends ArchitectureValidationError {
  constructor(message, result) {
    super(message, result);
    this.name = "ContentCreationValidationError";
    this.code = "content-creation-validation-failed";
    this.stage = "validation";
    this.status = "failed";
  }
}

export class ContentCreationTransactionError extends Error {
  constructor(code, message, {
    stage,
    status = "failed",
    cause,
    definitionId = "",
    route = null,
    progression = null,
    nodeId = "",
    edgeIds = [],
    rollback = []
  } = {}) {
    super(message, cause === undefined ? {} : { cause });
    this.name = "ContentCreationTransactionError";
    this.code = code;
    this.stage = stage;
    this.status = status;
    this.definitionId = definitionId;
    this.route = route ? routeReceipt(route) : null;
    this.progressionId = progressionIdentity(progression);
    this.nodeId = nodeId;
    this.edgeIds = deepFreeze([...edgeIds]);
    this.rollback = deepFreeze(rollback.map(entry => ({ ...entry })));
  }
}

function validateProgression(progression) {
  const issues = [];
  if (!progression || typeof progression !== "object") {
    issues.push(issue("progression-required", "A Progression document is required.", "progression"));
  } else if (progressionType(progression) !== "progression") {
    issues.push(issue("progression-type-invalid", "Graph mutations require an Item with type 'progression'.", "progression.type", { type: progressionType(progression) }));
  }
  return issues;
}

function validateNodeSource(node, { definitionId, expectedKind }) {
  const source = node && typeof node === "object" && !Array.isArray(node) ? node : {};
  const issues = [];
  const nodeId = text(source.id);
  if (!nodeId) issues.push(issue("progression-node-id-required", "A stable graph node ID is required.", "node.id"));
  const hasCoordinate = value => value !== null && text(value) !== "" && Number.isFinite(Number(value));
  if (!hasCoordinate(source.position?.x) || !hasCoordinate(source.position?.y)) {
    issues.push(issue("progression-node-position-invalid", "A graph node requires finite x and y coordinates.", "node.position"));
  }
  const kind = text(source.kind) || expectedKind;
  if (kind !== expectedKind) {
    issues.push(issue("progression-node-kind-invalid", `This definition must be placed as a '${expectedKind}' graph node.`, "node.kind", { expectedKind, kind }));
  }
  const currentDefinitionId = text(source.definitionId);
  if (currentDefinitionId && currentDefinitionId !== definitionId) {
    issues.push(issue("progression-node-definition-mismatch", "The graph node references a different canonical definition.", "node.definitionId", { expected: definitionId, actual: currentDefinitionId }));
  }
  for (const field of Object.keys(source)) if (!ALLOWED_GRAPH_NODE_FIELDS.has(field)) {
    issues.push(issue("progression-node-field-forbidden", `Graph nodes cannot persist non-graph field '${field}'.`, `node.${field}`, { field }));
  }
  return {
    issues,
    node: {
      ...clone(source),
      id: nodeId,
      kind: expectedKind,
      definitionId,
      position: { x: Number(source.position?.x), y: Number(source.position?.y) }
    }
  };
}

function validateDefinitionSource(definitionSource, idRequest, idBuilder) {
  const source = definitionSource && typeof definitionSource === "object" && !Array.isArray(definitionSource) ? clone(definitionSource) : {};
  const issues = [];
  const type = text(source.type);
  const name = text(source.name);
  if (!type) issues.push(issue("definition-type-required", "Canonical content requires an Item type.", "definitionSource.type"));
  else if (type !== type.toLowerCase()) issues.push(issue("definition-type-not-normalized", "Canonical Item types must already be lowercase.", "definitionSource.type", { type }));
  if (!name) issues.push(issue("definition-name-required", "Canonical content requires a name.", "definitionSource.name"));
  if (type === "progression") issues.push(issue("nested-progression-forbidden", "Content creation cannot place a Progression document inside another Progression graph.", "definitionSource.type"));
  for (const field of FORBIDDEN_DEFINITION_IDENTITY_FIELDS) if (source[field] !== undefined) {
    issues.push(issue("definition-document-identity-forbidden", `New canonical content cannot supply '${field}'.`, `definitionSource.${field}`, { field }));
  }
  for (const path of ["x", "y", "position", "layout", "tree"]) if (source[path] !== undefined) {
    issues.push(issue("definition-layout-forbidden", `Canonical content cannot store graph-owned '${path}' data.`, `definitionSource.${path}`, { field: path }));
  }
  for (const path of ["x", "y", "position", "layout", "tree"]) if (source.system?.[path] !== undefined) {
    issues.push(issue("definition-layout-forbidden", `Canonical content cannot store graph-owned '${path}' data.`, `definitionSource.system.${path}`, { field: path }));
  }
  if (issues.length) throwValidation("Canonical content request is invalid.", issues);

  let definitionId;
  try {
    definitionId = idBuilder.build({
      ...clone(idRequest ?? {}),
      type,
      name
    });
  } catch (error) {
    if (error instanceof ArchitectureValidationError) throw new ContentCreationValidationError("Canonical content identity is invalid.", error.result);
    throw error;
  }
  const currentDefinitionId = text(source.system?.definitionId);
  if (currentDefinitionId && currentDefinitionId !== definitionId) {
    throwValidation("Canonical content identity is invalid.", [issue(
      "definition-id-mismatch",
      "The supplied canonical definition ID differs from the generated identity.",
      "definitionSource.system.definitionId",
      { expected: definitionId, actual: currentDefinitionId }
    )]);
  }
  source.name = name;
  source.type = type;
  source.system = { ...(source.system ?? {}), definitionId };
  return { definitionId, source, type };
}

function validateExistingDefinitionId(definitionId, idBuilder) {
  const value = text(definitionId);
  const result = idBuilder.validate(value);
  if (!result.ok) throw new ContentCreationValidationError("Existing content identity is invalid.", result);
  return value;
}

function validateNodeAvailability(nodes, nodeId) {
  if (!Array.isArray(nodes)) {
    throwValidation("Progression graph state is invalid.", [issue("progression-nodes-invalid", "Progression nodes must be an array.", "progression.system.nodes")]);
  }
  if (nodes.some(node => text(node?.id) === nodeId)) {
    throwValidation("Progression node identity collides.", [issue("progression-node-id-duplicate", `Progression node ID already exists: ${nodeId}`, "node.id", { nodeId })]);
  }
}

function validateDefinitionAvailability(nodes, definitionId) {
  const existing = nodes.find(node => text(node?.definitionId) === definitionId);
  if (existing) throwValidation("Canonical definition is already placed.", [issue(
    "progression-definition-already-placed",
    `Canonical definition already has a node in this progression: ${definitionId}`,
    "definitionId",
    { definitionId, nodeId: text(existing.id) }
  )]);
}

function validateGraphSnapshot(graph) {
  const issues = [];
  if (!Array.isArray(graph?.nodes)) issues.push(issue("progression-nodes-invalid", "Progression nodes must be an array.", "progression.system.nodes"));
  if (!Array.isArray(graph?.edges)) issues.push(issue("progression-edges-invalid", "Progression edges must be an array.", "progression.system.edges"));
  if (issues.length) return issues;

  const nodes = new Map();
  for (const [index, node] of graph.nodes.entries()) {
    const nodeId = text(node?.id);
    if (!nodeId) issues.push(issue("progression-node-id-required", "Every progression node requires a stable ID.", `progression.system.nodes.${index}.id`));
    else if (nodes.has(nodeId)) issues.push(issue("progression-node-id-duplicate", `Progression node ID is duplicated: ${nodeId}`, `progression.system.nodes.${index}.id`, { nodeId }));
    else nodes.set(nodeId, node);
  }
  const rootNodeId = text(graph.rootNodeId);
  if (!rootNodeId || !nodes.has(rootNodeId) || text(nodes.get(rootNodeId)?.kind) !== "root") {
    issues.push(issue("progression-root-invalid", "Progression graph root identity must resolve one root node.", "progression.system.layout.rootNodeId", { rootNodeId }));
  }

  const edges = new Map();
  for (const [index, edge] of graph.edges.entries()) {
    const edgeId = text(edge?.id);
    const sourceId = text(edge?.sourceId);
    const targetId = text(edge?.targetId);
    if (!edgeId) issues.push(issue("progression-edge-id-required", "Every progression edge requires a stable ID.", `progression.system.edges.${index}.id`));
    else if (edges.has(edgeId)) issues.push(issue("progression-edge-id-duplicate", `Progression edge ID is duplicated: ${edgeId}`, `progression.system.edges.${index}.id`, { edgeId }));
    else edges.set(edgeId, edge);
    if (!nodes.has(sourceId) || !nodes.has(targetId)) {
      issues.push(issue("progression-edge-node-missing", `Progression edge does not resolve both nodes: ${edgeId || index}`, `progression.system.edges.${index}`, { edgeId, sourceId, targetId }));
    }
  }

  for (const [index, edge] of graph.edges.entries()) {
    const parentId = text(edge?.style?.startJunction?.parentConnectionKey);
    const waypointId = text(edge?.style?.startJunction?.waypointId);
    if (!parentId && !waypointId) continue;
    if (!parentId || !waypointId) {
      issues.push(issue("progression-junction-incomplete", "A routed junction requires both parent edge and waypoint IDs.", `progression.system.edges.${index}.style.startJunction`));
      continue;
    }
    const parent = edges.get(parentId);
    if (!parent) {
      issues.push(issue("progression-junction-parent-missing", `Routed junction parent edge does not exist: ${parentId}`, `progression.system.edges.${index}.style.startJunction`, { parentId, waypointId }));
      continue;
    }
    const parentWaypoints = Array.isArray(parent?.style?.waypoints) ? parent.style.waypoints : [];
    if (!parentWaypoints.some(point => text(point?.id) === waypointId)) {
      issues.push(issue("progression-junction-waypoint-missing", `Routed junction waypoint does not exist: ${waypointId}`, `progression.system.edges.${index}.style.startJunction`, { parentId, waypointId }));
    }
  }
  return issues;
}

function validatePlacementEdges(edgeSources, { node, graph }) {
  const issues = [];
  if (!Array.isArray(edgeSources)) {
    return { issues: [issue("progression-placement-edges-invalid", "Placement edges must be an array.", "edges")], edges: [] };
  }
  if (!edgeSources.length) issues.push(issue(
    "progression-placement-edges-required",
    "A progression placement must include its complete incoming graph connection set.",
    "edges"
  ));

  const existingNodes = new Map(graph.nodes.map(entry => [text(entry?.id), entry]));
  const existingEdgeIds = new Set(graph.edges.map(entry => text(entry?.id)));
  const batchEdgeIds = new Set();
  const preparedEdges = edgeSources.map((raw, index) => {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? clone(raw) : {};
    const path = `edges.${index}`;
    for (const field of Object.keys(source)) if (!ALLOWED_GRAPH_EDGE_FIELDS.has(field)) {
      issues.push(issue("progression-edge-field-forbidden", `Graph edges cannot persist non-graph field '${field}'.`, `${path}.${field}`, { field }));
    }
    const edgeId = text(source.id);
    const sourceId = text(source.sourceId);
    const targetId = text(source.targetId);
    const kind = text(source.kind);
    const requiredRank = source.requiredRank === undefined ? 1 : Number(source.requiredRank);
    if (!edgeId) issues.push(issue("progression-edge-id-required", "Every placement edge requires a stable ID.", `${path}.id`));
    else if (existingEdgeIds.has(edgeId) || batchEdgeIds.has(edgeId)) issues.push(issue("progression-edge-id-duplicate", `Progression edge ID already exists: ${edgeId}`, `${path}.id`, { edgeId }));
    else batchEdgeIds.add(edgeId);
    if (!existingNodes.has(sourceId)) issues.push(issue("progression-edge-source-missing", `Placement edge source does not exist: ${sourceId || "(blank)"}`, `${path}.sourceId`, { sourceId }));
    if (targetId !== node.id) issues.push(issue("progression-edge-target-mismatch", "Every placement edge must target the new graph node.", `${path}.targetId`, { expected: node.id, actual: targetId }));
    if (!GRAPH_EDGE_KINDS.has(kind)) issues.push(issue("progression-edge-kind-invalid", "Placement edge kind must be 'path' or 'prerequisite'.", `${path}.kind`, { kind }));
    if (!Number.isInteger(requiredRank) || requiredRank < 1) issues.push(issue("progression-edge-rank-invalid", "Placement edge required rank must be a positive integer.", `${path}.requiredRank`, { requiredRank: source.requiredRank }));
    if (!source.style || typeof source.style !== "object" || Array.isArray(source.style)) issues.push(issue("progression-edge-style-required", "Placement edges require an explicit graph style.", `${path}.style`));

    const sourceKind = text(existingNodes.get(sourceId)?.kind);
    const expectedSourceKind = kind === "prerequisite" ? node.kind : node.kind === "practice" ? "group" : "practice";
    if (sourceKind && GRAPH_EDGE_KINDS.has(kind) && sourceKind !== expectedSourceKind) {
      issues.push(issue("progression-edge-source-kind-invalid", `A '${kind}' edge for a '${node.kind}' node must start at a '${expectedSourceKind}' node.`, `${path}.sourceId`, { sourceId, sourceKind, expectedSourceKind }));
    }
    return { ...source, id: edgeId, sourceId, targetId, kind, requiredRank };
  });

  const pathCount = preparedEdges.filter(edge => edge.kind === "path").length;
  const prerequisiteCount = preparedEdges.filter(edge => edge.kind === "prerequisite").length;
  if ((pathCount === 1) === (prerequisiteCount > 0) || pathCount > 1) {
    issues.push(issue(
      "progression-node-parentage-invalid",
      "A placed node requires exactly one path edge or one-or-more prerequisite edges, never both.",
      "edges",
      { pathCount, prerequisiteCount }
    ));
  }
  return { issues, edges: preparedEdges };
}

function requiredMethod(owner, method, label) {
  if (typeof owner?.[method] !== "function") throw new TypeError(`${label} must implement ${method}().`);
}

/**
 * Orchestrates canonical definition creation and graph placement through
 * injected stores. This module has no direct Foundry or LevelDB dependency.
 */
export class ContentCreationService {
  constructor({ idBuilder = canonicalIdBuilder, router, index, definitionStore, progressionStore, catalogValidator } = {}) {
    requiredMethod(idBuilder, "build", "idBuilder");
    requiredMethod(idBuilder, "validate", "idBuilder");
    requiredMethod(router, "route", "router");
    requiredMethod(index, "metadata", "index");
    requiredMethod(index, "invalidate", "index");
    requiredMethod(definitionStore, "create", "definitionStore");
    requiredMethod(definitionStore, "delete", "definitionStore");
    requiredMethod(progressionStore, "readGraph", "progressionStore");
    requiredMethod(progressionStore, "replaceGraph", "progressionStore");
    requiredMethod(catalogValidator, "previewMutation", "catalogValidator");
    this.idBuilder = idBuilder;
    this.router = router;
    this.index = index;
    this.definitionStore = definitionStore;
    this.progressionStore = progressionStore;
    this.catalogValidator = catalogValidator;
  }

  async #metadata(definitionId, progression, nodeId) {
    try {
      return await this.index.metadata(definitionId);
    } catch (cause) {
      throw new ContentCreationTransactionError("definition-index-failed", `Canonical definition lookup failed: ${asErrorMessage(cause)}`, {
        stage: "definition-index", status: "failed", cause, definitionId, progression, nodeId
      });
    }
  }

  #route(type, definitionId, progression, nodeId) {
    try {
      const route = this.router.route(type, { strict: true });
      if (!route?.registered || !text(route.collection)) throw new Error(`Canonical route for '${type}' is not registered.`);
      return route;
    } catch (cause) {
      throw new ContentCreationTransactionError("compendium-route-unavailable", `Canonical compendium route is unavailable: ${asErrorMessage(cause)}`, {
        stage: "compendium-route", status: "failed", cause, definitionId, progression, nodeId
      });
    }
  }

  async #graph(progression, context) {
    try {
      const graph = await this.progressionStore.readGraph(progression);
      if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        throw new TypeError("Progression graph must contain node and edge arrays.");
      }
      return clone(graph);
    } catch (cause) {
      throw new ContentCreationTransactionError("progression-read-failed", `Progression graph could not be read: ${asErrorMessage(cause)}`, {
        stage: "progression-read", status: "failed", cause, ...context, progression
      });
    }
  }

  async #previewMutation({ progression, graph, definitionSource = null, definitionId, nodeId, edgeIds }) {
    try {
      return await this.catalogValidator.previewMutation({
        progression,
        graph: clone(graph),
        definitionSource: definitionSource ? clone(definitionSource) : null
      });
    } catch (cause) {
      throw new ContentCreationTransactionError("progression-candidate-invalid", `Canonical progression candidate is invalid: ${asErrorMessage(cause)}`, {
        stage: "candidate-validation", status: "failed", cause, definitionId, progression, nodeId, edgeIds
      });
    }
  }

  async #restoreGraph({ progression, beforeGraph, nextGraph, definitionId, nodeId, edgeIds }) {
    try {
      await this.progressionStore.replaceGraph(progression, clone(beforeGraph), {
        operation: "rollback",
        expectedGraph: clone(nextGraph),
        definitionId,
        nodeId,
        edgeIds: [...edgeIds]
      });
      return { step: "progression-restore", status: "succeeded" };
    } catch (error) {
      return { step: "progression-restore", status: "failed", message: asErrorMessage(error) };
    }
  }

  async #rollbackCreation({ progression, beforeGraph, nextGraph, definitionId, nodeId, edgeIds, route, document, restoreGraph }) {
    const rollback = [];
    if (restoreGraph) rollback.push(await this.#restoreGraph({ progression, beforeGraph, nextGraph, definitionId, nodeId, edgeIds }));
    if (documentIdentity(document).documentId) {
      try {
        await this.definitionStore.delete({ route, document, definitionId });
        rollback.push({ step: "definition-delete", status: "succeeded" });
      } catch (error) {
        rollback.push({ step: "definition-delete", status: "failed", message: asErrorMessage(error) });
      }
    } else {
      rollback.push({ step: "definition-delete", status: "not-attempted", message: "The created document handle has no stable document ID." });
    }
    try {
      await this.index.invalidate(route.collection);
      rollback.push({ step: "definition-index-invalidate", status: "succeeded" });
    } catch (error) {
      rollback.push({ step: "definition-index-invalidate", status: "failed", message: asErrorMessage(error) });
    }
    return rollback;
  }

  async #prepareCreateContent({ definitionSource, idRequest = {}, progression, node, edges = [], expectedGraph } = {}) {
    throwValidation("Canonical content request is invalid.", validateProgression(progression));
    const prepared = validateDefinitionSource(definitionSource, idRequest, this.idBuilder);
    const expectedKind = prepared.type === "practice" ? "practice" : "content";
    const preparedNode = validateNodeSource(node, { definitionId: prepared.definitionId, expectedKind });
    throwValidation("Canonical graph node request is invalid.", preparedNode.issues);

    const existing = await this.#metadata(prepared.definitionId, progression, preparedNode.node.id);
    if (existing) throwValidation("Canonical content identity collides.", [issue(
      "definition-id-collision",
      `Canonical definition ID already exists: ${prepared.definitionId}`,
      "definitionSource.system.definitionId",
      { definitionId: prepared.definitionId, existing }
    )]);
    const route = this.#route(prepared.type, prepared.definitionId, progression, preparedNode.node.id);
    const beforeGraph = await this.#graph(progression, { definitionId: prepared.definitionId, nodeId: preparedNode.node.id });
    assertReviewedProgressionGraph(expectedGraph, beforeGraph);
    throwValidation("Progression graph state is invalid.", validateGraphSnapshot(beforeGraph));
    validateNodeAvailability(beforeGraph.nodes, preparedNode.node.id);
    validateDefinitionAvailability(beforeGraph.nodes, prepared.definitionId);
    const preparedEdges = validatePlacementEdges(edges, { node: preparedNode.node, graph: beforeGraph });
    throwValidation("Canonical graph placement is invalid.", preparedEdges.issues);
    const edgeIds = preparedEdges.edges.map(edge => edge.id);
    const nextGraph = {
      nodes: [...beforeGraph.nodes.map(clone), clone(preparedNode.node)],
      edges: [...beforeGraph.edges.map(clone), ...preparedEdges.edges.map(clone)],
      rootNodeId: text(beforeGraph.rootNodeId)
    };
    throwValidation("Canonical graph placement is invalid.", validateGraphSnapshot(nextGraph));
    const catalog = await this.#previewMutation({
      progression,
      graph: nextGraph,
      definitionSource: prepared.source,
      definitionId: prepared.definitionId,
      nodeId: preparedNode.node.id,
      edgeIds
    });
    return { prepared, preparedNode, preparedEdges, edgeIds, route, beforeGraph, nextGraph, catalog };
  }

  async #preparePlaceExisting({ definitionId, progression, node, edges = [], expectedGraph } = {}) {
    throwValidation("Existing-content placement is invalid.", validateProgression(progression));
    const canonicalId = validateExistingDefinitionId(definitionId, this.idBuilder);
    const metadata = await this.#metadata(canonicalId, progression, text(node?.id));
    if (!metadata) throwValidation("Existing-content placement is invalid.", [issue(
      "definition-not-found",
      `Canonical definition does not exist: ${canonicalId}`,
      "definitionId",
      { definitionId: canonicalId }
    )]);
    const type = text(metadata.type);
    if (!type || type === "progression") throwValidation("Existing-content placement is invalid.", [issue(
      "definition-type-not-placeable",
      `Canonical definition type cannot be placed in a progression graph: ${type || "(blank)"}`,
      "definitionId",
      { definitionId: canonicalId, type }
    )]);
    const expectedKind = type === "practice" ? "practice" : "content";
    const preparedNode = validateNodeSource(node, { definitionId: canonicalId, expectedKind });
    throwValidation("Existing-content graph node is invalid.", preparedNode.issues);
    const beforeGraph = await this.#graph(progression, { definitionId: canonicalId, nodeId: preparedNode.node.id });
    assertReviewedProgressionGraph(expectedGraph, beforeGraph);
    throwValidation("Progression graph state is invalid.", validateGraphSnapshot(beforeGraph));
    validateNodeAvailability(beforeGraph.nodes, preparedNode.node.id);
    validateDefinitionAvailability(beforeGraph.nodes, canonicalId);
    const preparedEdges = validatePlacementEdges(edges, { node: preparedNode.node, graph: beforeGraph });
    throwValidation("Existing-content graph placement is invalid.", preparedEdges.issues);
    const edgeIds = preparedEdges.edges.map(edge => edge.id);
    const nextGraph = {
      nodes: [...beforeGraph.nodes.map(clone), clone(preparedNode.node)],
      edges: [...beforeGraph.edges.map(clone), ...preparedEdges.edges.map(clone)],
      rootNodeId: text(beforeGraph.rootNodeId)
    };
    throwValidation("Existing-content graph placement is invalid.", validateGraphSnapshot(nextGraph));
    const catalog = await this.#previewMutation({
      progression,
      graph: nextGraph,
      definitionId: canonicalId,
      nodeId: preparedNode.node.id,
      edgeIds
    });
    return { canonicalId, metadata, preparedNode, preparedEdges, edgeIds, beforeGraph, nextGraph, catalog };
  }

  /** Validate the exact creation candidate used by commit without opening a write transaction. */
  async previewCreateContent(request = {}) {
    const candidate = await this.#prepareCreateContent(request);
    return deepFreeze({
      version: CONTENT_CREATION_TRANSACTION_VERSION,
      operation: "preview-create-content",
      status: "validated",
      definitionId: candidate.prepared.definitionId,
      definitionSource: clone(candidate.prepared.source),
      route: routeReceipt(candidate.route),
      progressionId: progressionIdentity(request.progression),
      node: clone(candidate.preparedNode.node),
      edges: candidate.preparedEdges.edges.map(clone),
      graph: clone(candidate.nextGraph),
      beforeGraph: clone(candidate.beforeGraph),
      catalog: candidate.catalog
    });
  }

  /** Validate the exact link-only placement candidate used by commit without writing. */
  async previewPlaceExisting(request = {}) {
    const candidate = await this.#preparePlaceExisting(request);
    return deepFreeze({
      version: CONTENT_CREATION_TRANSACTION_VERSION,
      operation: "preview-place-existing",
      status: "validated",
      definitionId: candidate.canonicalId,
      definitionDocumentId: text(candidate.metadata.documentId),
      definitionPack: text(candidate.metadata.packCollection),
      progressionId: progressionIdentity(request.progression),
      node: clone(candidate.preparedNode.node),
      edges: candidate.preparedEdges.edges.map(clone),
      graph: clone(candidate.nextGraph),
      beforeGraph: clone(candidate.beforeGraph),
      catalog: candidate.catalog
    });
  }

  /** Create one canonical definition and atomically append its node and incoming edges. */
  async createContent(request = {}) {
    const { progression } = request;
    const { prepared, preparedNode, preparedEdges, edgeIds, route, beforeGraph, nextGraph } = await this.#prepareCreateContent(request);

    let document;
    try {
      document = await this.definitionStore.create({ route, source: clone(prepared.source), definitionId: prepared.definitionId });
    } catch (cause) {
      let rollback = [];
      try {
        await this.index.invalidate(route.collection);
        rollback = [{ step: "definition-index-invalidate", status: "succeeded" }];
      } catch (error) {
        rollback = [{ step: "definition-index-invalidate", status: "failed", message: asErrorMessage(error) }];
      }
      throw new ContentCreationTransactionError("definition-create-failed", `Canonical definition creation failed: ${asErrorMessage(cause)}`, {
        stage: "definition-create", status: "unknown", cause, definitionId: prepared.definitionId, route, progression, nodeId: preparedNode.node.id, edgeIds, rollback
      });
    }

    let stage = "definition-verify";
    try {
      const identity = documentIdentity(document);
      if (!document || !identity.documentId || identity.definitionId !== prepared.definitionId || identity.type !== prepared.type) {
        throw new Error("The definition store did not return the exact created canonical document.");
      }
      stage = "progression-update";
      await this.progressionStore.replaceGraph(progression, clone(nextGraph), {
        operation: "commit",
        expectedGraph: clone(beforeGraph),
        definitionId: prepared.definitionId,
        nodeId: preparedNode.node.id,
        edgeIds: [...edgeIds]
      });
      stage = "definition-index-invalidate";
      await this.index.invalidate(route.collection);
      return {
        document,
        progression,
        node: clone(preparedNode.node),
        edges: preparedEdges.edges.map(clone),
        receipt: operationReceipt({
          operation: "create-content",
          definitionId: prepared.definitionId,
          definitionDocumentId: identity.documentId,
          route,
          progression,
          nodeId: preparedNode.node.id,
          edgeIds,
          steps: ["identity-built", "collision-cleared", "route-resolved", "candidate-validated", "definition-created", "progression-graph-updated", "index-invalidated"]
        })
      };
    } catch (cause) {
      const restoreGraph = stage !== "definition-verify";
      const rollback = await this.#rollbackCreation({
        progression,
        beforeGraph,
        nextGraph,
        definitionId: prepared.definitionId,
        nodeId: preparedNode.node.id,
        edgeIds,
        route,
        document,
        restoreGraph
      });
      const complete = rollback.every(entry => entry.status === "succeeded");
      const status = stage === "definition-verify" && !documentIdentity(document).documentId
        ? "unknown"
        : complete ? "rolled-back" : "partial";
      const code = stage === "definition-verify" ? "definition-create-verification-failed"
        : stage === "progression-update" ? "progression-update-failed"
          : "definition-index-invalidation-failed";
      throw new ContentCreationTransactionError(code, `Canonical content transaction failed during ${stage}: ${asErrorMessage(cause)}`, {
        stage, status, cause, definitionId: prepared.definitionId, route, progression, nodeId: preparedNode.node.id, edgeIds, rollback
      });
    }
  }

  /** Atomically append a node and incoming edges for an existing definition; never edits or deletes it. */
  async placeExisting(request = {}) {
    const { progression } = request;
    const { canonicalId, metadata, preparedNode, preparedEdges, edgeIds, beforeGraph, nextGraph } = await this.#preparePlaceExisting(request);
    try {
      await this.progressionStore.replaceGraph(progression, clone(nextGraph), {
        operation: "commit",
        expectedGraph: clone(beforeGraph),
        definitionId: canonicalId,
        nodeId: preparedNode.node.id,
        edgeIds: [...edgeIds]
      });
    } catch (cause) {
      const rollback = [await this.#restoreGraph({ progression, beforeGraph, nextGraph, definitionId: canonicalId, nodeId: preparedNode.node.id, edgeIds })];
      const complete = rollback.every(entry => entry.status === "succeeded");
      throw new ContentCreationTransactionError("progression-placement-failed", `Existing-content placement failed: ${asErrorMessage(cause)}`, {
        stage: "progression-update", status: complete ? "rolled-back" : "partial", cause, definitionId: canonicalId, progression, nodeId: preparedNode.node.id, edgeIds, rollback
      });
    }
    return {
      progression,
      node: clone(preparedNode.node),
      edges: preparedEdges.edges.map(clone),
      receipt: operationReceipt({
        operation: "place-existing",
        definitionId: canonicalId,
        definitionDocumentId: text(metadata.documentId),
        metadata,
        progression,
        nodeId: preparedNode.node.id,
        edgeIds,
        steps: ["definition-resolved", "candidate-validated", "progression-graph-updated"]
      })
    };
  }
}
