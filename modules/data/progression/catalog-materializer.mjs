import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";

export const CANONICAL_PROGRESSION_EXPECTATIONS = Object.freeze({
  practices: 51,
  progressions: 2,
  definitions: 54,
  nodes: 117,
  edges: 119
});

export const CANONICAL_PROGRESSION_IDS = Object.freeze({
  skills: "veilrunner.progression.skills",
  magic: "veilrunner.progression.magic"
});

const NODE_KINDS = new Set(["root", "group", "practice", "content"]);
const EDGE_KINDS = new Set(["path", "prerequisite"]);
const LEGACY_TOKENS = ["veilrunner.spell.", "Compendium.world.spells."];

const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];
const integer = value => Number.isInteger(Number(value)) ? Number(value) : null;
const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export class ProgressionCatalogMaterializationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProgressionCatalogMaterializationError";
    this.code = code;
    this.details = details;
  }
}

function refuse(code, message, details = {}) {
  throw new ProgressionCatalogMaterializationError(code, message, details);
}

function sourceOf(document) {
  if (!document || typeof document !== "object" || Array.isArray(document)) refuse("document-invalid", "Canonical progression inputs must be decoded Item snapshots.");
  const source = document.toObject?.() ?? document._source ?? document;
  if (!source || typeof source !== "object" || Array.isArray(source)) refuse("document-invalid", "Canonical progression inputs must be decoded Item snapshots.");
  const result = clone(source);
  if (!result.uuid && document.uuid) result.uuid = document.uuid;
  return result;
}

function definitionIdOf(document) {
  return text(document?.system?.definitionId);
}

function uniqueByDefinitionId(documents, label) {
  const result = new Map();
  for (const document of documents.map(sourceOf)) {
    const definitionId = definitionIdOf(document);
    if (!definitionId || !canonicalIdBuilder.isValid(definitionId)) refuse("definition-id-invalid", `${label} contains an invalid canonical definition ID.`, { definitionId, name: document.name });
    if (result.has(definitionId)) refuse("definition-id-duplicate", `${label} duplicates canonical definition ${definitionId}.`, { definitionId });
    result.set(definitionId, document);
  }
  return result;
}

function assertCount(actual, expected, label) {
  if (actual !== expected) refuse("inventory-mismatch", `Canonical progression ${label} drifted: expected ${expected}, found ${actual}.`, { label, expected, actual });
}

function assertNoLegacyTokens(values) {
  const seen = new WeakSet();
  const visit = (value, path) => {
    if (typeof value === "string") {
      const token = LEGACY_TOKENS.find(candidate => value.includes(candidate));
      if (token) refuse("legacy-reference", `Canonical progression data contains retired reference ${token} at ${path || "(root)"}.`, { path, value });
      return;
    }
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) refuse("cyclic-input", "Canonical progression snapshots must not contain cyclic decoded data.", { path });
    seen.add(value);
    for (const [key, child] of Object.entries(value)) visit(child, path ? `${path}.${key}` : key);
    seen.delete(value);
  };
  values.forEach((value, index) => visit(value, String(index)));
}

function nodeIdPart(node, prefix) {
  const id = text(node?.id);
  if (!id.startsWith(`${prefix}:`) || id.length === prefix.length + 1) refuse("node-id-invalid", `Progression ${prefix} node has an invalid ID: ${id || "(blank)"}.`, { id, prefix });
  return id.slice(prefix.length + 1);
}

function positionOf(node) {
  const x = Number(node?.position?.x);
  const y = Number(node?.position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) refuse("node-position-invalid", `Progression node ${text(node?.id) || "(blank)"} has invalid coordinates.`);
  return { x, y };
}

function presentationOf(node) {
  const presentation = node?.presentation;
  if (!presentation || typeof presentation !== "object" || Array.isArray(presentation)) refuse("node-presentation-invalid", `Progression node ${text(node?.id)} has no decoded presentation.`);
  const label = text(presentation.label);
  if (!label) refuse("node-label-missing", `Progression node ${text(node?.id)} has no display label.`);
  return {
    label,
    description: String(presentation.description ?? ""),
    img: text(presentation.img),
    color: text(presentation.color),
    shape: text(presentation.shape) || "diamond",
    size: clone(presentation.size ?? { preset: "medium" }),
    hidden: presentation.hidden === true
  };
}

