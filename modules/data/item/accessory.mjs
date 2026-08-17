import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, HTMLField, SchemaField, ArrayField } = foundry.data.fields;

/** Accessory item data. */
export default class AccessoryData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.AccessoryItem"];

  static defineSchema() {
    const textField = () => new StringField({ required: true, blank: true, initial: "" });

    return {
      ...physicalItemFields(),
      equipmentSlot: new StringField({
        required: true,
        blank: true,
        initial: "",
        choices: {
          ears: "VEILRUNNER.EquipmentSlot.ears",
          neck: "VEILRUNNER.EquipmentSlot.neck",
          wrists: "VEILRUNNER.EquipmentSlot.wrists",
          leftRing: "VEILRUNNER.EquipmentSlot.leftRing",
          rightRing: "VEILRUNNER.EquipmentSlot.rightRing"
        }
      }),
      weight: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      cost: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      currency: textField(),
      bonuses: new ArrayField(new SchemaField({
        target: textField(),
        value: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        notes: textField()
      }), { initial: [] }),
      bonusesText: textField(),
      description: new SchemaField({
        value: new HTMLField({ required: false, blank: true, initial: "" }),
        gm: new HTMLField({ required: false, blank: true, initial: "" })
      })
    };
  }

  static migrateData(source) {
    return migratePhysicalItemData(super.migrateData(source));
  }
}
