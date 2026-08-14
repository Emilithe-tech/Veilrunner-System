/** Shared authoring fields for Actions and zero-action-point Abilities. */
const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

const whole = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial, nullable: false });

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
    resourceCosts: new SchemaField({ mana: whole(), stamina: whole(), health: whole() }),
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
