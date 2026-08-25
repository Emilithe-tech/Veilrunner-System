import ActionData from "./action.mjs";
import { migrateActionSystemData } from "./action-formula.mjs";

const { StringField } = foundry.data.fields;

/** Compendium-backed spell data; mechanically compatible with Actions. */
export default class SpellData extends ActionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Spell", "VEILRUNNER.Action"];
  static DEFAULT_CATEGORY = "magic";

  static defineSchema() {
    return {
      ...super.defineSchema(),
      actionMode: new StringField({ required: true, blank: false, initial: "spell", choices: { action: "Action", reaction: "Reaction", ability: "Ability", spell: "Spell", digital: "Digital" } }),
      baseSpellDamage: new StringField({ required: true, blank: true, initial: "" }),
      spellDamagePerLevel: new StringField({ required: true, blank: true, initial: "" })
    };
  }

  static migrateData(source) {
    return migrateActionSystemData(super.migrateData(source), { itemType: "spell", complete: false });
  }
}
