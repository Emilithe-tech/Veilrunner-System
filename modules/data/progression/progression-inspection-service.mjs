import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import { assertReviewedProgressionGraph } from "./reviewed-graph.mjs";
import {
  ArchitectureValidationError,
  validationIssue,
  validationResult
} from "../definitions/validation.mjs";
import { DEFINITION_REFERENCE_SCOPES } from "./definition-reference-discovery.mjs";

export { DEFINITION_REFERENCE_SCOPES } from "./definition-reference-discovery.mjs";

export const PROGRESSION_INSPECTION_VERSION = 2;

const STRUCTURAL_NODE_KINDS = new Set(["root", "group"]);
const DEFINITION_NODE_KINDS = new Set(["practice", "content"]);

const clone = value => {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
};
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

function issue(code, message, path, details) {
  return validationIssue(code, message, { path, ...(details === undefined ? {} : { details }) });
}

function throwValidation(message, issues) {
  const result = validationResult(issues);
  if (!result.ok) throw new ProgressionInspectionValidationError(message, result);
}

function requiredMethod(owner, method, label) {
  if (typeof owner?.[method] !== "function") throw new TypeError(`${label} must implement ${method}().`);
}

function progressionType(progression) {
  return text(progression?.type ?? progression?._source?.type);
}

function validateProgression(progression) {
  const issues = [];
  if (!progression || typeof progression !== "object") {
    issues.push(issue("progression-required", "A Progression document is required.", "progression"));
  } else if (progressionType(progression) !== "progression") {
    issues.push(issue("progression-type-invalid", "Graph inspection requires an Item with type 'progression'.", "progression.type", { type: progressionType(progression) }));
  }
  return issues;
}

function normalizedGraph(source, progression) {
  const graph = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    nodes: clone(graph.nodes),
    edges: clone(graph.edges),
    rootNodeId: text(graph.rootNodeId ?? graph.layout?.rootNodeId ?? progression?.system?.layout?.rootNodeId ?? progression?._source?.system?.layout?.rootNodeId)
  };
}

function validateGraph(graph) {
  const issues = [];
  if (!Array.isArray(graph.nodes)) issues.push(issue("progression-nodes-invalid", "Progression nodes must be an array.", "progression.system.nodes"));
  if (!Array.isArray(graph.edges)) issues.push(issue("progression-edges-invalid", "Progression edges must be an array.", "progression.system.edges"));
  if (issues.length) return validationResult(issues);

  const nodes = new Map();
  for (const [index, node] of graph.nodes.entries()) {
    const nodeId = text(node?.id);
    if (!nodeId) {
      issues.push(issue("progression-node-id-required", "Every progression node requires a stable ID.", `progression.system.nodes.${index}.id`));
      continue;
    }
    if (nodes.has(nodeId)) issues.push(issue("progression-node-id-duplicate", `Progression node ID is duplicated: ${nodeId}`, `progression.system.nodes.${index}.id`, { nodeId }));
    else nodes.set(nodeId, node);
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
    const junction = edge?.style?.startJunction;
    const parentId = text(junction?.parentConnectionKey);
    const waypointId = text(junction?.waypointId);
    if (!parentId && !waypointId) continue;
    if (!parentId || !waypointId) {
      issues.push(issue("progression-junction-incomplete", "A routed junction requires both its parent edge and waypoint IDs.", `progression.system.edges.${index}.style.startJunction`));
      continue;
    }
    const parent = edges.get(parentId);
    if (!parent) {
      issues.push(issue("progression-junction-parent-missing", `Routed junction parent edge does not exist: ${parentId}`, `progression.system.edges.${index}.style.startJunction`, { parentId, waypointId }));
      continue;
    }
    if (!(parent?.style?.waypoints ?? []).some(point => text(point?.id) === waypointId)) {
      issues.push(issue("progression-junction-waypoint-missing", `Routed junction waypoint does not exist: ${waypointId}`, `progression.system.edges.${index}.style.startJunction`, { parentId, waypointId }));
    }
  }
  return validationResult(issues);
}

