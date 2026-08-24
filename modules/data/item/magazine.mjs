import { compatibilitySchema, migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, SchemaField } = foundry.data.fields;
const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const whole = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial, nullable: false });

export default class MagazineData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.MagazineItem"];

  static defineSchema() {
    return {
      ...physicalItemFields(),
      capacity: whole(1),
      rounds: whole(),
      ammoId: text(),
      sourceAmmoId: text(),
      ammoName: text(),
      ammoImg: text(),
      ammoCaliber: text(),
      ammoType: text(),
      ammoDefinitionId: text(),
      compatibility: compatibilitySchema()
    };
  }

  static migrateData(source) {
    source = migratePhysicalItemData(super.migrateData(source));
    if (source?.capacity !== undefined && source?.rounds !== undefined) {
      source.rounds = Math.min(Math.max(0, Number(source.rounds) || 0), Math.max(0, Number(source.capacity) || 0));
    }
    return source;
  }
}
