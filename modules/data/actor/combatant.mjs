import { biographyField, resourcesSchema, resourcePercents, clampResourcePools } from "../fields.mjs";

/** Combatant base. */
export default class CombatantData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Combatant"];

  static defineSchema() {
    return {
      resources: resourcesSchema(),
      biography: biographyField()
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.percent = resourcePercents(this.resources);
    clampResourcePools(this.resources);
  }
}
