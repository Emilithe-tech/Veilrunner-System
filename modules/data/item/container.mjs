import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { BooleanField, NumberField } = foundry.data.fields;

export default class ContainerData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.ContainerItem"];
  static defineSchema() {
    return {
      ...physicalItemFields(),
      capacity: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      weightReduction: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      extradimensional: new BooleanField({ required: true, initial: false })
    };
  }
  static migrateData(source) { return migratePhysicalItemData(super.migrateData(source)); }
}
