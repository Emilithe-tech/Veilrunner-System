import CanonicalDefinitionData from "./definition.mjs";

export default class PracticeData extends CanonicalDefinitionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.PracticeItem", ...super.LOCALIZATION_PREFIXES];
}
