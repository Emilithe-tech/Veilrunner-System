const { ArrayField, HTMLField, SchemaField, StringField } = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

/** Final character Path choice linked to one Profession definition. */
export default class DisciplineData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.DisciplineItem"];

  static defineSchema() {
    const text = () => new StringField({ required: true, blank: true, initial: "" });
    const textList = () => new ArrayField(new StringField({ required: true, blank: false }), { initial: [] });
    return {
      ...itemIdentityFields(),
      professionId: text(),
      profession: text(),
      summary: text(),
      quote: text(),
      primaryWeapon: text(),
      primaryAttributes: textList(),
      bonusAttributes: textList(),
      bonusSkill: text(),
      persona: textList(),
      tags: textList(),
      abilities: new ArrayField(new SchemaField({ name: text(), type: text(), text: text() }), { initial: [] }),
      pageImage: text(),
      source: text(),
      sourcePage: text(),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) { return migrateItemIdentityData(super.migrateData(source)); }
}
