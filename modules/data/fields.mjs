const {
  NumberField,
  SchemaField,
  StringField,
  FilePathField,
  ArrayField,
  BooleanField,
  HTMLField
} = foundry.data.fields;

/** Value/max pool. */
export function resourceField({ value = 0, max = 10 } = {}) {
  return new SchemaField({
    value: new NumberField({ required: true, integer: true, min: 0, initial: value, nullable: false }),
    max: new NumberField({ required: true, integer: true, min: 0, initial: max, nullable: false })
  });
}

/** Attribute value. */
export function attributeField(initial = 1) {
  return new NumberField({ required: true, integer: true, min: 1, initial, nullable: false });
}

/** Hero attributes. */
export function attributesSchema() {
  return new SchemaField({
    physical: new SchemaField({
      strength: attributeField(),
      dexterity: attributeField(),
      agility: attributeField(),
      reaction: attributeField()
    }),
    mental: new SchemaField({
      intelligence: attributeField(),
      wisdom: attributeField(),
      focus: attributeField(),
      logic: attributeField()
    }),
    social: new SchemaField({
      charisma: attributeField(),
      perception: attributeField()
    })
  });
}

/** Single pool. */
export function valueField({ value = 0 } = {}) {
  return new SchemaField({
    value: new NumberField({ required: true, integer: true, min: 0, initial: value, nullable: false })
  });
}

/** Image field. */
export function imageField() {
  return new FilePathField({ required: false, categories: ["IMAGE"], initial: null, nullable: true });
}

/** Equip slots. */
export function equipmentSchema() {
  const slot = () => new StringField({ required: true, blank: true, initial: "" });
  return new SchemaField({
    helmet: slot(),
    back: slot(),
    neck: slot(),
    mainHand: slot(),
    shoulders: slot(),
    offHand: slot(),
    chest: slot(),
    waist: slot(),
    arms: slot(),
    legs: slot(),
    hands: slot(),
    feet: slot()
  });
}

/** Portrait crop. */
export function portraitCropSchema() {
  return new SchemaField({
    x: new NumberField({ required: true, min: -100, max: 200, initial: 50, nullable: false }),
    y: new NumberField({ required: true, min: -100, max: 200, initial: 50, nullable: false }),
    zoom: new NumberField({ required: true, min: 1, max: 5, initial: 1, nullable: false }),
    rotation: new NumberField({ required: true, integer: true, min: -180, max: 180, initial: 0, nullable: false }),
    flipX: new BooleanField({ required: true, initial: false })
  });
}

/** Skill entry. */
export function skillSchema() {
  return new SchemaField({
    label: new StringField({ required: true, blank: true, initial: "" }),
    modifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
    rank: new StringField({ required: true, blank: true, initial: "" }),
    dots: new NumberField({ required: true, integer: true, min: 0, max: 5, initial: 0, nullable: false })
  });
}

/** Skill category. */
export function skillCategorySchema() {
  return new SchemaField({
    label: new StringField({ required: true, blank: true, initial: "" }),
    icon: new StringField({ required: true, blank: true, initial: "fa-solid fa-crosshairs" }),
    skills: new ArrayField(skillSchema(), { initial: [] })
  });
}

/** Condition entry. */
export function conditionSchema() {
  return new SchemaField({
    name: new StringField({ required: true, blank: true, initial: "" }),
    img: imageField(),
    description: new StringField({ required: true, blank: true, initial: "" }),
    duration: new StringField({ required: true, blank: true, initial: "" })
  });
}

/** Reputation entry. */
export function reputationSchema() {
  return new SchemaField({
    name: new StringField({ required: true, blank: true, initial: "" }),
    standing: new StringField({ required: true, blank: true, initial: "" }),
    value: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    max: new NumberField({ required: true, integer: true, min: 0, initial: 100, nullable: false })
  });
}

