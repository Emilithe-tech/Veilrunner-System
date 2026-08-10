import {
  resourcesSchema,
  biographyField,
  imageField,
  portraitCropSchema,
  booleanFlag,
  resourcePercents,
  clampResourcePools
} from "../fields.mjs";

const { StringField, NumberField } = foundry.data.fields;

/** NPC data. */
export default class NpcData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Npc"];

  static defineSchema() {
    return {
      species: new StringField({ required: true, blank: true, initial: "" }),
      level: new NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false }),
      appearanceImage: imageField(),
      portraitImage: imageField(),
      portraitCrop: portraitCropSchema(),
      networkLinked: booleanFlag(false),
      resources: resourcesSchema(),
      biography: biographyField()
    };
  }

  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
    this.percent = resourcePercents(this.resources);
    clampResourcePools(this.resources);
  }
}
