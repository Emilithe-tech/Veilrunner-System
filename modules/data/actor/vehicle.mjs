import { biographyField, resourceField, poolPercent } from "../fields.mjs";

const { StringField, NumberField, SchemaField } = foundry.data.fields;

/** Vehicle data. */
export default class VehicleData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Vehicle"];

  static defineSchema() {
    return {
      crew: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      speed: new StringField({ required: true, blank: true, initial: "" }),
      resources: new SchemaField({
        health: resourceField({ value: 10, max: 10 })
      }),
      biography: biographyField()
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.percent = { health: poolPercent(this.resources.health) };
    this.resources.health.value = Math.min(this.resources.health.value, this.resources.health.max);
  }
}