function graphProjection(progression, node, edges) {
  const nodeId = text(node.id);
  return {
    progressionId: progressionIdentity(progression),
    node: clone(node),
    incomingEdges: clone(edges.filter(edge => text(edge?.targetId) === nodeId)),
    outgoingEdges: clone(edges.filter(edge => text(edge?.sourceId) === nodeId))
  };
}

function inspectionResult({ status, graph, definition = null, issues = [] }) {
  const result = validationResult(issues);
  return deepFreeze({
    version: PROGRESSION_INSPECTION_VERSION,
    operation: "inspect-node",
    ok: result.ok,
    status,
    graph,
    definition: definition ? clone(definition) : null,
    issues: result.issues
  });
}

function removalPreview({ progression, beforeGraph, graph, node, removedEdges, catalog }) {
  const definitionId = text(node?.definitionId);
  return deepFreeze({
    version: PROGRESSION_INSPECTION_VERSION,
    operation: "preview-remove-node",
    status: "validated",
    progressionId: progressionIdentity(progression),
    nodeId: text(node?.id),
    definitionId,
    node: clone(node),
    removedEdges: clone(removedEdges),
    removedEdgeIds: removedEdges.map(edge => text(edge?.id)),
    definitionPreserved: true,
    beforeGraph: clone(beforeGraph),
    graph: clone(graph),
    catalog
  });
}

function deletionAssessment({ status, definitionId, definition = null, discovery = null, issues = [], allowed = false }) {
  const result = validationResult(issues);
  return deepFreeze({
    version: PROGRESSION_INSPECTION_VERSION,
    operation: "assess-definition-deletion",
    allowed: Boolean(allowed) && result.ok,
    status,
    definitionId,
    definition: definition ? clone(definition) : null,
    discovery: discovery ? clone(discovery) : null,
    issues: result.issues
  });
}

function normalizeDiscovery(report, requiredScopes) {
  const source = report && typeof report === "object" && !Array.isArray(report) ? report : {};
  const scannedScopesValid = Array.isArray(source.scannedScopes);
  const referencesValid = Array.isArray(source.references);
  const unresolvedValid = source.unresolved === undefined || Array.isArray(source.unresolved);
  const failuresValid = source.failures === undefined || Array.isArray(source.failures);
  const scannedScopes = scannedScopesValid
    ? [...new Set(source.scannedScopes.map(text).filter(Boolean))].sort()
    : [];
  const missingScopes = requiredScopes.filter(scope => !scannedScopes.includes(scope));
  return deepFreeze({
    complete: source.complete === true && scannedScopesValid && referencesValid && unresolvedValid && failuresValid && !missingScopes.length,
    declaredComplete: source.complete === true,
    requiredScopes: [...requiredScopes],
    scannedScopes,
    missingScopes,
    references: referencesValid ? clone(source.references) : [],
    unresolved: unresolvedValid ? clone(source.unresolved ?? []) : [],
    failures: failuresValid ? clone(source.failures ?? []) : []
  });
}

export class ProgressionInspectionValidationError extends ArchitectureValidationError {
  constructor(message, result) {
    super(message, result);
    this.name = "ProgressionInspectionValidationError";
    this.code = "progression-inspection-validation-failed";
    this.status = "failed";
  }
}

export class ProgressionMutationError extends Error {
  constructor(code, message, { cause, status = "failed", progression = null, nodeId = "", definitionId = "", rollback = [] } = {}) {
    super(message, cause === undefined ? {} : { cause });
    this.name = "ProgressionMutationError";
    this.code = code;
    this.status = status;
    this.progressionId = progressionIdentity(progression);
    this.nodeId = nodeId;
    this.definitionId = definitionId;
    this.rollback = deepFreeze(rollback.map(entry => ({ ...entry })));
  }
}

/**
 * Resolves graph nodes through canonical metadata, performs graph-only node
 * removal, and assesses definition deletion without exposing a delete method.
 * The injected graph store must implement idempotent optimistic replacement.
 */
