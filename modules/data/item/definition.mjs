import {
  canonicalDefinitionFields,
  normalizeStringList
} from "../definitions/semantic-fields.mjs";

/** Shared source contract for new semantic definition Item types. */
export default class CanonicalDefinitionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.CanonicalDefinition"];

  static defineSchema() {
    return canonicalDefinitionFields();
  }

  static migrateData(source) {
    source = super.migrateData(source);
    if (!source || typeof source !== "object") return source;
    if (source.traits !== undefined) source.traits = normalizeStringList(source.traits);
    if (source.rules !== undefined && !Array.isArray(source.rules)) source.rules = [];
    return source;
  }
}
