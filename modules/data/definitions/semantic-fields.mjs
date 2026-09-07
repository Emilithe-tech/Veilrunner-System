const {
  ArrayField,
  BooleanField,
  FilePathField,
  HTMLField,
  NumberField,
  SchemaField,
  StringField
} = foundry.data.fields;

const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const whole = (initial = 0, min = 0) => new NumberField({ required: true, integer: true, min, initial, nullable: false });
const optionalWhole = (min = 0) => new NumberField({ required: false, integer: true, min, initial: null, nullable: true });
const textList = () => new ArrayField(new StringField({ required: true, blank: false }), { initial: () => [] });

export const REQUIREMENT_KINDS = Object.freeze([
  "level",
  "attribute",
  "trait",
  "definition",
  "effect",
  "equipped",
  "resource",
  "health",
  "actorType",
  "range",
  "progressionNode",
  "practiceInvestment",
  "license"
]);

export const REQUIREMENT_OPERATORS = Object.freeze([
  "eq", "ne", "gt", "gte", "lt", "lte", "includes"
]);

export const SCALING_KINDS = Object.freeze(["perLevel", "milestone"]);
export const SCALING_MODES = Object.freeze(["add", "multiply", "override", "append", "grant"]);
export const PROGRESSION_NODE_KINDS = Object.freeze(["root", "group", "practice", "content"]);
export const PROGRESSION_NODE_SHAPES = Object.freeze([
  "circle", "diamond", "hex", "pentagon", "square", "rounded-square", "shield", "flag", "star", "capsule"
]);
export const PROGRESSION_NODE_SIZE_PRESETS = Object.freeze(["small", "medium", "large", "wide", "custom"]);
export const PROGRESSION_CONNECTION_ROUTES = Object.freeze(["linear", "curved", "rounded", "square"]);
export const PROGRESSION_CONNECTION_ANCHORS = Object.freeze([
  "auto", "center", "top-left", "top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left"
]);
export const PROGRESSION_CONNECTION_PATTERNS = Object.freeze(["solid", "dashed", "dotted"]);

function choices(values) {
  return Object.fromEntries(values.map(value => [value, value]));
}

export function definitionClassificationField() {
  return new SchemaField({
    category: text(),
    practice: text(),
    school: text(),
    pillar: text(),
    kind: text()
  });
}

export function requirementLeafField() {
  return new SchemaField({
    id: text(),
    subject: new StringField({ required: true, blank: false, initial: "self", choices: choices(["self", "target", "source"]) }),
    kind: new StringField({ required: true, blank: false, initial: "definition", choices: choices(REQUIREMENT_KINDS) }),
    operator: new StringField({ required: true, blank: false, initial: "gte", choices: choices(REQUIREMENT_OPERATORS) }),
    path: text(),
    reference: text(),
    value: text(),
    threshold: optionalWhole(),
    description: text(),
    knowledge: new StringField({ required: true, blank: false, initial: "player", choices: choices(["player", "mechanical"]) }),
    equipment: new SchemaField({ types: textList(), traits: textList(), definitionIds: textList(), capabilities: textList(), timing: text() })
  });
}

/** One bounded all/any/none requirement expression shared by all consumers. */
export function requirementSetFields() {
  return {
    all: new ArrayField(requirementLeafField(), { initial: () => [] }),
    any: new ArrayField(requirementLeafField(), { initial: () => [] }),
    none: new ArrayField(requirementLeafField(), { initial: () => [] }),
    description: text()
  };
}

export function requirementSetField() {
  return new SchemaField(requirementSetFields());
}

export function purchaseCostField({ resource = "talentPoints" } = {}) {
  return new SchemaField({
    resource: new StringField({
      required: true,
      blank: false,
      initial: resource,
      choices: choices(["talentPoints", "skillPoints", "perkPoints", "flawPoints", "credits", "experience", "custom"])
    }),
    customResource: text(),
    base: whole(1),
    perRank: whole()
  });
}

export function scalingEntryField() {
  return new SchemaField({
    id: text(),
    kind: new StringField({ required: true, blank: false, initial: "perLevel", choices: choices(SCALING_KINDS) }),
    level: whole(1, 1),
    interval: whole(1, 1),
    selector: text(),
    mode: new StringField({ required: true, blank: false, initial: "add", choices: choices(SCALING_MODES) }),
    value: text(),
    description: text()
  });
}

export function mechanicalRuleFields() {
  return {
    id: text(),
    key: text(),
    selector: text(),
    mode: text("add"),
    value: text(),
    predicate: textList(),
    definitionId: text(),
    target: text("self"),
    description: text()
  };
}

export function mechanicalRuleField() {
  return new SchemaField(mechanicalRuleFields());
}

/** Definition fields not already supplied by the legacy Action authoring schema. */
export function canonicalDefinitionExtensionFields() {
  return {
    classification: definitionClassificationField(),
    mechanics: new HTMLField({ required: false, blank: true, initial: "" }),
    rules: new ArrayField(mechanicalRuleField(), { initial: () => [] })
  };
}

/** Shared source fields for semantic definition types, including existing Item models. */
export function canonicalDefinitionFields() {
  const { classification, mechanics, rules } = canonicalDefinitionExtensionFields();
  return {
    definitionId: text(),
    classification,
    traits: textList(),
    summary: text(),
    description: new HTMLField({ required: false, blank: true, initial: "" }),
    mechanics,
    requirements: requirementSetField(),
    rules
  };
}

