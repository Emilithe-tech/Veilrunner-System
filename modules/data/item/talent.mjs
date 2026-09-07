import CanonicalDefinitionData from "./definition.mjs";
import {
  levelProgressionField,
  ownedAdvancementField
} from "../definitions/semantic-fields.mjs";

export default class TalentData extends CanonicalDefinitionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.TalentItem", ...super.LOCALIZATION_PREFIXES];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      progression: levelProgressionField({ resource: "talentPoints" }),
      owned: ownedAdvancementField()
    };
  }

  static migrateData(source) {
    source = super.migrateData(source);
    if (!source || typeof source !== "object") return source;
    if (source.progression === undefined && source.maxLevel !== undefined) {
      source.progression = { maxLevel: Math.max(1, Math.trunc(Number(source.maxLevel) || 1)) };
    }
    if (source.owned === undefined && source.currentLevel !== undefined) {
      source.owned = { currentLevel: Math.max(0, Math.trunc(Number(source.currentLevel) || 0)) };
    }
    return source;
  }
}
