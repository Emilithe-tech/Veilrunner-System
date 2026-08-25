import ActionData from "./action.mjs";

/** Compendium-backed skill data; mechanically compatible with Actions. */
export default class SkillData extends ActionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Skill", "VEILRUNNER.Action"];
  static DEFAULT_CATEGORY = "actions";
}
