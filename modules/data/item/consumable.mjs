import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, SchemaField } = foundry.data.fields;
const whole = (initial = 0) => new NumberField({ required: true, integer: true, min: 0, initial, nullable: false });

export default class ConsumableData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.ConsumableItem"];
  static defineSchema() {
    return {
      ...physicalItemFields(),
      consumableType: new StringField({ required: true, blank: true, initial: "" }),
      uses: new SchemaField({ value: whole(1), max: whole(1) }),
      consumeQuantity: whole(1),
      actionUuid: new StringField({ required: true, blank: true, initial: "" })
    };
  }
  static migrateData(source) { return migratePhysicalItemData(super.migrateData(source)); }
}
