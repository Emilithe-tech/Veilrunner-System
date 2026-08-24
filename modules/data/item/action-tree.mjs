/** Shared authoring fields for Actions and zero-action-point Abilities. */
const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const whole = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial, nullable: false });
const text = (initial = "") => new StringField({ required: true, blank: true, initial });

function resourceCostSchema() {
  return new SchemaField({ mana: whole(), stamina: whole(), health: whole() });
}

function composerFieldSchema() {
  return new SchemaField({
    key: new StringField({ required: true, blank: false, initial: "option" }),
    label: text(),
    type: new StringField({ required: true, blank: false, initial: "select", choices: { select: "Select", rank: "Rank", toggle: "Toggle", number: "Number" } }),
    choices: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
    required: new BooleanField({ required: true, initial: false }),
    min: whole(),
    max: whole(20),
    defaultValue: text()
  });
}

export const ACTION_TRAIT_SEED = Object.freeze([
  "elemental", "primal", "arcane", "spirit", "creation", "intrinsic", "occult", "divine",
  "action", "ability", "reaction", "tech-action", "attack", "concentrate", "manipulate", "movement",
  "fire", "cold", "water", "earth", "air", "electric", "acid", "sonic", "light", "void", "force",
  "physical", "mental", "spiritual", "energy", "healing", "persistent", "splash", "critical",
  "self", "single-target", "multiple-targets", "area", "aura", "burst", "cone", "line", "emanation",
  "armor", "barrier", "defense", "dodge", "parry", "resistance", "shield", "counter",
  "blinded", "burning", "charmed", "confused", "deafened", "frightened", "immobilized", "invisible",
  "poisoned", "prone", "restrained", "slowed", "stunned", "weakened", "buff", "debuff",
  "binding", "channeling", "conjuration", "illusion", "summoning", "telekinesis", "transmutation",
  "hacking", "interference", "network", "drone", "cyberware", "signal", "surveillance", "countermeasure",
  "stealth", "detection", "social", "exploration", "combat", "status"
]);

export function actionTreeSchema() {
  return {
    traits: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
    governingAttribute: text(),
    resourceCosts: resourceCostSchema(),
    requirements: new ArrayField(new SchemaField({
      scope: new StringField({ required: true, blank: false, initial: "actor", choices: { actor: "Actor", target: "Target" } }),
      type: new StringField({ required: true, blank: false, initial: "effect", choices: { effect: "Effect", resource: "Resource", "health-percent": "Health Percent", "actor-type": "Actor Type", trait: "Trait", range: "Range" } }),
      key: text(),
      operator: new StringField({ required: true, blank: false, initial: "eq", choices: { eq: "=", neq: "!=", gt: ">", gte: ">=", lt: "<", lte: "<=" } }),
      value: text(),
      knowledge: new StringField({ required: true, blank: false, initial: "known", choices: { known: "Known to Player", mechanical: "Mechanical Truth" } }),
      reason: text()
    }), { initial: [] }),
    consumes: new ArrayField(new SchemaField({
      scope: new StringField({ required: true, blank: false, initial: "actor", choices: { actor: "Actor", target: "Target" } }),
      effect: text(),
      stacks: whole(1)
    }), { initial: [] }),
    composer: new ArrayField(composerFieldSchema(), { initial: [] }),
    enhancements: new ArrayField(new SchemaField({
      id: new StringField({ required: true, blank: false, initial: "enhancement" }),
      label: text(),
      description: text(),
      costs: resourceCostSchema(),
      actionAdjustment: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
      maxStacks: whole(1)
    }), { initial: [] }),
    augments: new ArrayField(new SchemaField({
      definitionId: text(),
      label: text(),
      minRank: whole(1),
      maxRank: whole(20),
      requiredTraits: new ArrayField(text(), { initial: [] })
    }), { initial: [] }),
    rankScaling: new SchemaField({
      enabled: new BooleanField({ required: true, initial: false }),
      min: whole(1),
      max: whole(20),
      manaPerRank: whole(),
      staminaPerRank: whole(),
      actionPerRank: whole()
    }),
    effects: new ArrayField(new SchemaField({
      scope: new StringField({ required: true, blank: false, initial: "actor", choices: { actor: "Actor", area: "Area" } }),
      target: new StringField({ required: true, blank: true, initial: "" }),
      value: new StringField({ required: true, blank: true, initial: "" }),
      duration: new StringField({ required: true, blank: true, initial: "" }),
      notes: new StringField({ required: true, blank: true, initial: "" })
    }), { initial: [] }),
    tree: new SchemaField({
      enabled: new BooleanField({ required: true, initial: false }),
      page: new StringField({ required: true, blank: false, initial: "skills", choices: { skills: "Skills", magic: "Magic" } }),
      school: new StringField({ required: true, blank: true, initial: "" }),
      practice: new StringField({ required: true, blank: true, initial: "" }),
      x: new NumberField({ required: true, initial: 0, nullable: false }),
      y: new NumberField({ required: true, initial: 0, nullable: false }),
      requires: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      talentCost: whole(1),
      rankCost: whole(1),
      requiredLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false })
    })
  };
}
