import CanonicalDefinitionData from "./definition.mjs";

const { ArrayField, BooleanField, NumberField, StringField } = foundry.data.fields;

const optionalText = () => new StringField({ required: false, blank: true });
const optionalWhole = min => new NumberField({ required: false, integer: true, min, nullable: false });
const optionalTextList = () => new ArrayField(new StringField({ required: true, blank: false }), { required: false });

export default class TraitData extends CanonicalDefinitionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.TraitItem", ...super.LOCALIZATION_PREFIXES];

  static defineSchema() {
    return {
      ...super.defineSchema(),

      // Bounded compatibility for the 34 ability-shaped unique-traits records.
      // These are optional so newly-authored canonical traits do not inherit legacy action state.
      actions: optionalWhole(0),
      category: optionalText(),
      currentLevel: optionalWhole(0),
      damageDice: optionalWhole(0),
      damageDie: optionalWhole(2),
      damageLevelInterval: optionalWhole(1),
      damageType: optionalText(),
      featured: new BooleanField({ required: false }),
      intents: optionalTextList(),
      maxLevel: optionalWhole(1),
      providedActionIds: optionalTextList(),
      recharge: optionalText()
    };
  }
}
