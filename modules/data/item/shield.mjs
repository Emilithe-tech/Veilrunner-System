import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { NumberField } = foundry.data.fields;
const whole = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial, nullable: false });

export default class ShieldData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.ShieldItem"];
  static defineSchema() {
    return { ...physicalItemFields(), armorClass: whole(), block: whole(), capacity: whole() };
  }
  static migrateData(source) { return migratePhysicalItemData(super.migrateData(source)); }
}