function purchaseBase(node, field, { minimum = 0, fallback = 0 } = {}) {
  const value = integer(node?.[field]?.base);
  if (value === null || value < minimum) refuse("node-cost-invalid", `Progression node ${text(node?.id)} has an invalid ${field} cost.`, { value: node?.[field]?.base });
  return value ?? fallback;
}

function requiredLevel(node) {
  const requirements = node?.requirements ?? {};
  const all = list(requirements.all);
  if (list(requirements.any).length || list(requirements.none).length || text(requirements.description)) {
    refuse("node-requirement-unsupported", `Progression node ${text(node?.id)} uses an unsupported requirement expression.`);
  }
  if (!all.length) return 1;
  if (all.length !== 1) refuse("node-requirement-unsupported", `Progression node ${text(node?.id)} has more than one graph-owned requirement.`);
  const entry = all[0];
  const threshold = integer(entry?.threshold);
  if (entry?.subject !== "self" || entry?.kind !== "level" || entry?.operator !== "gte" || entry?.path !== "system.level"
    || threshold === null || threshold < 2 || text(entry.reference) || text(entry.value)) {
    refuse("node-requirement-unsupported", `Progression node ${text(node?.id)} has an unsupported character-level requirement.`, { requirement: entry });
  }
  return threshold;
}

function styleOf(edge) {
  if (!edge?.style || typeof edge.style !== "object" || Array.isArray(edge.style)) refuse("edge-style-invalid", `Progression edge ${text(edge?.id)} has no decoded style.`);
  const style = clone(edge.style);
  const waypointIds = new Set();
  for (const waypoint of list(style.waypoints)) {
    if (!Number.isFinite(Number(waypoint?.x)) || !Number.isFinite(Number(waypoint?.y))) refuse("edge-waypoint-invalid", `Progression edge ${text(edge.id)} has an invalid waypoint.`);
    const id = text(waypoint?.id);
    if (id && waypointIds.has(id)) refuse("edge-waypoint-duplicate", `Progression edge ${text(edge.id)} duplicates waypoint ${id}.`);
    if (id) waypointIds.add(id);
  }
  return style;
}

function validateGraph(progression) {
  const definitionId = definitionIdOf(progression);
  const nodes = list(progression.system?.nodes);
  const edges = list(progression.system?.edges);
  const byId = new Map();
  for (const node of nodes) {
    const id = text(node?.id);
    if (!id || !NODE_KINDS.has(node?.kind)) refuse("node-invalid", `Progression ${definitionId} contains an invalid graph node.`, { id, kind: node?.kind });
    if (byId.has(id)) refuse("node-id-duplicate", `Progression ${definitionId} duplicates graph node ${id}.`);
    positionOf(node);
    presentationOf(node);
    const canonicalId = text(node.definitionId);
    if (["practice", "content"].includes(node.kind)) {
      if (!canonicalIdBuilder.isValid(canonicalId)) refuse("node-definition-invalid", `Progression node ${id} has an invalid definition reference.`, { definitionId: canonicalId });
    } else if (canonicalId) refuse("structural-definition-reference", `Structural progression node ${id} must not reference canonical content.`, { definitionId: canonicalId });
    byId.set(id, node);
  }
  const rootId = text(progression.system?.layout?.rootNodeId);
  const roots = nodes.filter(node => node.kind === "root");
  if (roots.length !== 1 || !byId.has(rootId) || byId.get(rootId)?.kind !== "root") refuse("root-invalid", `Progression ${definitionId} must identify exactly one graph root.`, { rootId });

  const edgeById = new Map();
  for (const edge of edges) {
    const id = text(edge?.id);
    const sourceId = text(edge?.sourceId);
    const targetId = text(edge?.targetId);
    if (!id || id !== `${sourceId}->${targetId}` || !EDGE_KINDS.has(edge?.kind) || !byId.has(sourceId) || !byId.has(targetId)) {
      refuse("edge-invalid", `Progression ${definitionId} contains an invalid graph edge.`, { id, sourceId, targetId, kind: edge?.kind });
    }
    if (edgeById.has(id)) refuse("edge-id-duplicate", `Progression ${definitionId} duplicates graph edge ${id}.`);
    const requiredRank = integer(edge.requiredRank);
    if (requiredRank === null || requiredRank < 1) refuse("edge-rank-invalid", `Progression edge ${id} has an invalid required rank.`);
    styleOf(edge);
    edgeById.set(id, edge);
  }
  for (const edge of edges) {
    const junction = edge.style?.startJunction ?? {};
    const parentConnectionKey = text(junction.parentConnectionKey);
    const waypointId = text(junction.waypointId);
    if (!parentConnectionKey && !waypointId) continue;
    const parent = edgeById.get(parentConnectionKey);
    if (!parent || !list(parent.style?.waypoints).some(point => text(point.id) === waypointId)) {
      refuse("edge-junction-invalid", `Progression edge ${edge.id} references an unresolved junction.`, { junction });
    }
  }
  return { nodes, edges, byId, root: roots[0] };
}

