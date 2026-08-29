const { HTMLField } = foundry.data.fields;
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

/** Canonical language reference data used by character generation. */
export default class LanguageData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.LanguageItem"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) {
    return migrateItemIdentityData(super.migrateData(source));
  }
}
