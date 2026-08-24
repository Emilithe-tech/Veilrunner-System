import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

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
      tags: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      recommendationTags: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requirements: new SchemaField({
        text: new StringField({ required: true, blank: true, initial: "" }),
        minimumLevel: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
        requiredDefinitionIds: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
        requiredTags: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] })
      })
    };
  }

  static migrateData(source) { return migrateItemIdentityData(super.migrateData(source)); }
}

export class PerkData extends QualityData {
  static defineSchema() { return { ...super.defineSchema(), kind: kindField("perk") }; }
  static migrateData(source) { source = super.migrateData(source); source.kind = "perk"; return source; }
}

export class FlawData extends QualityData {
  static defineSchema() { return { ...super.defineSchema(), kind: kindField("flaw") }; }
  static migrateData(source) { source = super.migrateData(source); source.kind = "flaw"; return source; }
}
