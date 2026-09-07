import {
  normalizeStringList
} from "../definitions/semantic-fields.mjs";

const { ArrayField, HTMLField, StringField } = foundry.data.fields;

/** Veilrunner condition semantics layered on Foundry's native ActiveEffect changes. */
export default class ConditionData extends foundry.data.ActiveEffectTypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Condition"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      definitionId: new StringField({ required: true, blank: true, initial: "" }),
      category: new StringField({ required: true, blank: false, initial: "condition" }),
      traits: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  static migrateData(source) {
    source = super.migrateData(source);
    if (source?.traits !== undefined) source.traits = normalizeStringList(source.traits);
    return source;
  }
}
