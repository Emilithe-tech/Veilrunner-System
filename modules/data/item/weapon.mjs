import {
  DAMAGE_TYPES, EQUIPMENT_SLOTS, WEAPON_TYPES,
  compatibilitySchema, migratePhysicalItemData, physicalItemFields
} from "./physical.mjs";

const { ArrayField, StringField, NumberField, SchemaField } = foundry.data.fields;
const text = (initial = "") => new StringField({ required: true, blank: true, initial });
const whole = (initial = 0, min = 0) => new NumberField({ required: true, integer: true, min, initial, nullable: false });

export function parseDamageFormula(formula) {
  const match = String(formula ?? "").trim().match(/^(\d*)d(\d+)$/i);
  if (!match) return null;
  return { dice: Math.max(1, Number(match[1]) || 1), die: Math.max(2, Number(match[2]) || 2) };
}

export function migrateWeaponData(source) {
  source = migratePhysicalItemData(source);
  if (source.damage && typeof source.damage === "object") {
    const legacyDice = Math.max(0, Number(source.damage.dice) || 0);
    const legacyDie = Math.max(2, Number(source.damage.die) || 6);
    if (source.damage.base === undefined && (source.damage.dice !== undefined || source.damage.die !== undefined)) {
      source.damage.base = `${legacyDice}d${legacyDie}`;
    }
    if (source.damage.max === undefined && source.damage.base !== undefined) source.damage.max = source.damage.base;
    delete source.damage.dice;
    delete source.damage.die;
  }
  if (source.handedness !== undefined) {
    source.handedness = source.handedness === "two" ? "two" : "one";
    source.requiredSlots = source.handedness === "two" ? ["mainHand", "offhand"] : ["mainHand"];
  } else if (source.requiredSlots !== undefined) {
    const slots = Array.isArray(source.requiredSlots)
      ? source.requiredSlots
      : source.requiredSlots && typeof source.requiredSlots === "object"
        ? Object.values(source.requiredSlots)
        : [source.requiredSlots];
    source.handedness = slots.includes("mainHand") && slots.includes("offhand") ? "two" : "one";
  }
  return source;
}

export default class WeaponData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PhysicalItem", "VEILRUNNER.WeaponItem"];

  static defineSchema() {
    return {
      ...physicalItemFields(),
      requiredSlots: new ArrayField(new StringField({
        required: true,
        blank: false,
        choices: Object.fromEntries(EQUIPMENT_SLOTS.map(slot => [slot, `VEILRUNNER.EquipmentSlot.${slot}`]))
      }), { initial: () => ["mainHand"] }),
      weaponType: new StringField({
        required: true,
        blank: false,
        initial: "pistol",
        choices: Object.fromEntries(WEAPON_TYPES.map(type => [type, `VEILRUNNER.WeaponFilter.${type}`]))
      }),
      weaponKind: new StringField({ required: true, blank: false, initial: "melee", choices: {
        melee: "VEILRUNNER.WeaponKind.melee",
        ranged: "VEILRUNNER.WeaponKind.ranged",
        firearm: "VEILRUNNER.WeaponKind.firearm"
      } }),
      handedness: new StringField({ required: true, blank: false, initial: "one", choices: {
        one: "VEILRUNNER.Handedness.one",
        two: "VEILRUNNER.Handedness.two"
      } }),
      actions: whole(1),
      attack: new SchemaField({ formula: text("1d10"), selector: text("attack") }),
      damage: new SchemaField({
        base: text("1d6"),
        max: text("1d6"),
        modifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
        type: new StringField({
          required: true,
          blank: false,
          initial: "piercing",
          choices: Object.fromEntries(DAMAGE_TYPES.map(type => [type, `VEILRUNNER.DamageTrait.${type}`]))
        })
      }),
      range: whole(),
      firearm: new SchemaField({
        magazineMode: new StringField({ required: true, blank: false, initial: "none", choices: {
          none: "VEILRUNNER.MagazineMode.none",
          detachable: "VEILRUNNER.MagazineMode.detachable",
          internal: "VEILRUNNER.MagazineMode.internal"
        } }),
        capacity: whole(),
        loadedMagazineId: text(),
        internal: new SchemaField({
          ammoId: text(), sourceAmmoId: text(), quantity: whole(), name: text(), img: text(), caliber: text(), ammoType: text(), ammoDefinitionId: text()
        }),
        fireModes: new ArrayField(new SchemaField({
          id: text("single"), label: text("Single Shot"), actions: whole(1), ammoCost: whole(1),
          attackModifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          damageModifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          damageFormula: text(), rangeModifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          traits: new ArrayField(text(), { initial: () => [] })
        }), { initial: () => [] }),
        options: new ArrayField(new SchemaField({
          id: text("option"), label: text(), description: text(),
          actionAdjustment: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          ammoAdjustment: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          attackModifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          damageModifier: new NumberField({ required: true, integer: true, initial: 0, nullable: false }),
          traits: new ArrayField(text(), { initial: () => [] })
        }), { initial: () => [] }),
        compatibility: compatibilitySchema()
      })
    };
  }

  static migrateData(source) {
    return migrateWeaponData(super.migrateData(source));
  }
}
