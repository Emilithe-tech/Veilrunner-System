const { StringField, ArrayField, HTMLField } = foundry.data.fields;

/** Profession discipline data. */
export default class ProfessionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.ProfessionItem"];

  static defineSchema() {
    const text = () => new StringField({ required: true, blank: true, initial: "" });
    const textList = () => new ArrayField(new StringField({ required: true, blank: false }), { initial: [] });

    return {
      archetype: text(),
      profession: text(),
      discipline: text(),
      quote: text(),
      primaryWeapon: text(),
      primaryAttributes: textList(),
      bonusAttributes: textList(),
      bonusSkill: text(),
      persona: textList(),
      pageImage: text(),
      sourcePage: text(),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
