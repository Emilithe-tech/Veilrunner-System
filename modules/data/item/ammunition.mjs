import { DAMAGE_TYPES, migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, SchemaField } = foundry.data.fields;
const text = (initial = "") => new StringField({ required: true, blank: true, initial });

export default class AmmunitionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.AmmunitionItem"];

  static defineSchema() {
    return {
      ...physicalItemFields(),
      ammoType: text("ballistic"),
      caliber: text(),
      damage: new SchemaField({
        modifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        type: new StringField({
          required: true,
          blank: true,
          initial: "",
          choices: Object.fromEntries(DAMAGE_TYPES.map(type => [type, `VEILRUNNER.DamageTrait.${type}`]))
        })
      })
    };
  }

  static migrateData(source) {
    return migratePhysicalItemData(super.migrateData(source));
  }
}
