import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import {
  ArchitectureValidationError,
  validationIssue,
  validationResult
} from "../definitions/validation.mjs";

export const TALENT_TREE_PROJECTION_VERSION = 1;
export const TALENT_TREE_PROJECTION_PAGES = Object.freeze(["skills", "magic"]);

const PAGE_ROOT_COSTS = Object.freeze({ skills: 0, magic: 5 });
const CONNECTION_ROUTES = new Set(["linear", "curved", "rounded", "square"]);
const CONNECTION_ANCHORS = new Set([
  "auto", "center", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"
]);
const CONNECTION_PATTERNS = new Set(["solid", "dashed", "dotted"]);
const NODE_SHAPES = new Set([
  "circle", "diamond", "hex", "pentagon", "square", "rounded-square", "shield", "flag", "star", "capsule"
]);
const NODE_SIZE_PRESETS = new Set(["small", "medium", "large", "wide", "custom"]);

const emptyRequirements = () => ({ all: [], any: [], none: [], description: "" });
const purchase = (resource, base = 0, perRank = 0) => ({ resource, customResource: "", base, perRank });
const finite = value => Number.isFinite(Number(value));
const integer = (value, fallback = 0, minimum = 0) => {
  const candidate = Number(value);
  return Number.isInteger(candidate) ? Math.max(minimum, candidate) : fallback;
};
const text = value => String(value ?? "").trim();
const clamp = (value, minimum, maximum, fallback) => {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? Math.max(minimum, Math.min(maximum, candidate)) : fallback;
};

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requirement(value) {
  if (value && typeof value === "object") return {
    id: text(value.id),
    level: integer(value.level, 1, 1),
    line: value.line && typeof value.line === "object" ? value.line : {}
  };
  const [id, level] = String(value ?? "").split(":").map(entry => entry.trim());
  return { id, level: integer(level, 1, 1), line: {} };
}

function position(node) {
  return { x: Number(node.x), y: Number(node.y) };
}

function nodeSize(source = {}) {
  const preset = NODE_SIZE_PRESETS.has(source?.preset) ? source.preset : "medium";
  return {
    preset,
    width: preset === "custom" && finite(source.width) ? Math.max(1, Math.round(Number(source.width))) : null,
    height: preset === "custom" && finite(source.height) ? Math.max(1, Math.round(Number(source.height))) : null
  };
}

function presentation(node, { description = "", fallbackColor = "", fallbackShape = "diamond" } = {}) {
  return {
    label: text(node.name),
    description: String(description ?? ""),
    img: text(node.img) || null,
    color: text(node.color) || text(fallbackColor),
    shape: NODE_SHAPES.has(node.shape) ? node.shape : fallbackShape,
    size: nodeSize(node.size),
    hidden: node.hidden === true
  };
}

function levelRequirements(node, nodeId) {
  const requiredLevel = integer(node.requiredLevel, 1, 1);
  if (requiredLevel <= 1) return emptyRequirements();
  return {
    all: [{
      id: `${nodeId}:actor-level`,
      subject: "self",
      kind: "level",
      operator: "gte",
      path: "system.level",
      reference: "",
      value: "",
      threshold: requiredLevel,
      description: `Requires character level ${requiredLevel}.`,
      knowledge: "player"
    }],
    any: [],
    none: [],
    description: ""
  };
}

function connectionStyle(source = {}) {
  const bend = clamp(source.bend, -100, 100, 0);
  const route = CONNECTION_ROUTES.has(source.route) ? source.route : bend ? "curved" : "linear";
  const waypoints = Array.isArray(source.waypoints) ? source.waypoints
    .filter(point => finite(point?.x) && finite(point?.y))
    .map(point => ({
      id: text(point.id),
      x: Number(point.x),
      y: Number(point.y),
      lockX: point.lockX === true,
      lockY: point.lockY === true
    })) : [];
  const parentConnectionKey = text(source.startJunction?.parentConnectionKey);
  const waypointId = text(source.startJunction?.waypointId);
  return {
    route,
    bend,
    cornerRadius: Math.round(clamp(source.cornerRadius, 4, 160, 36)),
    flip: source.flip === true,
    thickness: clamp(source.thickness, 1, 10, 2),
    sourceAnchor: CONNECTION_ANCHORS.has(source.sourceAnchor) ? source.sourceAnchor : "auto",
    targetAnchor: CONNECTION_ANCHORS.has(source.targetAnchor) ? source.targetAnchor : "auto",
    pattern: CONNECTION_PATTERNS.has(source.pattern) ? source.pattern : "solid",
    glow: clamp(source.glow, 0, 3, 1),
    color: /^#[0-9a-f]{6}$/i.test(text(source.color)) ? text(source.color) : "",
    hidden: source.hidden === true,
    waypoints,
    startJunction: { parentConnectionKey, waypointId }
  };
}

