import { canonicalIdBuilder, normalizeCanonicalSegment } from "../definitions/canonical-id.mjs";
import { prepareProgressionCanvasIntent } from "./canvas-intent-adapter.mjs";

export const PROGRESSION_CANVAS_DRAFT_VERSION = 1;

const PAGE_TYPES = Object.freeze({
  magic: new Set(["practice", "spell"]),
  skills: new Set(["practice", "skill"])
});
const SHAPES = new Set(["circle", "diamond", "hex", "pentagon", "square", "rounded-square", "shield", "flag", "star", "capsule"]);
const SIZE_PRESETS = new Set(["small", "medium", "large", "wide", "custom"]);
const ACTIVATIONS = new Set(["action", "reaction", "ability"]);

const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
const text = value => String(value ?? "").trim();
const token = value => text(value).toLowerCase();
const whole = (value, fallback = 0, minimum = 0) => Number.isInteger(Number(value)) ? Math.max(minimum, Number(value)) : fallback;

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

function fail(issues) {
  if (issues.length) throw new ProgressionCanvasDraftValidationError("Canonical Progression canvas draft is invalid.", issues);
}

function finitePosition(position, issues) {
  const x = position?.x;
  const y = position?.y;
  if (!record(position) || x === null || text(x) === "" || !Number.isFinite(Number(x)) || y === null || text(y) === "" || !Number.isFinite(Number(y))) {
    issues.push(issue("canvas-draft-position-invalid", "A canonical draft requires finite x and y coordinates.", "position"));
    return { x: 0, y: 0 };
  }
  return { x: Number(x), y: Number(y) };
}

function owner(value, path, issues) {
  if (!record(value)) {
    issues.push(issue("canvas-draft-owner-required", "Canonical draft ownership requires an ID and display name.", path));
    return { id: "", name: "" };
  }
  const id = normalizeCanonicalSegment(value.id);
  const name = text(value.name);
  if (!id) issues.push(issue("canvas-draft-owner-id-required", "Canonical draft ownership requires a stable ID.", `${path}.id`));
  if (!name) issues.push(issue("canvas-draft-owner-name-required", "Canonical draft ownership requires a display name.", `${path}.name`));
  return { id, name };
}

function emptyRequirements(requiredLevel = 1) {
  const level = whole(requiredLevel, 1, 1);
  return {
    all: level > 1 ? [{
      id: "required-level",
      subject: "self",
      kind: "level",
      operator: "gte",
      path: "system.level",
      reference: "",
      value: "",
      threshold: level,
      description: "",
      knowledge: "player"
    }] : [],
    any: [],
    none: [],
    description: ""
  };
}

function purchase(resource, base) {
  return { resource, customResource: "", base: whole(base, resource === "talentPoints" ? 1 : 0, 0), perRank: 0 };
}

function presentation({ name, description = "", img = "", color = "", shape = "", size = {} }, kind, issues) {
  const fallbackShape = kind === "practice" ? "diamond" : "diamond";
  const stableShape = token(shape) || fallbackShape;
  if (!SHAPES.has(stableShape)) issues.push(issue("canvas-draft-shape-invalid", `Unsupported node shape: ${stableShape}`, "presentation.shape", { shape: stableShape }));
  const preset = token(size?.preset) || "medium";
  if (!SIZE_PRESETS.has(preset)) issues.push(issue("canvas-draft-size-invalid", `Unsupported node size preset: ${preset}`, "presentation.size.preset", { preset }));
  const width = preset === "custom" ? whole(size?.width, 0, 1) : null;
  const height = preset === "custom" ? whole(size?.height, 0, 1) : null;
  if (preset === "custom" && (!width || !height)) issues.push(issue("canvas-draft-custom-size-invalid", "Custom node size requires positive width and height.", "presentation.size"));
  return {
    label: name,
    description: text(description),
    img: text(img) || null,
    color: text(color),
    shape: stableShape,
    size: { preset, width, height },
    hidden: false
  };
}

