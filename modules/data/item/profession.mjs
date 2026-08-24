const { StringField, HTMLField } = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

/** Mid-level character Path choice linked to one Archetype definition. */
export default class ProfessionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.ProfessionItem"];

  static defineSchema() {
    const text = () => new StringField({ required: true, blank: true, initial: "" });
    return {
      ...itemIdentityFields(),
      archetypeId: text(),
      archetype: text(),
      summary: text(),
      pageImage: text(),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) {
    return migrateItemIdentityData(super.migrateData(source));
  }
}