function ownershipTokenMatches(value, { id, name }) {
  const candidate = text(value).toLowerCase();
  return Boolean(candidate) && [text(id).toLowerCase(), text(name).toLowerCase()].includes(candidate);
}

function assertClassification(document, { page, school, practice = null, kind }) {
  const classification = document.system?.classification ?? {};
  if (text(classification.category).toLowerCase() !== page || text(classification.kind).toLowerCase() !== kind
    || !ownershipTokenMatches(classification.school, school)
    || (practice && !ownershipTokenMatches(classification.practice, practice))) {
    refuse("definition-classification-mismatch", `Canonical definition ${definitionIdOf(document)} does not match its progression ownership.`, {
      definitionId: definitionIdOf(document), classification, page, school, practice, kind
    });
  }
}

function inboundFor(node, edges) {
  return edges.filter(edge => edge.targetId === node.id);
}

function requirementEdges(node, edges, byId, sourceKind) {
  const incoming = inboundFor(node, edges);
  const paths = incoming.filter(edge => edge.kind === "path");
  const prerequisites = incoming.filter(edge => edge.kind === "prerequisite");
  if ((paths.length === 1) === (prerequisites.length > 0)) refuse("node-parentage-invalid", `Progression node ${node.id} must have one path or one-or-more prerequisites.`);
  if (paths.length > 1 || prerequisites.some(edge => byId.get(edge.sourceId)?.kind !== sourceKind)) {
    refuse("node-parentage-invalid", `Progression node ${node.id} has an invalid parent or prerequisite kind.`);
  }
  return {
    path: paths[0] ?? null,
    requires: prerequisites.map(edge => ({
      id: nodeIdPart(byId.get(edge.sourceId), sourceKind === "content" ? "spell" : "practice"),
      level: Number(edge.requiredRank),
      line: styleOf(edge)
    }))
  };
}

function commonNode(node) {
  const position = positionOf(node);
  const presentation = presentationOf(node);
  return {
    ...position,
    shape: presentation.shape,
    size: presentation.size,
    color: presentation.color,
    hidden: presentation.hidden
  };
}

function activationType(system) {
  if (system?.timing?.type === "reaction" || system?.actionType === "reaction") return "reaction";
  if (system?.activationKind === "ability" || Number(system?.economy?.actions ?? system?.actions) === 0) return "ability";
  return "action";
}