function connectionStyle(source = {}) {
  return {
    route: token(source.route) || "linear",
    bend: Number.isFinite(Number(source.bend)) ? Number(source.bend) : 0,
    cornerRadius: whole(source.cornerRadius, 36, 4),
    flip: source.flip === true,
    thickness: Number.isFinite(Number(source.thickness)) ? Math.max(1, Number(source.thickness)) : 2,
    sourceAnchor: token(source.sourceAnchor) || "auto",
    targetAnchor: token(source.targetAnchor) || "auto",
    pattern: token(source.pattern) || "solid",
    glow: Number.isFinite(Number(source.glow)) ? Math.max(0, Number(source.glow)) : 1,
    color: text(source.color),
    hidden: source.hidden === true,
    waypoints: Array.isArray(source.waypoints) ? clone(source.waypoints) : [],
    startJunction: {
      parentConnectionKey: text(source.startJunction?.parentConnectionKey),
      waypointId: text(source.startJunction?.waypointId)
    }
  };
}

function incomingEdges({ nodeId, parentNodeId, prerequisites }, issues) {
  const entries = Array.isArray(prerequisites) ? prerequisites : [];
  if (prerequisites !== undefined && !Array.isArray(prerequisites)) issues.push(issue("canvas-draft-prerequisites-invalid", "Prerequisite drafts must be an array.", "prerequisites"));
  const sources = entries.length ? entries : [{ sourceNodeId: parentNodeId, requiredRank: 1, style: {} }];
  const seen = new Set();
  return sources.map((entry, index) => {
    const sourceId = text(entry?.sourceNodeId);
    if (!sourceId) issues.push(issue("canvas-draft-edge-source-required", "Every incoming connection requires a source node ID.", `prerequisites.${index}.sourceNodeId`));
    if (sourceId && seen.has(sourceId)) issues.push(issue("canvas-draft-edge-source-duplicate", `Incoming connection source is repeated: ${sourceId}`, `prerequisites.${index}.sourceNodeId`, { sourceId }));
    seen.add(sourceId);
    return {
      id: `${sourceId}->${nodeId}`,
      sourceId,
      targetId: nodeId,
      kind: entries.length ? "prerequisite" : "path",
      requiredRank: whole(entry?.requiredRank, 1, 1),
      style: connectionStyle(entry?.style)
    };
  });
}

function definitionBase({ definitionId, page, type, name, school, practice, definition }) {
  return {
    definitionId,
    classification: {
      category: page,
      practice: practice.id,
      school: school.id,
      pillar: text(definition?.pillar),
      kind: type
    },
    traits: [...new Set(Array.from(definition?.traits ?? [], token).filter(Boolean))],
    summary: text(definition?.summary),
    description: text(definition?.description),
    mechanics: text(definition?.mechanics),
    requirements: { all: [], any: [], none: [], description: "" },
    rules: Array.isArray(definition?.rules) ? clone(definition.rules) : []
  };
}

function actionDefinitionSystem({ definitionId, page, type, name, school, practice, definition, rankLimit, rankCost }) {
  const activation = ACTIVATIONS.has(token(definition?.activation)) ? token(definition.activation) : "action";
  const actions = activation === "ability" ? 0 : whole(definition?.actions, 1, 1);
  const base = definitionBase({ definitionId, page, type, name, school, practice, definition });
  return {
    ...base,
    actionMode: type === "spell" ? "spell" : activation,
    activationKind: activation === "ability" ? "ability" : "action",
    actionType: activation === "reaction" ? "reaction" : activation === "ability" ? "free" : "standard",
    category: page === "magic" ? "magic" : "actions",
    favorite: false,
    actions,
    damageType: text(definition?.damageType),
    currentLevel: 1,
    maxLevel: rankLimit,
    damageDice: whole(definition?.damageDice, 0, 0),
    damageDie: whole(definition?.damageDie, 6, 2),
    damageLevelInterval: whole(definition?.damageLevelInterval, 3, 1),
    damageFormula: text(definition?.damageFormula),
    cost: "",
    rollFormula: text(definition?.rollFormula),
    selector: text(definition?.selector) || "action",
    requiredItemTypes: [],
    requiredItemTraits: [],
    requiredDefinitionIds: [],
    requiredItemIntents: [],
    requiresTarget: definition?.requiresTarget === true,
    requiredEffects: [],
    requiredTargetEffects: [],
    composer: [],
    governingAttribute: text(definition?.governingAttribute),
    timing: { type: activation === "ability" ? "free" : activation, trigger: text(definition?.trigger) },
    economy: { actions, reactions: activation === "reaction" ? 1 : 0 },
    targeting: { type: text(definition?.targetType) || "self", required: definition?.requiresTarget === true, count: whole(definition?.targetCount, 1, 1), range: Math.max(0, Number(definition?.range) || 0) },
    resourceCosts: {
      mana: whole(definition?.resourceCosts?.mana, 0, 0),
      stamina: whole(definition?.resourceCosts?.stamina, 0, 0),
      health: whole(definition?.resourceCosts?.health, 0, 0)
    },
    progression: { maxLevel: rankLimit, purchase: purchase("skillPoints", rankCost), scaling: [] },
    consumes: [],
    enhancements: [],
    augments: [],
    rankScaling: { enabled: false, min: 1, max: rankLimit, manaPerRank: 0, staminaPerRank: 0, actionPerRank: 0 },
    effects: Array.isArray(definition?.effects) ? clone(definition.effects) : [],
    ...(type === "spell" ? { baseSpellDamage: text(definition?.baseSpellDamage), spellDamagePerLevel: text(definition?.spellDamagePerLevel) } : {})
  };
}

