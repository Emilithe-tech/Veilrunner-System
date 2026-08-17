import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField } = foundry.data.fields;

export default class EquipmentData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.EquipmentItem"];
  static defineSchema() {
    return { ...physicalItemFields(), equipmentType: new StringField({ required: true, blank: true, initial: "" }) };
  }
  static migrateData(source) { return migratePhysicalItemData(super.migrateData(source)); }
}