function commonDefinitionSystem({ definitionId, category, practice = "", school = "", kind, summary = "", description = "" }) {
  return {
    definitionId,
    classification: { category, practice, school, pillar: "", kind },
    traits: [],
    summary: String(summary ?? ""),
    description: String(description ?? ""),
    mechanics: "",
    requirements: emptyRequirements(),
    rules: []
  };
}

function practiceDefinitionId(practice) {
  const current = text(practice.definitionId);
  return current.startsWith("veilrunner.progression.practice.") && canonicalIdBuilder.isValid(current)
    ? current
    : canonicalIdBuilder.build({ type: "practice", name: practice.id });
}

function leafDefinitionId(page, practice, leaf) {
  const type = page === "magic" ? "spell" : "skill";
  const prefix = `veilrunner.ability.${type}.`;
  const current = text(leaf.definitionId);
  return current.startsWith(prefix) && canonicalIdBuilder.isValid(current)
    ? current
    : canonicalIdBuilder.build({ type, scope: practice.name || practice.id, name: leaf.name || leaf.id });
}

function graphNode({ id, kind, definitionId = "", source, tier, unlockCost = 0, rankCost = 0, rankLimit = null, fallbackColor = "", fallbackShape, structuralDescription = "" }) {
  return {
    id,
    kind,
    definitionId,
    position: position(source),
    tier,
    rankLimit,
    purchase: purchase("talentPoints", unlockCost),
    rankPurchase: purchase("skillPoints", rankCost),
    requirements: levelRequirements(source, id),
    presentation: presentation(source, { description: structuralDescription, fallbackColor, fallbackShape })
  };
}

function edge(sourceKind, sourceId, targetKind, targetId, kind, line, requiredRank = 1) {
  return {
    id: `${sourceKind}:${sourceId}->${targetKind}:${targetId}`,
    sourceId: `${sourceKind}:${sourceId}`,
    targetId: `${targetKind}:${targetId}`,
    kind,
    requiredRank: integer(requiredRank, 1, 1),
    style: connectionStyle(line)
  };
}

