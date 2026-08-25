import ActionData from "./action.mjs";
import { migrateActionSystemData } from "./action-formula.mjs";

const { StringField, BooleanField } = foundry.data.fields;

/** Ability data shares the complete Action contract and remains a free action. */
export default class AbilityData extends ActionData {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Ability", "VEILRUNNER.Action"];

  static defineSchema() {
    return {
      ...super.defineSchema(),
      featured: new BooleanField({ required: true, initial: false }),
      recharge: new StringField({ required: true, blank: true, initial: "" }),
      actionMode: new StringField({ required: true, blank: false, initial: "ability", choices: { action: "Action", reaction: "Reaction", ability: "Ability", spell: "Spell", digital: "Digital" } }),
      activationKind: new StringField({ required: true, blank: false, initial: "ability", choices: { action: "Action", ability: "Ability" } }),
      actionType: new StringField({ required: true, blank: false, initial: "free", choices: { standard: "Standard", reaction: "Reaction", free: "Free" } }),
      selector: new StringField({ required: true, blank: false, initial: "ability" })
    };
  }

  static migrateData(source) {
    return migrateActionSystemData(super.migrateData(source), { itemType: "ability", complete: false });
  }
}