export class ProgressionInspectionService {
  constructor({ idBuilder = canonicalIdBuilder, index, progressionStore, referenceDiscovery, catalogValidator, requiredReferenceScopes = DEFINITION_REFERENCE_SCOPES } = {}) {
    requiredMethod(idBuilder, "validate", "idBuilder");
    requiredMethod(index, "metadata", "index");
    requiredMethod(progressionStore, "readGraph", "progressionStore");
    if (progressionStore?.replaceGraph !== undefined) requiredMethod(progressionStore, "replaceGraph", "progressionStore");
    if (referenceDiscovery?.discover !== undefined) requiredMethod(referenceDiscovery, "discover", "referenceDiscovery");
    if (catalogValidator?.previewMutation !== undefined) requiredMethod(catalogValidator, "previewMutation", "catalogValidator");
    const scopes = [...new Set(Array.from(requiredReferenceScopes ?? [], value => text(value)).filter(Boolean))].sort();
    if (!scopes.length) throw new TypeError("requiredReferenceScopes must contain at least one explicit reference scope.");
    this.idBuilder = idBuilder;
    this.index = index;
    this.progressionStore = progressionStore;
    this.referenceDiscovery = referenceDiscovery ?? null;
    this.catalogValidator = catalogValidator ?? null;
    this.requiredReferenceScopes = Object.freeze(scopes);
  }

  capabilities() {
    return deepFreeze({
      inspectNode: true,
      previewRemoveNode: typeof this.catalogValidator?.previewMutation === "function",
      removeNode: typeof this.progressionStore?.replaceGraph === "function" && typeof this.catalogValidator?.previewMutation === "function",
      assessDefinitionDeletion: typeof this.referenceDiscovery?.discover === "function",
      deleteDefinition: false
    });
  }