/** Relationship entry. */
export function relationshipSchema() {
  return new SchemaField({
    name: new StringField({ required: true, blank: true, initial: "" }),
    img: imageField(),
    status: new StringField({ required: true, blank: true, initial: "" }),
    value: new NumberField({ required: true, integer: true, initial: 0, nullable: false })
  });
}

/** Character-generation contact. */
export function contactSchema() {
  return new SchemaField({
    name: new StringField({ required: true, blank: true, initial: "" }),
    role: new StringField({ required: true, blank: true, initial: "" }),
    disposition: new StringField({ required: true, blank: true, initial: "" }),
    notes: new StringField({ required: true, blank: true, initial: "" })
  });
}

/** Taken quality or flaw during character creation. */
export function qualityFlawSchema() {
  return new SchemaField({
    name: new StringField({ required: true, blank: true, initial: "" }),
    pillar: new StringField({ required: true, blank: true, initial: "General" }),
    tier: new StringField({ required: true, blank: true, initial: "Minor" }),
    points: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
    description: new StringField({ required: true, blank: true, initial: "" })
  });
}

/** Character-generation spend tracking. */
export function characterGenerationSchema() {
  return new SchemaField({
    complete: new BooleanField({ required: true, initial: false }),
    startingLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
    attributePointsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    talentSkillPointsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    talentSkillSelections: new ArrayField(new StringField({ required: true, blank: true, initial: "" }), { initial: [] }),
    talentPointsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    skillPointsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    spellPointsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    bonusProficiency: new StringField({ required: true, blank: true, initial: "" }),
    creditsSpent: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    notes: new StringField({ required: true, blank: true, initial: "" })
  });
}

/** Purchased, data-driven talent tree state. Catalog IDs are stable public data. */
export function talentTreeSchema() {
  return new SchemaField({
    branches: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
    leaves: new ArrayField(new SchemaField({
      id: new StringField({ required: true, blank: false, initial: "" }),
      rank: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false })
    }), { initial: [] })
  });
}

/** Combat resources. */
export function resourcesSchema() {
  return new SchemaField({
    health: resourceField({ value: 10, max: 10 }),
    tempHealth: valueField({ value: 0 }),
    mana: resourceField({ value: 100, max: 100 }),
    stamina: resourceField({ value: 100, max: 100 }),
    armor: resourceField({ value: 0, max: 0 }),
    shield: resourceField({ value: 0, max: 0 }),
    shields: resourceField({ value: 0, max: 0 }),
    barriers: resourceField({ value: 0, max: 0 }),
    inspiration: valueField({ value: 0 }),
    resolve: valueField({ value: 0 }),
    dying: valueField({ value: 0 }),
    wounded: valueField({ value: 0 })
  });
}

/** Biography HTML. */
export function biographyField() {
  return new HTMLField({ required: false, blank: true, initial: "" });
}

/** Boolean flag. */
export function booleanFlag(initial = false) {
  return new BooleanField({ required: true, initial });
}

/** Pool percent. */
export function poolPercent(pool) {
  const max = Number(pool?.max) || 0;
  if (max <= 0) return 0;
  const value = Math.max(0, Number(pool?.value) || 0);
  return Math.round(Math.min(100, (value / max) * 100));
}

const RESOURCE_KEYS = ["health", "mana", "stamina", "armor", "shields", "barriers"];
const RESOURCE_ALIASES = { shields: "shield", shield: "shields" };

/** Percent map. */
export function resourcePercents(resources = {}) {
  const percent = {};
  for (const key of RESOURCE_KEYS) {
    const pool = resources[key] ?? (RESOURCE_ALIASES[key] ? resources[RESOURCE_ALIASES[key]] : undefined);
    percent[key] = poolPercent(pool);
  }
  return percent;
}

/** Clamp pools. */
export function clampResourcePools(resources = {}, keys = RESOURCE_KEYS) {
  for (const key of keys) {
    const pool = resources[key] ?? (RESOURCE_ALIASES[key] ? resources[RESOURCE_ALIASES[key]] : undefined);
    if (pool) pool.value = Math.min(pool.value, pool.max);
  }
}