function graphNode({ nodeId, definitionId, type, position, requiredLevel, talentCost, rankCost, rankLimit, presentation: nodePresentation }) {
  return {
    id: nodeId,
    kind: type === "practice" ? "practice" : "content",
    definitionId,
    position,
    tier: type === "practice" ? 2 : 3,
    rankLimit: type === "practice" ? null : rankLimit,
    purchase: purchase("talentPoints", talentCost),
    rankPurchase: purchase("skillPoints", type === "practice" ? 0 : rankCost),
    requirements: emptyRequirements(requiredLevel),
    presentation: nodePresentation
  };
}

export class ProgressionCanvasDraftValidationError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = "ProgressionCanvasDraftValidationError";
    this.code = "progression-canvas-draft-validation-failed";
    this.status = "failed";
    this.stage = "canvas-draft-validation";
    this.issues = deepFreeze(issues.map(entry => clone(entry)));
  }
}

/** Build one new canonical Practice, Spell, or Skill definition plus graph placement intent. */
export function buildProgressionCreationDraft({
  page,
  type,
  name,
  school,
  practice = null,
  practiceId = "",
  nodeId = "",
  position,
  parentNodeId,
  prerequisites = [],
  requiredLevel = 1,
  talentCost = 1,
  rankCost = 0,
  rankLimit = 1,
  presentation: presentationInput = {},
  definition = {}
} = {}) {
  const issues = [];
  const stablePage = token(page);
  const stableType = token(type);
  const stableName = text(name);
  if (!Object.hasOwn(PAGE_TYPES, stablePage)) issues.push(issue("canvas-draft-page-invalid", "Canonical drafts require the magic or skills page.", "page", { page: stablePage }));
  if (!PAGE_TYPES[stablePage]?.has(stableType)) issues.push(issue("canvas-draft-type-page-mismatch", `Item type '${stableType}' cannot be created on the ${stablePage || "unknown"} page.`, "type", { page: stablePage, type: stableType }));
  if (!stableName || !normalizeCanonicalSegment(stableName)) issues.push(issue("canvas-draft-name-required", "A canonical draft requires a name with a stable slug.", "name"));
  const stableSchool = owner(school, "school", issues);
  const stablePractice = stableType === "practice"
    ? { id: normalizeCanonicalSegment(practiceId || stableName), name: stableName }
    : owner(practice, "practice", issues);
  const stablePosition = finitePosition(position, issues);
  const stableParentId = text(parentNodeId);
  if (!stableParentId) issues.push(issue("canvas-draft-parent-required", "A canonical placement draft requires a parent graph node ID.", "parentNodeId"));
  const slug = normalizeCanonicalSegment(nodeId || (stableType === "practice" ? stablePractice.id : stableName));
  const stableNodeId = text(nodeId) || `${stableType}:${slug}`;
  const idRequest = { scope: stableType === "practice" ? stablePage : stablePractice.id };
  const definitionId = stableName && PAGE_TYPES[stablePage]?.has(stableType)
    ? canonicalIdBuilder.build({ ...idRequest, type: stableType, name: stableName })
    : "";
  const stableRankLimit = whole(rankLimit, 1, 1);
  const nodePresentation = presentation({ name: stableName, description: definition?.description, img: definition?.img, ...presentationInput }, stableType, issues);
  const node = graphNode({
    nodeId: stableNodeId,
    definitionId,
    type: stableType,
    position: stablePosition,
    requiredLevel,
    talentCost: whole(talentCost, 1, 1),
    rankCost: whole(rankCost, 0, 0),
    rankLimit: stableRankLimit,
    presentation: nodePresentation
  });
  const edges = incomingEdges({ nodeId: stableNodeId, parentNodeId: stableParentId, prerequisites }, issues);
  const system = stableType === "practice"
    ? definitionBase({ definitionId, page: stablePage, type: stableType, name: stableName, school: stableSchool, practice: stablePractice, definition })
    : actionDefinitionSystem({ definitionId, page: stablePage, type: stableType, name: stableName, school: stableSchool, practice: stablePractice, definition, rankLimit: stableRankLimit, rankCost: whole(rankCost, 0, 0) });
  fail(issues);
  const definitionSource = {
    name: stableName,
    type: stableType,
    img: text(definition?.img) || (stableType === "practice" ? "icons/svg/book.svg" : "icons/svg/item-bag.svg"),
    system
  };
  const intent = {
    operation: "create-content",
    page: stablePage,
    payload: { definitionSource, idRequest, node, edges }
  };
  const prepared = prepareProgressionCanvasIntent(intent);
  return deepFreeze({
    version: PROGRESSION_CANVAS_DRAFT_VERSION,
    kind: "creation",
    page: stablePage,
    type: stableType,
    definitionId,
    nodeId: stableNodeId,
    intent,
    prepared
  });
}

