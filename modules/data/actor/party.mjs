import { biographyField } from "../fields.mjs";

const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;

/** Party data. */
export default class PartyData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PartyData"];

  static defineSchema() {
    return {
      members: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      currencies: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true, initial: "" }),
        value: new NumberField({ required: true, min: 0, initial: 0, nullable: false })
      }), { initial: [{ name: "Credits", value: 0 }] }),
      biography: biographyField()
    };
  }
}
