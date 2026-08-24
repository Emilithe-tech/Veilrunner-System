import { WEAPON_TYPES, migratePhysicalItemData, physicalItemFields } from "./physical.mjs";

const { StringField, NumberField, HTMLField, BooleanField, SchemaField } = foundry.data.fields;

/** Treasure data. */
export default class TreasureData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Treasure"];

  static defineSchema() {
    return {
      ...physicalItemFields(),
      category: new StringField({
        required: true,
        blank: false,
        initial: "junk",
        choices: {
          weapon: "VEILRUNNER.InventoryCategory.weapon",
          ammo: "VEILRUNNER.InventoryCategory.ammo",
          armor: "VEILRUNNER.InventoryCategory.armor",
          consumable: "VEILRUNNER.InventoryCategory.consumable",
          tech: "VEILRUNNER.InventoryCategory.tech",
          keyItem: "VEILRUNNER.InventoryCategory.keyItem",
          junk: "VEILRUNNER.InventoryCategory.junk"
        }
      }),
      weaponType: new StringField({
        required: true,
        blank: true,
        initial: "",
        choices: Object.fromEntries(WEAPON_TYPES.map(type => [type, `VEILRUNNER.WeaponFilter.${type}`]))
      }),
      quantity: new NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false }),
      weight: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      price: new NumberField({ required: true, min: 0, initial: 0, nullable: false }),
      description: new SchemaField({
        value: new HTMLField({ required: false, blank: true, initial: "" }),
        gm: new HTMLField({ required: false, blank: true, initial: "" })
      }),
      identified: new BooleanField({ required: true, initial: true })
    };
  }

  static migrateData(source) {
    return migratePhysicalItemData(super.migrateData(source));
  }
}