/** Build a link-only placement intent from one immutable picker record. */
export function buildProgressionPlacementDraft({
  page,
  definition,
  nodeId = "",
  position,
  parentNodeId,
  prerequisites = [],
  requiredLevel = 1,
  talentCost = 1,
  rankCost = 0,
  rankLimit = 1,
  presentation: presentationInput = {}
} = {}) {
  const issues = [];
  const stablePage = token(page);
  const stableType = token(definition?.type);
  if (!Object.hasOwn(PAGE_TYPES, stablePage)) issues.push(issue("canvas-draft-page-invalid", "Canonical drafts require the magic or skills page.", "page", { page: stablePage }));
  if (!PAGE_TYPES[stablePage]?.has(stableType)) issues.push(issue("canvas-draft-type-page-mismatch", `Picker type '${stableType}' cannot be placed on the ${stablePage || "unknown"} page.`, "definition.type", { page: stablePage, type: stableType }));
  if (token(definition?.category) !== stablePage) issues.push(issue("canvas-draft-category-mismatch", "Picker classification does not match the selected Progression page.", "definition.category", { expected: stablePage, actual: token(definition?.category) }));
  const definitionId = text(definition?.definitionId);
  const identity = canonicalIdBuilder.validate(definitionId);
  if (!identity.ok) issues.push(issue("canvas-draft-definition-id-invalid", "Picker record requires a valid canonical definition ID.", "definition.definitionId", { definitionId, issues: identity.issues }));
  const stableName = text(definition?.name);
  if (!stableName) issues.push(issue("canvas-draft-name-required", "Picker record requires a display name.", "definition.name"));
  const stablePosition = finitePosition(position, issues);
  const stableParentId = text(parentNodeId);
  if (!stableParentId) issues.push(issue("canvas-draft-parent-required", "A canonical placement draft requires a parent graph node ID.", "parentNodeId"));
  const slug = normalizeCanonicalSegment(nodeId || stableName || definitionId.split(".").at(-1));
  const stableNodeId = text(nodeId) || `${stableType}:${slug}`;
  const stableRankLimit = whole(rankLimit, 1, 1);
  const nodePresentation = presentation({ name: stableName, img: definition?.img, ...presentationInput }, stableType, issues);
  const node = graphNode({
    nodeId: stableNodeId,
    definitionId,
    type: stableType,
    position: stablePosition,
    requiredLevel,
    talentCost: whole(talentCost, 1, 1),
    rankCost: whole(rankCost, 0, 0),
    rankLimit: stableRankLimit,
    presentation: nodePresentation
  });
  const edges = incomingEdges({ nodeId: stableNodeId, parentNodeId: stableParentId, prerequisites }, issues);
  fail(issues);
  const intent = {
    operation: "place-existing",
    page: stablePage,
    payload: { definitionId, node, edges }
  };
  const prepared = prepareProgressionCanvasIntent(intent);
  return deepFreeze({
    version: PROGRESSION_CANVAS_DRAFT_VERSION,
    kind: "placement",
    page: stablePage,
    type: stableType,
    definitionId,
    nodeId: stableNodeId,
    intent,
    prepared
  });
}