  async #graph(progression) {
    throwValidation("Progression request is invalid.", validateProgression(progression));
    let graph;
    try {
      graph = normalizedGraph(await this.progressionStore.readGraph(progression), progression);
    } catch (cause) {
      throw new ProgressionMutationError("progression-read-failed", `Progression graph could not be read: ${asErrorMessage(cause)}`, { cause, progression });
    }
    const result = validateGraph(graph);
    if (!result.ok) throw new ProgressionInspectionValidationError("Progression graph is invalid.", result);
    return graph;
  }

  async #metadata(definitionId) {
    try {
      return { metadata: await this.index.metadata(definitionId), error: null };
    } catch (error) {
      return { metadata: null, error };
    }
  }

  async inspectNode({ progression, nodeId } = {}) {
    const stableNodeId = text(nodeId);
    throwValidation("Progression node request is invalid.", stableNodeId ? [] : [issue("progression-node-id-required", "A stable graph node ID is required.", "nodeId")]);
    const graph = await this.#graph(progression);
    const node = graph.nodes.find(entry => text(entry?.id) === stableNodeId);
    throwValidation("Progression node request is invalid.", node ? [] : [issue("progression-node-not-found", `Progression node does not exist: ${stableNodeId}`, "nodeId", { nodeId: stableNodeId })]);
    const projectedGraph = graphProjection(progression, node, graph.edges);
    const kind = text(node.kind);
    const definitionId = text(node.definitionId);

    if (STRUCTURAL_NODE_KINDS.has(kind)) {
      return definitionId
        ? inspectionResult({ status: "invalid-structural-reference", graph: projectedGraph, issues: [issue("structural-node-definition-forbidden", "Structural graph nodes cannot reference canonical definitions.", "graph.node.definitionId", { definitionId })] })
        : inspectionResult({ status: "structural", graph: projectedGraph });
    }
    if (!DEFINITION_NODE_KINDS.has(kind)) {
      return inspectionResult({ status: "invalid-node-kind", graph: projectedGraph, issues: [issue("progression-node-kind-invalid", `Unknown progression node kind: ${kind || "(blank)"}`, "graph.node.kind", { kind })] });
    }
    const identity = this.idBuilder.validate(definitionId);
    if (!identity.ok) return inspectionResult({ status: "invalid-definition-id", graph: projectedGraph, issues: identity.issues });

    const lookup = await this.#metadata(definitionId);
    if (lookup.error) {
      const duplicate = lookup.error?.code === "duplicate-definition-id";
      return inspectionResult({
        status: duplicate ? "duplicate-definition" : "definition-unresolved",
        graph: projectedGraph,
        issues: [issue(duplicate ? "definition-id-duplicate" : "definition-lookup-failed", duplicate ? `Canonical definition is duplicated: ${definitionId}` : `Canonical definition lookup failed: ${asErrorMessage(lookup.error)}`, "graph.node.definitionId", { definitionId })]
      });
    }
    if (!lookup.metadata) {
      return inspectionResult({ status: "missing-definition", graph: projectedGraph, issues: [issue("definition-not-found", `Canonical definition does not exist: ${definitionId}`, "graph.node.definitionId", { definitionId })] });
    }
    const metadataId = text(lookup.metadata.definitionId);
    const type = text(lookup.metadata.type);
    const typeMatches = kind === "practice" ? type === "practice" : Boolean(type) && !["practice", "progression"].includes(type);
    if (metadataId !== definitionId || !typeMatches) {
      return inspectionResult({
        status: "definition-mismatch",
        graph: projectedGraph,
        definition: lookup.metadata,
        issues: [issue("definition-reference-mismatch", "The canonical definition metadata does not match the graph reference kind and identity.", "graph.node.definitionId", { definitionId, metadataId, nodeKind: kind, definitionType: type })]
      });
    }
    return inspectionResult({ status: "resolved", graph: projectedGraph, definition: lookup.metadata });
  }

  async #restoreGraph({ progression, beforeGraph, nextGraph, nodeId, definitionId }) {
    try {
      await this.progressionStore.replaceGraph(progression, clone(beforeGraph), {
        operation: "rollback",
        expectedGraph: clone(nextGraph),
        nodeId,
        definitionId
      });
      return { step: "progression-restore", status: "succeeded" };
    } catch (error) {
      return { step: "progression-restore", status: "failed", message: asErrorMessage(error) };
    }
  }

  async #previewMutation({ progression, graph, nodeId, definitionId }) {
    if (typeof this.catalogValidator?.previewMutation !== "function") {
      throw new ProgressionMutationError("progression-mutation-unavailable", "Progression removal requires semantic candidate validation.", {
        status: "failed", progression, nodeId, definitionId
      });
    }
    try {
      return await this.catalogValidator.previewMutation({ progression, graph: clone(graph) });
    } catch (cause) {
      throw new ProgressionMutationError("progression-candidate-invalid", `Progression removal candidate is invalid: ${asErrorMessage(cause)}`, {
        cause, status: "failed", progression, nodeId, definitionId
      });
    }
  }

  async #prepareRemoval({ progression, nodeId, expectedGraph } = {}) {
    const stableNodeId = text(nodeId);
    throwValidation("Progression node removal is invalid.", stableNodeId ? [] : [issue("progression-node-id-required", "A stable graph node ID is required.", "nodeId")]);
    if (typeof this.catalogValidator?.previewMutation !== "function") {
      throw new ProgressionMutationError("progression-preview-unavailable", "Progression node removal preview requires semantic candidate validation.", {
        status: "failed", progression, nodeId: stableNodeId
      });
    }
    const beforeGraph = await this.#graph(progression);
    assertReviewedProgressionGraph(expectedGraph, beforeGraph);
    const node = beforeGraph.nodes.find(entry => text(entry?.id) === stableNodeId);
    throwValidation("Progression node removal is invalid.", node ? [] : [issue("progression-node-not-found", `Progression node does not exist: ${stableNodeId}`, "nodeId", { nodeId: stableNodeId })]);
    if (text(node.kind) === "root" || beforeGraph.rootNodeId === stableNodeId) {
      throwValidation("Progression node removal is invalid.", [issue("progression-root-removal-forbidden", "The progression root cannot be removed without an explicit root-replacement transaction.", "nodeId", { nodeId: stableNodeId })]);
    }

    const dependentEdges = beforeGraph.edges.filter(edge => text(edge?.sourceId) === stableNodeId && text(edge?.targetId) !== stableNodeId);
    if (dependentEdges.length) {
      throwValidation("Progression node removal is invalid.", [issue(
        "progression-node-removal-dependent",
        "The node cannot be removed while other graph nodes depend on it.",
        "nodeId",
        { nodeId: stableNodeId, dependentNodeIds: dependentEdges.map(edge => text(edge.targetId)), dependentEdgeIds: dependentEdges.map(edge => text(edge.id)) }
      )]);
    }
    const removedEdges = beforeGraph.edges.filter(edge => text(edge?.sourceId) === stableNodeId || text(edge?.targetId) === stableNodeId);
    const removedEdgeIds = new Set(removedEdges.map(edge => text(edge?.id)));
    const nextEdges = beforeGraph.edges.filter(edge => !removedEdgeIds.has(text(edge?.id)));
    const junctionDependents = nextEdges.filter(edge => removedEdgeIds.has(text(edge?.style?.startJunction?.parentConnectionKey)));
    if (junctionDependents.length) {
      throwValidation("Progression node removal is invalid.", [issue(
        "progression-node-removal-junction-dependent",
        "The node cannot be removed while surviving edges depend on its routed junction geometry.",
        "nodeId",
        { nodeId: stableNodeId, dependentEdgeIds: junctionDependents.map(edge => text(edge.id)) }
      )]);
    }
    const graph = {
      ...clone(beforeGraph),
      nodes: beforeGraph.nodes.filter(entry => text(entry?.id) !== stableNodeId),
      edges: nextEdges
    };
    const definitionId = text(node.definitionId);
    const catalog = await this.#previewMutation({ progression, graph, nodeId: stableNodeId, definitionId });
    return removalPreview({ progression, beforeGraph, graph, node, removedEdges, catalog });
  }

  previewRemoveNode(request = {}) {
    return this.#prepareRemoval(request);
  }

  async removeNode({ progression, nodeId, expectedGraph } = {}) {
    const stableNodeId = text(nodeId);
    if (typeof this.progressionStore?.replaceGraph !== "function" || typeof this.catalogValidator?.previewMutation !== "function") {
      throw new ProgressionMutationError("progression-mutation-unavailable", "Progression node removal is unavailable in this read-only inspector.", {
        status: "failed", progression, nodeId: stableNodeId
      });
    }
    const preview = await this.#prepareRemoval({ progression, nodeId: stableNodeId, expectedGraph });
    const beforeGraph = preview.beforeGraph;
    const nextGraph = preview.graph;
    const node = preview.node;
    const removedEdges = preview.removedEdges;
    const definitionId = preview.definitionId;
    try {
      await this.progressionStore.replaceGraph(progression, clone(nextGraph), {
        operation: "commit",
        expectedGraph: clone(beforeGraph),
        nodeId: stableNodeId,
        definitionId
      });
    } catch (cause) {
      const rollback = [await this.#restoreGraph({ progression, beforeGraph, nextGraph, nodeId: stableNodeId, definitionId })];
      const complete = rollback.every(entry => entry.status === "succeeded");
      throw new ProgressionMutationError("progression-node-removal-failed", `Progression node removal failed: ${asErrorMessage(cause)}`, {
        cause,
        status: complete ? "rolled-back" : "partial",
        progression,
        nodeId: stableNodeId,
        definitionId,
        rollback
      });
    }
    return {
      progression,
      node: clone(node),
      removedEdges: clone(removedEdges),
      receipt: deepFreeze({
        version: PROGRESSION_INSPECTION_VERSION,
        operation: "remove-node",
        status: "committed",
        progressionId: progressionIdentity(progression),
        nodeId: stableNodeId,
        definitionId,
        removedEdgeIds: removedEdges.map(edge => text(edge.id)),
        definitionPreserved: true
      })
    };
  }

  async assessDefinitionDeletion({ definitionId } = {}) {
    const canonicalId = text(definitionId);
    const identity = this.idBuilder.validate(canonicalId);
    if (!identity.ok) return deletionAssessment({ status: "invalid-definition-id", definitionId: canonicalId, issues: identity.issues });
    if (typeof this.referenceDiscovery?.discover !== "function") {
      return deletionAssessment({
        status: "discovery-unavailable",
        definitionId: canonicalId,
        issues: [issue("definition-reference-discovery-unavailable", "Definition deletion cannot be assessed without complete reference discovery.", "definitionId", { definitionId: canonicalId })]
      });
    }

    const lookup = await this.#metadata(canonicalId);
    if (lookup.error) {
      const duplicate = lookup.error?.code === "duplicate-definition-id";
      return deletionAssessment({
        status: duplicate ? "duplicate-definition" : "definition-unresolved",
        definitionId: canonicalId,
        issues: [issue(duplicate ? "definition-id-duplicate" : "definition-lookup-failed", duplicate ? `Canonical definition is duplicated: ${canonicalId}` : `Canonical definition lookup failed: ${asErrorMessage(lookup.error)}`, "definitionId", { definitionId: canonicalId })]
      });
    }
    if (!lookup.metadata) {
      return deletionAssessment({ status: "missing-definition", definitionId: canonicalId, issues: [issue("definition-not-found", `Canonical definition does not exist: ${canonicalId}`, "definitionId", { definitionId: canonicalId })] });
    }
    if (text(lookup.metadata.definitionId) !== canonicalId || !text(lookup.metadata.documentId) || !text(lookup.metadata.packCollection)) {
      return deletionAssessment({
        status: "definition-unresolved",
        definitionId: canonicalId,
        definition: lookup.metadata,
        issues: [issue("definition-metadata-incomplete", "Canonical definition metadata lacks an exact identity, document, or pack handle.", "definitionId", { definitionId: canonicalId })]
      });
    }

    let discovery;
    try {
      discovery = normalizeDiscovery(await this.referenceDiscovery.discover(canonicalId), this.requiredReferenceScopes);
    } catch (error) {
      return deletionAssessment({
        status: "discovery-failed",
        definitionId: canonicalId,
        definition: lookup.metadata,
        issues: [issue("definition-reference-discovery-failed", `Canonical reference discovery failed: ${asErrorMessage(error)}`, "definitionId", { definitionId: canonicalId })]
      });
    }
    if (!discovery.complete) {
      return deletionAssessment({
        status: "incomplete-discovery",
        definitionId: canonicalId,
        definition: lookup.metadata,
        discovery,
        issues: [issue("definition-reference-discovery-incomplete", "Definition deletion requires a complete, explicitly scoped reference inventory.", "discovery", { scannedScopes: discovery.scannedScopes, missingScopes: discovery.missingScopes })]
      });
    }
    if (discovery.unresolved.length || discovery.failures.length) {
      return deletionAssessment({
        status: "unresolved-references",
        definitionId: canonicalId,
        definition: lookup.metadata,
        discovery,
        issues: [issue("definition-references-unresolved", "Definition deletion is blocked because reference discovery contains unresolved sources or failures.", "discovery", { unresolved: discovery.unresolved.length, failures: discovery.failures.length })]
      });
    }
    if (discovery.references.length) {
      return deletionAssessment({
        status: "referenced",
        definitionId: canonicalId,
        definition: lookup.metadata,
        discovery,
        issues: [issue("definition-still-referenced", `Definition deletion is blocked by ${discovery.references.length} active reference(s).`, "discovery.references", { references: discovery.references.length })]
      });
    }
    return deletionAssessment({ status: "unreferenced", definitionId: canonicalId, definition: lookup.metadata, discovery, allowed: true });
  }
}
