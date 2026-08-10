const { StringField, NumberField, HTMLField, SchemaField, ArrayField } = foundry.data.fields;

/** Accessory item data. */
export default class AccessoryData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.AccessoryItem"];

  static defineSchema() {
    const textField = () => new StringField({ required: true, blank: true, initial: "" });

    return {
      equipmentSlot: new StringField({
        required: true,
        blank: true,
        initial: "",
        choices: {
          head: "VEILRUNNER.EquipmentSlot.head",
          chest: "VEILRUNNER.EquipmentSlot.chest",
          cloak: "VEILRUNNER.EquipmentSlot.cloak",
          shoulders: "VEILRUNNER.EquipmentSlot.shoulders",
          arms: "VEILRUNNER.EquipmentSlot.arms",
          hands: "VEILRUNNER.EquipmentSlot.hands",
          waist: "VEILRUNNER.EquipmentSlot.waist",
          legs: "VEILRUNNER.EquipmentSlot.legs",
          feet: "VEILRUNNER.EquipmentSlot.feet",
          accessory: "VEILRUNNER.EquipmentSlot.accessory"
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
}
