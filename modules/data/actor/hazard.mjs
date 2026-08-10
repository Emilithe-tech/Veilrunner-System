import { biographyField } from "../fields.mjs";

const { StringField, NumberField } = foundry.data.fields;

/** Hazard data. */
export default class HazardData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Hazard"];

  static defineSchema() {
    return {
      severity: new StringField({ required: true, blank: true, initial: "" }),
      saveDC: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      biography: biographyField()
    };
  }
}
