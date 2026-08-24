const { ArrayField, HTMLField, StringField } = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

/** Species reference data. */
export default class SpeciesData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.SpeciesItem"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      persona: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) {
    return migrateItemIdentityData(super.migrateData(source));
  }
}