function validateCatalog(catalog, pages) {
  const issues = [];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    return validationResult([validationIssue("progression-catalog-required", "A talent-tree catalog object is required.", { path: "catalog" })]);
  }
  for (const page of pages) {
    if (!TALENT_TREE_PROJECTION_PAGES.includes(page)) {
      issues.push(validationIssue("progression-page-unknown", `Unknown talent-tree page: ${page}`, { path: "pages", details: { page } }));
      continue;
    }
    const root = catalog.roots?.[page];
    const schools = catalog[page];
    if (!root || typeof root !== "object") issues.push(validationIssue("progression-root-required", `The ${page} progression root is required.`, { path: `roots.${page}` }));
    else {
      if (!text(root.id)) issues.push(validationIssue("progression-node-id-required", `The ${page} root requires an ID.`, { path: `roots.${page}.id` }));
      if (!text(root.name)) issues.push(validationIssue("progression-node-name-required", `The ${page} root requires a name.`, { path: `roots.${page}.name` }));
      if (!finite(root.x) || !finite(root.y)) issues.push(validationIssue("progression-node-position-invalid", `The ${page} root requires finite coordinates.`, { path: `roots.${page}` }));
    }
    if (!Array.isArray(schools)) {
      issues.push(validationIssue("progression-page-invalid", `The ${page} progression page must be an array.`, { path: page }));
      continue;
    }
    const schoolIds = new Set();
    const practiceIds = new Set();
    const leafIds = new Set();
    const practices = [];
    const leaves = [];
    for (const [schoolIndex, school] of schools.entries()) {
      const schoolPath = `${page}.${schoolIndex}`;
      const schoolId = text(school?.id);
      if (!schoolId) issues.push(validationIssue("progression-node-id-required", "Progression groups require an ID.", { path: `${schoolPath}.id` }));
      else if (schoolIds.has(schoolId)) issues.push(validationIssue("progression-node-id-duplicate", `Duplicate group ID: ${schoolId}`, { path: `${schoolPath}.id`, details: { id: schoolId } }));
      schoolIds.add(schoolId);
      if (!text(school?.name)) issues.push(validationIssue("progression-node-name-required", "Progression groups require a name.", { path: `${schoolPath}.name` }));
      if (!finite(school?.x) || !finite(school?.y)) issues.push(validationIssue("progression-node-position-invalid", `Group ${schoolId || schoolIndex} requires finite coordinates.`, { path: schoolPath }));
      if (!Array.isArray(school?.practices)) {
        issues.push(validationIssue("progression-practices-invalid", `Group ${schoolId || schoolIndex} practices must be an array.`, { path: `${schoolPath}.practices` }));
        continue;
      }
      for (const [practiceIndex, practice] of school.practices.entries()) {
        const practicePath = `${schoolPath}.practices.${practiceIndex}`;
        const practiceId = text(practice?.id);
        if (!practiceId) issues.push(validationIssue("progression-node-id-required", "Practices require an ID.", { path: `${practicePath}.id` }));
        else if (practiceIds.has(practiceId)) issues.push(validationIssue("progression-node-id-duplicate", `Duplicate Practice ID: ${practiceId}`, { path: `${practicePath}.id`, details: { id: practiceId } }));
        practiceIds.add(practiceId);
        if (!text(practice?.name)) issues.push(validationIssue("progression-node-name-required", "Practices require a name.", { path: `${practicePath}.name` }));
        if (!finite(practice?.x) || !finite(practice?.y)) issues.push(validationIssue("progression-node-position-invalid", `Practice ${practiceId || practiceIndex} requires finite coordinates.`, { path: practicePath }));
        if (!Array.isArray(practice?.spells)) issues.push(validationIssue("progression-content-invalid", `Practice ${practiceId || practiceIndex} content must be an array.`, { path: `${practicePath}.spells` }));
        practices.push({ practice, path: practicePath });
        for (const [leafIndex, leaf] of (Array.isArray(practice?.spells) ? practice.spells : []).entries()) {
          const leafPath = `${practicePath}.spells.${leafIndex}`;
          const leafId = text(leaf?.id);
          if (!leafId) issues.push(validationIssue("progression-node-id-required", "Progression content nodes require an ID.", { path: `${leafPath}.id` }));
          else if (leafIds.has(leafId)) issues.push(validationIssue("progression-node-id-duplicate", `Duplicate content node ID: ${leafId}`, { path: `${leafPath}.id`, details: { id: leafId } }));
          leafIds.add(leafId);
          if (!text(leaf?.name)) issues.push(validationIssue("progression-node-name-required", "Progression content nodes require a name.", { path: `${leafPath}.name` }));
          if (!finite(leaf?.x) || !finite(leaf?.y)) issues.push(validationIssue("progression-node-position-invalid", `Content node ${leafId || leafIndex} requires finite coordinates.`, { path: leafPath }));
          leaves.push({ leaf, path: leafPath });
        }
      }
    }
    for (const { practice, path } of practices) for (const raw of practice?.requires ?? []) {
      const entry = requirement(raw);
      if (!entry.id || !practiceIds.has(entry.id)) issues.push(validationIssue("progression-prerequisite-missing", `Practice prerequisite does not resolve: ${entry.id || "(blank)"}`, { path: `${path}.requires`, details: { id: entry.id } }));
    }
    for (const { leaf, path } of leaves) for (const raw of leaf?.requires ?? []) {
      const entry = requirement(raw);
      if (!entry.id || !leafIds.has(entry.id)) issues.push(validationIssue("progression-prerequisite-missing", `Content prerequisite does not resolve: ${entry.id || "(blank)"}`, { path: `${path}.requires`, details: { id: entry.id } }));
    }
  }
  return validationResult(issues);
}

