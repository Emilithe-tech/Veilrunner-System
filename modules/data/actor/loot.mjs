import { biographyField } from "../fields.mjs";

/** Loot data. */
export default class LootData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Loot"];

  static defineSchema() {
    return {
      biography: biographyField()
    };
  }
}
