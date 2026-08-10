import {
  resourcesSchema,
  attributesSchema,
  biographyField,
  imageField,
  portraitCropSchema,
  equipmentSchema,
  skillCategorySchema,
  conditionSchema,
  reputationSchema,
  relationshipSchema,
  contactSchema,
  qualityFlawSchema,
  characterGenerationSchema,
  booleanFlag,
  poolPercent,
  resourceField,
  resourcePercents,
  clampResourcePools
} from "../fields.mjs";
import { xpForLevel } from "../xp.mjs";
import { attributePointsForLevel, skillPointsForLevel, talentPointsForLevel } from "../progression.mjs";

const { StringField, NumberField, ArrayField, SchemaField } = foundry.data.fields;

/** Hero data. */
export default class HeroData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Hero"];

  static defineSchema() {
    return {
      species: new StringField({ required: true, blank: true, initial: "" }),
      origin: new StringField({ required: true, blank: true, initial: "" }),
      background: new StringField({ required: true, blank: true, initial: "" }),
      pronouns: new StringField({ required: true, blank: true, initial: "" }),
      age: new StringField({ required: true, blank: true, initial: "" }),
      archetype: new StringField({ required: true, blank: true, initial: "" }),
      profession: new StringField({ required: true, blank: true, initial: "" }),
      discipline: new StringField({ required: true, blank: true, initial: "" }),
      personaIndex: new SchemaField({
        criminalLawful: new NumberField({ required: true, integer: true, min: -100, max: 100, initial: 0, nullable: false }),
        ruthlessEmpathy: new NumberField({ required: true, integer: true, min: -100, max: 100, initial: 0, nullable: false }),
        individualCollectivist: new NumberField({ required: true, integer: true, min: -100, max: 100, initial: 0, nullable: false })
      }),
      size: new StringField({ required: true, blank: true, initial: "" }),
      qualities: new SchemaField({
        severe: new StringField({ required: true, blank: true, initial: "" }),
        major: new StringField({ required: true, blank: true, initial: "" }),
        minor: new StringField({ required: true, blank: true, initial: "" })
      }),
      flaws: new SchemaField({
        severe: new StringField({ required: true, blank: true, initial: "" }),
        major: new StringField({ required: true, blank: true, initial: "" }),
        minor: new StringField({ required: true, blank: true, initial: "" })
      }),
      qualitiesTaken: new ArrayField(qualityFlawSchema(), { initial: [] }),
      flawsTaken: new ArrayField(qualityFlawSchema(), { initial: [] }),
      tags: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      level: new NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false }),
      experience: resourceField({ value: 0, max: xpForLevel(1) }),
      attributePoints: pointPoolSchema(),
      talentPoints: pointPoolSchema(),
      skillPoints: pointPoolSchema(),
      attributes: attributesSchema(),
      saves: new SchemaField({
        fortitude: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
        willpower: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
        reflex: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
      }),
      appearanceImage: imageField(),
      portraitImage: imageField(),
      equipmentImage: imageField(),
      portraitCrop: portraitCropSchema(),
      sheetOptions: new SchemaField({
        showPartyList: booleanFlag(true),
        onlyActiveResourceBars: booleanFlag(false)
      }),
      networkLinked: booleanFlag(false),
      resources: resourcesSchema(),
      equipment: equipmentSchema(),
      credits: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      quickEquip: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      skillCategories: new ArrayField(skillCategorySchema(), { initial: [] }),
      knownLanguages: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      contacts: new ArrayField(contactSchema(), { initial: [] }),
      characterGeneration: characterGenerationSchema(),
      biography: biographyField(),
      conditions: new ArrayField(conditionSchema(), { initial: [] }),
      reputation: new ArrayField(reputationSchema(), { initial: [] }),
      relationships: new ArrayField(relationshipSchema(), { initial: [] }),
      customEffects: new ArrayField(new SchemaField({
        name: new StringField({ required: true, blank: true, initial: "" }),
        description: new StringField({ required: true, blank: true, initial: "" })
      }), { initial: [] })
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.experience.max = xpForLevel(this.level);
    this.percent = {
      ...resourcePercents(this.resources),
      experience: poolPercent(this.experience)
    };
    clampResourcePools(this.resources);
  }

  static migrateData(source) {
    source = super.migrateData(source);
    const mental = source.attributes?.mental;
    if (mental && mental.wisdom === undefined && mental.willpower !== undefined) {
      mental.wisdom = mental.willpower;
      delete mental.willpower;
    }
    for (const [group, keys] of Object.entries({
      physical: ["strength", "dexterity", "agility", "reaction"],
      mental: ["intelligence", "wisdom", "focus", "logic"],
      social: ["charisma", "perception"]
    })) {
      source.attributes ??= {};
      source.attributes[group] ??= {};
      for (const key of keys) source.attributes[group][key] = Math.max(1, Number(source.attributes[group][key]) || 1);
    }
    source.saves ??= {};
    for (const save of ["fortitude", "willpower", "reflex"]) source.saves[save] = Math.max(0, Number(source.saves[save]) || 0);
    const poolBudgets = {
      attributePoints: attributePointsForLevel(source.level),
      talentPoints: talentPointsForLevel(source.level),
      skillPoints: skillPointsForLevel(source.level)
    };
    for (const [pool, budget] of Object.entries(poolBudgets)) source[pool] ??= { available: budget, total: budget };
    return source;
  }
}

function pointPoolSchema() {
  return new SchemaField({
    available: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    total: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
  });
}