function assertJunctions(progressions) {
  const issues = [];
  for (const progression of progressions) {
    const edges = new Map(progression.system.edges.map(entry => [entry.id, entry]));
    for (const entry of progression.system.edges) {
      const reference = entry.style.startJunction;
      if (!reference.parentConnectionKey && !reference.waypointId) continue;
      const parent = edges.get(reference.parentConnectionKey);
      if (!parent) {
        issues.push(validationIssue("progression-junction-parent-missing", `Connection ${entry.id} references a missing parent connection.`, { path: `${progression.system.definitionId}.edges.${entry.id}.style.startJunction`, details: reference }));
        continue;
      }
      if (!parent.style.waypoints.some(point => point.id === reference.waypointId)) {
        issues.push(validationIssue("progression-junction-waypoint-missing", `Connection ${entry.id} references a missing parent waypoint.`, { path: `${progression.system.definitionId}.edges.${entry.id}.style.startJunction`, details: reference }));
      }
    }
  }
  const result = validationResult(issues);
  if (!result.ok) throw new TalentTreeProjectionError("Talent-tree connection junctions are invalid.", result);
}

export class TalentTreeProjectionError extends ArchitectureValidationError {
  constructor(message, result) {
    super(message, result);
    this.name = "TalentTreeProjectionError";
  }
}

/**
 * Project the mixed legacy talent-tree setting into canonical Practice content
 * and Progression graph Item sources without touching Foundry or compendia.
 */
