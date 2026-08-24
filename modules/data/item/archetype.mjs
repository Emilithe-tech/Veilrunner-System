const { HTMLField, StringField } = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

/** Top-level character Path category. */
export default class ArchetypeData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.ArchetypeItem"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      summary: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) { return migrateItemIdentityData(super.migrateData(source)); }
}