function buildPage(progression, practiceById, definitionById) {
  const page = Object.entries(CANONICAL_PROGRESSION_IDS).find(([, id]) => id === definitionIdOf(progression))?.[0];
  if (!page) refuse("progression-identity-unexpected", `Unexpected Progression identity ${definitionIdOf(progression)}.`);
  if (progression.type !== "progression") refuse("progression-type-mismatch", `${definitionIdOf(progression)} is not a Progression Item.`);
  const classification = progression.system?.classification ?? {};
  if (text(classification.category).toLowerCase() !== page || text(classification.kind).toLowerCase() !== "progression") {
    refuse("progression-classification-mismatch", `${definitionIdOf(progression)} has invalid classification.`, { classification });
  }
  const graph = validateGraph(progression);
  const rootPresentation = presentationOf(graph.root);
  const root = {
    id: nodeIdPart(graph.root, "root"),
    name: rootPresentation.label,
    ...commonNode(graph.root),
    img: rootPresentation.img || text(progression.img),
    description: rootPresentation.description || String(progression.system?.description ?? ""),
    talentCost: purchaseBase(graph.root, "purchase")
  };
  const groups = graph.nodes.filter(node => node.kind === "group");
  const groupById = new Map(groups.map(node => [nodeIdPart(node, "school"), node]));
  const schools = groups.map(groupNode => {
    const id = nodeIdPart(groupNode, "school");
    const presentation = presentationOf(groupNode);
    const incoming = inboundFor(groupNode, graph.edges);
    if (incoming.length !== 1 || incoming[0].kind !== "path" || incoming[0].sourceId !== graph.root.id) refuse("group-parentage-invalid", `Progression group ${groupNode.id} must have one path from the root.`);
    return {
      id,
      name: presentation.label,
      ...commonNode(groupNode),
      img: presentation.img,
      description: presentation.description,
      talentCost: purchaseBase(groupNode, "purchase"),
      rootConnection: styleOf(incoming[0]),
      practices: []
    };
  });
  const schoolById = new Map(schools.map(school => [school.id, school]));

  for (const node of graph.nodes.filter(candidate => candidate.kind === "practice")) {
    const definition = practiceById.get(text(node.definitionId));
    if (!definition || definition.type !== "practice") refuse("practice-definition-missing", `Progression node ${node.id} does not resolve one Practice definition.`, { definitionId: node.definitionId });
    const classification = definition.system?.classification ?? {};
    const schoolNode = groupById.get(text(classification.school));
    const school = schoolById.get(text(classification.school));
    if (!schoolNode || !school) refuse("practice-school-missing", `Practice ${definitionIdOf(definition)} names an unknown progression group.`, { school: classification.school });
    const practiceId = nodeIdPart(node, "practice");
    assertClassification(definition, { page, school, practice: { id: practiceId, name: definition.name }, kind: "practice" });
    const links = requirementEdges(node, graph.edges, graph.byId, "practice");
    const presentation = presentationOf(node);
    const practice = {
      id: practiceId,
      definitionId: definitionIdOf(definition),
      name: text(definition.name),
      ...commonNode(node),
      color: presentation.color || school.color,
      img: text(definition.img) || presentation.img,
      summary: String(definition.system?.summary ?? ""),
      description: String(definition.system?.description ?? ""),
      talentCost: purchaseBase(node, "purchase", { minimum: 1 }),
      requiredLevel: requiredLevel(node),
      requires: links.requires,
      schoolConnection: links.path ? styleOf(links.path) : {},
      spells: []
    };
    school.practices.push(practice);
  }

  const practices = schools.flatMap(school => school.practices.map(practice => ({ school, practice })));
  for (const node of graph.nodes.filter(candidate => candidate.kind === "content")) {
    const definition = definitionById.get(text(node.definitionId));
    if (!definition) refuse("content-definition-missing", `Progression node ${node.id} does not resolve one canonical content definition.`, { definitionId: node.definitionId });
    const classification = definition.system?.classification ?? {};
    const owners = practices.filter(({ school, practice }) =>
      ownershipTokenMatches(classification.school, school) && ownershipTokenMatches(classification.practice, practice));
    if (owners.length !== 1) refuse("content-owner-ambiguous", `Canonical definition ${definitionIdOf(definition)} does not resolve one Practice owner.`, { classification, matches: owners.length });
    const { school, practice } = owners[0];
    const identityType = definitionIdOf(definition).split(".")[2];
    if (!['spell', 'skill'].includes(identityType) || definition.type !== identityType) refuse("content-type-mismatch", `Canonical content ${definitionIdOf(definition)} has an unexpected Item type.`, { expected: identityType, actual: definition.type });
    assertClassification(definition, { page, school, practice, kind: identityType });
    const links = requirementEdges(node, graph.edges, graph.byId, "content");
    const presentation = presentationOf(node);
    const system = definition.system ?? {};
    practice.spells.push({
      id: nodeIdPart(node, "spell"),
      definitionId: definitionIdOf(definition),
      sourceUuid: text(definition.uuid),
      name: text(definition.name),
      order: practice.spells.length,
      ...commonNode(node),
      color: presentation.color || practice.color || school.color,
      img: text(definition.img) || presentation.img,
      description: String(system.description ?? ""),
      mechanics: String(system.mechanics ?? ""),
      type: activationType(system),
      category: text(system.classification?.category) || page,
      actions: Math.max(0, Number(system.economy?.actions ?? system.actions) || 0),
      talentCost: purchaseBase(node, "purchase", { minimum: 1 }),
      rankCost: purchaseBase(node, "rankPurchase"),
      maxRank: integer(node.rankLimit) ?? Math.max(1, integer(system.progression?.maxLevel ?? system.maxLevel) ?? 1),
      requiredLevel: requiredLevel(node),
      requires: links.requires,
      practiceConnection: links.path ? styleOf(links.path) : {},
      traits: clone(list(system.traits)),
      resourceCosts: clone(system.resourceCosts ?? { mana: 0, stamina: 0, health: 0 }),
      effects: clone(list(system.effects))
    });
  }
  return { page, root, schools };
}

