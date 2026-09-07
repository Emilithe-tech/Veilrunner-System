import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";
import { requirementSetFields } from "../definitions/semantic-fields.mjs";
import { qualityRequirements } from "./legacy-quality-requirements.mjs";

const { StringField, NumberField, HTMLField, ArrayField, SchemaField } = foundry.data.fields;

const kindField = initial => new StringField({ required: true, blank: false, initial, choices: { perk: "Perk", flaw: "Flaw" } });

export default class QualityData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.QualityItem"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      kind: kindField("perk"),
      tier: new StringField({ required: true, blank: false, initial: "Minor", choices: { Minor: "Minor", Moderate: "Moderate", Significant: "Significant", Major: "Major", Extreme: "Extreme" } }),
      pillar: new StringField({ required: true, blank: false, initial: "Physical", choices: { Physical: "Physical", Social: "Social", Magical: "Magical", Technical: "Technical" } }),
      summary: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      mechanics: new HTMLField({ required: false, blank: true, initial: "" }),
      tags: new ArrayField(new StringField({ required: true, blank: false }), { initial: () => [] }),
      recommendationTags: new ArrayField(new StringField({ required: true, blank: false }), { initial: () => [] }),
      requirements: new SchemaField({
        ...requirementSetFields()
      })
    };
  }

  static migrateData(source) {
    source = migrateItemIdentityData(super.migrateData(source));
    if (source.requirements) source.requirements = qualityRequirements(source.requirements);
    return source;
  }
}
