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
  talentTreeSchema,
  booleanFlag,
  poolPercent,
  resourceField,
  resourcePercents,
  clampResourcePools
} from "../fields.mjs";
import { xpForLevel } from "../xp.mjs";
import { migrateRingEquipment } from "../equipment-slots.mjs";
import { normalizeQualitySelections } from "../../apps/chargen/quality-rules.mjs";

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
      appearance: new StringField({ required: true, blank: true, initial: "" }),
      personalityCues: new StringField({ required: true, blank: true, initial: "" }),
      values: new StringField({ required: true, blank: true, initial: "" }),
      mannerisms: new StringField({ required: true, blank: true, initial: "" }),
      firstImpression: new StringField({ required: true, blank: true, initial: "" }),
      importantEvent: new StringField({ required: true, blank: true, initial: "" }),
      currentMotivation: new StringField({ required: true, blank: true, initial: "" }),
      unresolvedConnection: new StringField({ required: true, blank: true, initial: "" }),
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
      equipmentBackgroundImage: imageField(),
      characterBackgroundImage: imageField(),
      portraitCrop: portraitCropSchema(),
      sheetOptions: new SchemaField({
        showPartyList: booleanFlag(true),
        hidePartyList: booleanFlag(false),
        hideHeroColumn: booleanFlag(false),
        showAllPartyResources: booleanFlag(false),
        disableResourceBarVfx: booleanFlag(false),
        compactResourceBars: booleanFlag(false),
        compactManaBar: booleanFlag(false),
        compactStaminaBar: booleanFlag(false),
        manaBarRounded: booleanFlag(false),
        staminaBarRounded: booleanFlag(false),
        staticHealthColor: booleanFlag(false),
        healthBarRoundLeft: booleanFlag(false),
        healthBarRoundRight: booleanFlag(false),
        healthBarColor: new StringField({ required: true, blank: true, initial: "" }),
        armorBarRoundLeft: booleanFlag(false),
        armorBarRoundRight: booleanFlag(false),
        armorBarColor: new StringField({ required: true, blank: true, initial: "" }),
        shieldsBarRoundLeft: booleanFlag(false),
        shieldsBarRoundRight: booleanFlag(false),
        shieldsBarColor: new StringField({ required: true, blank: true, initial: "" }),
        barriersBarRoundLeft: booleanFlag(false),
        barriersBarRoundRight: booleanFlag(false),
        barriersBarColor: new StringField({ required: true, blank: true, initial: "" }),
        hideResourceBarIcons: booleanFlag(false),
        showAllResourceBars: booleanFlag(false),
        showArmorResourceBar: booleanFlag(false),
        showShieldsResourceBar: booleanFlag(false),
        showBarriersResourceBar: booleanFlag(false),
        actionsView: new StringField({ required: true, blank: false, initial: "card" }),
        colorVision: new StringField({ required: true, blank: false, initial: "default" }),
        uiColor: new StringField({ required: true, blank: false, initial: "#101216" }),
        categoryHighlightColor: new StringField({ required: true, blank: false, initial: "#a855f7" }),
        panOffColor: new StringField({ required: true, blank: false, initial: "#ff0000" }),
        panOnColor: new StringField({ required: true, blank: false, initial: "#00ff49" }),
        panInterferenceColor: new StringField({ required: true, blank: false, initial: "#fbbf24" }),
        characterBorderColor: new StringField({ required: true, blank: false, initial: "#66717d" }),
        loadoutCardColor: new StringField({ required: true, blank: false, initial: "#cbd5e1" }),
        loadoutButtonColor: new StringField({ required: true, blank: true, initial: "" }),
        characterBackgroundColor: new StringField({ required: true, blank: false, initial: "#000000" }),
        characterBackgroundColorEnabled: booleanFlag(true),
        manaTextColor: new StringField({ required: true, blank: false, initial: "#60a5fa" }),
        staminaTextColor: new StringField({ required: true, blank: false, initial: "#f59e0b" }),
        levelUpColor: new StringField({ required: true, blank: false, initial: "#22d3ee" }),
        earnedXpColor: new StringField({ required: true, blank: false, initial: "#22d3ee" }),
        totalXpColor: new StringField({ required: true, blank: false, initial: "#12141c" }),
        levelUpGlowColor: new StringField({ required: true, blank: false, initial: "#22d3ee" }),
        levelUpBrightness: new NumberField({ required: true, min: 0.25, max: 2, initial: 1, nullable: false }),
        levelUpIntensity: new NumberField({ required: true, min: 0.25, max: 2, initial: 1, nullable: false }),
        levelUpGlowIntensity: new NumberField({ required: true, min: 0.25, max: 2, initial: 1, nullable: false })
      }),
      networkLinked: booleanFlag(false),
      panSilent: booleanFlag(false),
      resources: resourcesSchema(),
      equipment: equipmentSchema(),
      equipmentAssignments: new ArrayField(new SchemaField({
        itemId: new StringField({ required: true, blank: false, initial: "" }),
        slots: new ArrayField(new StringField({ required: true, blank: false, initial: "" }), { initial: [] })
      }), { initial: [] }),
      credits: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      quickEquip: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      assetLinks: new ArrayField(new SchemaField({
        actorUuid: new StringField({ required: true, blank: false, initial: "" }),
        kind: new StringField({ required: true, blank: false, initial: "pet", choices: { pet: "Pet", spirit: "Spirit", drone: "Drone", summon: "Summon", vehicle: "Vehicle" } })
      }), { initial: [] }),
      skillCategories: new ArrayField(skillCategorySchema(), { initial: [] }),
      knownLanguages: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      contacts: new ArrayField(contactSchema(), { initial: [] }),
      characterGeneration: characterGenerationSchema(),
      talentTree: talentTreeSchema(),
      biography: biographyField(),
      biographySections: new SchemaField({
        overview: biographyField(),
        earlyLife: biographyField(),
        career: biographyField(),
        relationships: biographyField(),
        notes: biographyField()
      }),
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
    const hasQualitiesTaken = Object.hasOwn(source, "qualitiesTaken");
    const hasFlawsTaken = Object.hasOwn(source, "flawsTaken");
    source = super.migrateData(source);
    migrateRingEquipment(source);
    if (hasQualitiesTaken) source.qualitiesTaken = normalizeQualitySelections(source.qualitiesTaken);
    if (hasFlawsTaken) source.flawsTaken = normalizeQualitySelections(source.flawsTaken);
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
      const attributes = source.attributes?.[group];
      if (!attributes) continue;
      for (const key of keys) {
        if (attributes[key] !== undefined) attributes[key] = Math.max(1, Number(attributes[key]) || 1);
      }
    }
    if (source.saves) {
      for (const save of ["fortitude", "willpower", "reflex"]) {
        if (source.saves[save] !== undefined) source.saves[save] = Math.max(0, Number(source.saves[save]) || 0);
      }
    }
    if (source.equipment) {
      for (const slot of ["helmet", "back", "shoulders", "offHand", "waist", "hands"]) {
        delete source.equipment[slot];
      }
      const stableSlots = ["head", "chest", "arms", "legs", "feet", "mainHand", "ears", "neck", "wrists", "leftRing", "auxiliary", "offhand"];
      const hasCompleteRoster = stableSlots.every(slot => Object.hasOwn(source.equipment, slot));
      if (source.equipmentAssignments === undefined && hasCompleteRoster) {
        const assignments = new Map();
        for (const slot of stableSlots) {
          const itemId = source.equipment[slot];
          if (!itemId) continue;
          const slots = assignments.get(itemId) ?? [];
          slots.push(slot);
          assignments.set(itemId, slots);
        }
        source.equipmentAssignments = [...assignments].map(([itemId, slots]) => ({ itemId, slots }));
      }
    }
    if (source.assetLinks !== undefined && !Array.isArray(source.assetLinks)) source.assetLinks = [];
    // Data-model migrations also receive partial update payloads. Do not add
    // missing point pools here: the schema supplies initial values for a new
    // actor, while adding them to a UI-style update overwrites saved data.
    return source;
  }
}

function pointPoolSchema() {
  return new SchemaField({
    available: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
    total: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false })
  });
}
