const { ArrayField, HTMLField, StringField } = foundry.data.fields;

/** Origin reference data. */
export default class OriginData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.OriginItem"];

  static defineSchema() {
    return {
      persona: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
