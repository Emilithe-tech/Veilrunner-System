import CanonicalDefinitionData from "./definition.mjs";
import {
  progressionEdgeField,
  progressionNodeField
} from "../definitions/semantic-fields.mjs";

const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;

export default class ProgressionData extends CanonicalDefinitionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.ProgressionItem", ...super.LOCALIZATION_PREFIXES];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      practiceDefinitionId: new StringField({ required: true, blank: true, initial: "" }),
      layout: new SchemaField({
        version: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
        width: new NumberField({ required: true, min: 1, initial: 3840, nullable: false }),
        height: new NumberField({ required: true, min: 1, initial: 2160, nullable: false }),
        rootNodeId: new StringField({ required: true, blank: true, initial: "" })
      }),
      nodes: new ArrayField(progressionNodeField(), { initial: () => [] }),
      edges: new ArrayField(progressionEdgeField(), { initial: () => [] })
    };
  }

  static migrateData(source) {
    source = super.migrateData(source);
    if (!source || typeof source !== "object") return source;
    if (source.nodes !== undefined && !Array.isArray(source.nodes)) source.nodes = [];
    if (source.edges !== undefined && !Array.isArray(source.edges)) source.edges = [];
    return source;
  }
}