export function levelProgressionField({ resource = "talentPoints" } = {}) {
  return new SchemaField({
    maxLevel: whole(1, 1),
    purchase: purchaseCostField({ resource }),
    scaling: new ArrayField(scalingEntryField(), { initial: () => [] })
  });
}

/** Nullable on canonical sources; populated only on an Actor-owned snapshot. */
export function ownedAdvancementField() {
  return new SchemaField({
    currentLevel: optionalWhole(0),
    selections: textList()
  });
}

export function actionTimingField() {
  return new SchemaField({
    type: new StringField({ required: true, blank: false, initial: "action", choices: choices(["action", "reaction", "free", "passive"]) }),
    trigger: text()
  });
}

export function actionEconomyField() {
  return new SchemaField({
    actions: whole(1),
    reactions: whole()
  });
}

export function actionTargetingField() {
  return new SchemaField({
    type: text("self"),
    required: new BooleanField({ required: true, initial: false }),
    count: whole(1, 1),
    range: new NumberField({ required: true, min: 0, initial: 0, nullable: false })
  });
}

export function progressionPositionField() {
  return new SchemaField({
    x: new NumberField({ required: true, initial: 0, nullable: false }),
    y: new NumberField({ required: true, initial: 0, nullable: false })
  });
}

export function progressionNodePresentationField() {
  return new SchemaField({
    label: text(),
    description: new HTMLField({ required: false, blank: true, initial: "" }),
    img: new FilePathField({ required: false, categories: ["IMAGE"], initial: null, nullable: true }),
    color: text(),
    shape: new StringField({ required: true, blank: false, initial: "diamond", choices: choices(PROGRESSION_NODE_SHAPES) }),
    size: new SchemaField({
      preset: new StringField({ required: true, blank: false, initial: "medium", choices: choices(PROGRESSION_NODE_SIZE_PRESETS) }),
      width: optionalWhole(1),
      height: optionalWhole(1)
    }),
    hidden: new BooleanField({ required: true, initial: false })
  });
}

export function progressionNodeField() {
  return new SchemaField({
    id: new StringField({ required: true, blank: false, initial: "" }),
    kind: new StringField({ required: true, blank: false, initial: "content", choices: choices(PROGRESSION_NODE_KINDS) }),
    definitionId: text(),
    position: progressionPositionField(),
    tier: whole(),
    rankLimit: optionalWhole(1),
    purchase: purchaseCostField(),
    rankPurchase: purchaseCostField({ resource: "skillPoints" }),
    requirements: requirementSetField(),
    presentation: progressionNodePresentationField()
  });
}

export function progressionWaypointField() {
  return new SchemaField({
    id: text(),
    x: new NumberField({ required: true, initial: 0, nullable: false }),
    y: new NumberField({ required: true, initial: 0, nullable: false }),
    lockX: new BooleanField({ required: true, initial: false }),
    lockY: new BooleanField({ required: true, initial: false })
  });
}

export function progressionConnectionStyleField() {
  return new SchemaField({
    route: new StringField({ required: true, blank: false, initial: "linear", choices: choices(PROGRESSION_CONNECTION_ROUTES) }),
    bend: new NumberField({ required: true, min: -100, max: 100, initial: 0, nullable: false }),
    cornerRadius: new NumberField({ required: true, integer: true, min: 4, max: 160, initial: 36, nullable: false }),
    flip: new BooleanField({ required: true, initial: false }),
    thickness: new NumberField({ required: true, min: 1, max: 10, initial: 2, nullable: false }),
    sourceAnchor: new StringField({ required: true, blank: false, initial: "auto", choices: choices(PROGRESSION_CONNECTION_ANCHORS) }),
    targetAnchor: new StringField({ required: true, blank: false, initial: "auto", choices: choices(PROGRESSION_CONNECTION_ANCHORS) }),
    pattern: new StringField({ required: true, blank: false, initial: "solid", choices: choices(PROGRESSION_CONNECTION_PATTERNS) }),
    glow: new NumberField({ required: true, min: 0, max: 3, initial: 1, nullable: false }),
    color: text(),
    hidden: new BooleanField({ required: true, initial: false }),
    waypoints: new ArrayField(progressionWaypointField(), { initial: () => [] }),
    startJunction: new SchemaField({
      parentConnectionKey: text(),
      waypointId: text()
    })
  });
}

export function progressionEdgeField() {
  return new SchemaField({
    id: new StringField({ required: true, blank: false, initial: "" }),
    sourceId: new StringField({ required: true, blank: false, initial: "" }),
    targetId: new StringField({ required: true, blank: false, initial: "" }),
    kind: new StringField({ required: true, blank: false, initial: "path", choices: choices(["path", "prerequisite"]) }),
    requiredRank: whole(1, 1),
    style: progressionConnectionStyleField()
  });
}

export function normalizeStringList(values) {
  const entries = Array.isArray(values) ? values : values && typeof values === "object"
    ? Object.values(values)
    : String(values ?? "").split(/[\n,]/);
  return [...new Set(entries.map(value => String(value ?? "").trim()).filter(Boolean))];
}