export function projectTalentTreeCatalog(catalog, {
  pages = TALENT_TREE_PROJECTION_PAGES,
  layoutWidth = 3840,
  layoutHeight = 2160,
  rootCosts = PAGE_ROOT_COSTS,
  groupCost = 1
} = {}) {
  const selectedPages = [...new Set(Array.from(pages ?? [], value => text(value)).filter(Boolean))];
  const validation = validateCatalog(catalog, selectedPages);
  if (!validation.ok) throw new TalentTreeProjectionError("Talent-tree catalog cannot be projected.", validation);

  const practiceSources = [];
  const progressionSources = [];
  const definitionOwners = new Map();
  const claimDefinition = (definitionId, owner) => {
    const previous = definitionOwners.get(definitionId);
    if (previous) {
      const result = validationResult([validationIssue("progression-definition-id-duplicate", `Canonical definition ID is claimed by both ${previous} and ${owner}: ${definitionId}`, { path: owner, details: { definitionId, previous } })]);
      throw new TalentTreeProjectionError("Talent-tree canonical identities collide.", result);
    }
    definitionOwners.set(definitionId, owner);
  };

  for (const page of selectedPages) {
    const root = catalog.roots[page];
    const progressionDefinitionId = canonicalIdBuilder.build({ type: "progression", name: page });
    claimDefinition(progressionDefinitionId, `progression:${page}`);
    const nodes = [graphNode({
      id: `root:${root.id}`,
      kind: "root",
      source: root,
      tier: 0,
      unlockCost: integer(rootCosts?.[page], 0, 0),
      fallbackShape: "hex",
      structuralDescription: root.description
    })];
    const edges = [];
    for (const school of catalog[page]) {
      nodes.push(graphNode({
        id: `school:${school.id}`,
        kind: "group",
        source: school,
        tier: 1,
        unlockCost: integer(school.talentCost, integer(groupCost, 1, 0), 0),
        fallbackColor: root.color,
        fallbackShape: "pentagon",
        structuralDescription: school.description
      }));
      edges.push(edge("root", root.id, "school", school.id, "path", school.rootConnection));
      for (const practice of school.practices) {
        const practiceId = practiceDefinitionId(practice);
        claimDefinition(practiceId, `practice:${page}.${school.id}.${practice.id}`);
        practiceSources.push({
          name: practice.name,
          type: "practice",
          img: text(practice.img) || "icons/svg/book.svg",
          system: {
            ...commonDefinitionSystem({
              definitionId: practiceId,
              category: page,
              practice: practice.id,
              school: school.id,
              kind: "practice",
              summary: practice.summary || practice.description,
              description: practice.description
            })
          }
        });
        nodes.push(graphNode({
          id: `practice:${practice.id}`,
          kind: "practice",
          definitionId: practiceId,
          source: practice,
          tier: 2,
          unlockCost: integer(practice.talentCost, 1, 1),
          fallbackColor: school.color,
          fallbackShape: "diamond"
        }));
        const practiceRequirements = (practice.requires ?? []).map(requirement);
        if (practiceRequirements.length) {
          for (const entry of practiceRequirements) edges.push(edge("practice", entry.id, "practice", practice.id, "prerequisite", entry.line, entry.level));
        } else edges.push(edge("school", school.id, "practice", practice.id, "path", practice.schoolConnection));

        for (const leaf of practice.spells) {
          const definitionId = leafDefinitionId(page, practice, leaf);
          claimDefinition(definitionId, `content:${page}.${school.id}.${practice.id}.${leaf.id}`);
          nodes.push(graphNode({
            id: `spell:${leaf.id}`,
            kind: "content",
            definitionId,
            source: leaf,
            tier: 3,
            unlockCost: integer(leaf.talentCost, 1, 1),
            rankCost: integer(leaf.rankCost, 1, 0),
            rankLimit: integer(leaf.maxRank, 1, 1),
            fallbackColor: practice.color || school.color,
            fallbackShape: leaf.type === "ability" ? "hex" : "diamond"
          }));
          const leafRequirements = (leaf.requires ?? []).map(requirement);
          if (leafRequirements.length) {
            for (const entry of leafRequirements) edges.push(edge("spell", entry.id, "spell", leaf.id, "prerequisite", entry.line, entry.level));
          } else edges.push(edge("practice", practice.id, "spell", leaf.id, "path", leaf.practiceConnection));
        }
      }
    }
    const nodeIds = new Set(nodes.map(node => node.id));
    const edgeIds = new Set();
    const duplicateEdge = edges.find(entry => {
      if (edgeIds.has(entry.id)) return true;
      edgeIds.add(entry.id);
      return false;
    });
    if (duplicateEdge) {
      const result = validationResult([validationIssue("progression-edge-id-duplicate", `Duplicate connection ID: ${duplicateEdge.id}`, { path: `${progressionDefinitionId}.edges.${duplicateEdge.id}`, details: duplicateEdge })]);
      throw new TalentTreeProjectionError("Talent-tree graph contains duplicate connections.", result);
    }
    const unresolvedEdge = edges.find(entry => !nodeIds.has(entry.sourceId) || !nodeIds.has(entry.targetId));
    if (unresolvedEdge) {
      const result = validationResult([validationIssue("progression-edge-node-missing", `Connection ${unresolvedEdge.id} does not resolve both graph nodes.`, { path: `${progressionDefinitionId}.edges.${unresolvedEdge.id}`, details: unresolvedEdge })]);
      throw new TalentTreeProjectionError("Talent-tree graph contains an unresolved connection.", result);
    }
    progressionSources.push({
      name: `${root.name} Progression`,
      type: "progression",
      img: text(root.img) || "icons/svg/levels.svg",
      system: {
        ...commonDefinitionSystem({ definitionId: progressionDefinitionId, category: page, kind: "progression", summary: root.summary || root.description, description: root.description }),
        practiceDefinitionId: "",
        layout: {
          version: TALENT_TREE_PROJECTION_VERSION,
          width: Math.max(1, Number(layoutWidth) || 3840),
          height: Math.max(1, Number(layoutHeight) || 2160),
          rootNodeId: `root:${root.id}`
        },
        nodes,
        edges
      }
    });
  }

  assertJunctions(progressionSources);
  return deepFreeze({
    version: TALENT_TREE_PROJECTION_VERSION,
    practiceSources,
    progressionSources,
    summary: {
      pages: selectedPages.length,
      practices: practiceSources.length,
      progressions: progressionSources.length,
      nodes: progressionSources.reduce((total, source) => total + source.system.nodes.length, 0),
      edges: progressionSources.reduce((total, source) => total + source.system.edges.length, 0)
    }
  });
}
