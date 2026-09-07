import { migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, HTMLField, SchemaField, ArrayField } = foundry.data.fields;

/** Armor item data. */
export default class ArmorData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.ArmorItem"];

  static defineSchema() {
    const textField = () => new StringField({ required: true, blank: true, initial: "" });
    const wholeNumber = (initial = 0) => new NumberField({
      required: true,
      integer: true,
      min: 0,
      initial,
      nullable: false
    });

    return {
      ...physicalItemFields(),
      armorType: new StringField({
        required: true,
        blank: false,
        initial: "light",
        choices: {
          light: "VEILRUNNER.ArmorType.light",
          medium: "VEILRUNNER.ArmorType.medium",
          heavy: "VEILRUNNER.ArmorType.heavy",
          shields: "VEILRUNNER.ArmorType.shields",
          greatShields: "VEILRUNNER.ArmorType.greatShields"
        }
      }),
      itemRating: wholeNumber(),
      armorClass: wholeNumber(),
      weight: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      cost: wholeNumber(),
      currency: textField(),
      movementPenalty: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
      equipmentSlot: new StringField({
        required: true,
        blank: true,
        initial: "",
        choices: {
          head: "VEILRUNNER.EquipmentSlot.head",
          chest: "VEILRUNNER.EquipmentSlot.chest",
          arms: "VEILRUNNER.EquipmentSlot.arms",
          legs: "VEILRUNNER.EquipmentSlot.legs",
          feet: "VEILRUNNER.EquipmentSlot.feet",
          offhand: "VEILRUNNER.EquipmentSlot.offhand"
        }
      }),
      capacity: new SchemaField({
        mode: new StringField({
          required: true,
          blank: false,
          initial: "armor",
          choices: {
            armor: "VEILRUNNER.CapacityMode.armor",
            shield: "VEILRUNNER.CapacityMode.shield"
          }
        }),
        armor: wholeNumber(),
        shield: wholeNumber()
      }),
      resistances: new ArrayField(new SchemaField({
        trait: textField(),
        level: wholeNumber(1)
      }), { initial: () => [] }),
      resistancesText: textField(),
      weaknesses: new ArrayField(new SchemaField({
        trait: textField(),
        level: wholeNumber(1)
      }), { initial: () => [] }),
      weaknessesText: textField(),
      durabilityRating: wholeNumber(),
      effects: new ArrayField(new SchemaField({
        targetType: new StringField({
          required: true,
          blank: false,
          initial: "attribute",
          choices: {
            action: "VEILRUNNER.EffectTarget.action",
            trait: "VEILRUNNER.EffectTarget.trait",
            attribute: "VEILRUNNER.EffectTarget.attribute"
          }
        }),
        target: textField(),
        value: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        notes: textField()
      }), { initial: () => [] }),
      bonuses: new ArrayField(new SchemaField({
        target: textField(),
        value: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        notes: textField()
      }), { initial: () => [] }),
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