function graphEditDraft(operation, page, payload) {
  const intent = { operation, page: token(page), payload: clone(payload) };
  const prepared = prepareProgressionCanvasIntent(intent);
  return deepFreeze({
    version: PROGRESSION_CANVAS_DRAFT_VERSION,
    kind: "graph-edit",
    page: prepared.page,
    operation,
    intent,
    prepared
  });
}

/** Map a complete visual move gesture snapshot into the strict session boundary. */
export function buildProgressionLayoutDraft({ page, positions } = {}) {
  return graphEditDraft("update-layout", page, { positions });
}

/** Map a complete visual connection snapshot into the strict session boundary. */
export function buildProgressionConnectionDraft({ page, edges } = {}) {
  return graphEditDraft("replace-connections", page, { edges });
}

/** Remove a graph placement only; the canonical definition is never deleted. */
export function buildProgressionRemovalDraft({ page, nodeId } = {}) {
  return graphEditDraft("remove-node", page, { nodeId });
}

/** Derive one connection edit from an exact graph snapshot, retaining all other edges. */
export function buildProgressionConnectionChangeDraft({ page, graph, sourceId = "", targetId = "", removeEdgeId = "", sourceAnchor = "auto", targetAnchor = "auto" } = {}) {
  const issues = [];
  if (!record(graph) || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
    issues.push(issue("canvas-connection-graph-required", "Connection editing requires a complete canonical graph snapshot.", "graph"));
    fail(issues);
  }
  const edges = graph.edges.map(clone);
  const removal = text(removeEdgeId);
  if (removal) {
    const index = edges.findIndex(edge => edge.id === removal);
    if (index < 0) issues.push(issue("canvas-connection-not-found", "The selected connection no longer exists in this snapshot.", "removeEdgeId"));
    else edges.splice(index, 1);
  } else {
    const source = text(sourceId);
    const target = text(targetId);
    for (const [path, id] of [["sourceId", source], ["targetId", target]]) {
      if (!id || !graph.nodes.some(node => node.id === id)) issues.push(issue("canvas-connection-node-not-found", "Choose an existing source and target graph node.", path));
    }
    if (source === target) issues.push(issue("canvas-connection-self-link", "A graph node cannot depend on itself.", "targetId"));
    if (edges.some(edge => edge.sourceId === source && edge.targetId === target)) issues.push(issue("canvas-connection-duplicate", "This source-to-target connection already exists.", "targetId"));
    const anchors = new Set(["auto", "center", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"]);
    for (const [path, anchor] of [["sourceAnchor", sourceAnchor], ["targetAnchor", targetAnchor]]) {
      if (!anchors.has(anchor)) issues.push(issue("canvas-connection-anchor-invalid", "Choose a supported node socket.", path));
    }
    edges.push({ id: `${source}->${target}`, sourceId: source, targetId: target, kind: "prerequisite", requiredRank: 1, style: connectionStyle({ sourceAnchor, targetAnchor }) });
  }
  fail(issues);
  return deepFreeze({ ...buildProgressionConnectionDraft({ page, edges }), sourceGraph: clone(graph) });
}
