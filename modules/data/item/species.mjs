const { ArrayField, HTMLField, StringField } = foundry.data.fields;

/** Species reference data. */
export default class SpeciesData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.SpeciesItem"];

  static defineSchema() {
    return {
      persona: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }
}