/**
 * Reconstruct the established synchronous talent-tree view from decoded,
 * canonical Practice, Progression, and referenced content snapshots.
 */
export function materializeTalentTreeCatalog({ practices = [], progressions = [], definitions = [] } = {}, {
  expected = CANONICAL_PROGRESSION_EXPECTATIONS
} = {}) {
  const practiceSources = Array.from(practices ?? [], sourceOf);
  const progressionSources = Array.from(progressions ?? [], sourceOf);
  const definitionSources = Array.from(definitions ?? [], sourceOf);
  if (expected !== null) {
    assertCount(practiceSources.length, expected.practices, "Practice count");
    assertCount(progressionSources.length, expected.progressions, "Progression count");
    assertCount(definitionSources.length, expected.definitions, "referenced-definition count");
  }
  // Reject retired identifiers anywhere they can affect runtime resolution,
  // while retaining non-executable migration provenance for audit/rollback.
  assertNoLegacyTokens([
    ...practiceSources.map(source => ({
      definitionId: source.system?.definitionId,
      classification: source.system?.classification
    })),
    ...progressionSources.map(source => ({
      definitionId: source.system?.definitionId,
      practiceDefinitionId: source.system?.practiceDefinitionId,
      nodes: source.system?.nodes,
      edges: source.system?.edges
    })),
    ...definitionSources.map(source => ({ definitionId: source.system?.definitionId }))
  ]);

  const practiceById = uniqueByDefinitionId(practiceSources, "Practice inventory");
  const progressionById = uniqueByDefinitionId(progressionSources, "Progression inventory");
  const definitionById = uniqueByDefinitionId(definitionSources, "Referenced-definition inventory");
  for (const id of Object.values(CANONICAL_PROGRESSION_IDS)) if (!progressionById.has(id)) refuse("progression-identity-missing", `Canonical progression is missing ${id}.`);

  const totalNodes = progressionSources.reduce((total, source) => total + list(source.system?.nodes).length, 0);
  const totalEdges = progressionSources.reduce((total, source) => total + list(source.system?.edges).length, 0);
  if (expected !== null) {
    assertCount(totalNodes, expected.nodes, "node count");
    assertCount(totalEdges, expected.edges, "edge count");
  }

  const pages = progressionSources.map(source => buildPage(source, practiceById, definitionById));
  const referencedPracticeRows = progressionSources.flatMap(source => list(source.system?.nodes).filter(node => node.kind === "practice").map(node => text(node.definitionId)));
  const referencedDefinitionRows = progressionSources.flatMap(source => list(source.system?.nodes).filter(node => node.kind === "content").map(node => text(node.definitionId)));
  const referencedPracticeIds = new Set(referencedPracticeRows);
  const referencedDefinitionIds = new Set(referencedDefinitionRows);
  if (referencedPracticeRows.length !== referencedPracticeIds.size) refuse("practice-reference-duplicate", "Canonical progression places a Practice definition more than once.");
  if (expected !== null && (referencedPracticeIds.size !== practiceById.size || [...practiceById.keys()].some(id => !referencedPracticeIds.has(id)))) refuse("practice-inventory-unreferenced", "Sealed canonical progression contains an unreferenced Practice definition.");
  if (referencedDefinitionRows.length !== definitionById.size || referencedDefinitionIds.size !== definitionById.size || [...definitionById.keys()].some(id => !referencedDefinitionIds.has(id))) refuse("content-inventory-unreferenced", "Canonical progression contains an unreferenced or multiply owned content definition.");

  const byPage = new Map(pages.map(entry => [entry.page, entry]));
  const catalog = {
    layoutVersion: 10,
    roots: {
      skills: byPage.get("skills").root,
      magic: byPage.get("magic").root
    },
    skills: byPage.get("skills").schools,
    magic: byPage.get("magic").schools
  };
  return deepFreeze(catalog);
}
