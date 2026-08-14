import { actionTreeSchema } from "./action-tree.mjs";

const { StringField, NumberField, BooleanField, HTMLField } = foundry.data.fields;

/** Ability data. */
export default class AbilityData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Ability"];

  static defineSchema() {
    return {
      featured: new BooleanField({ required: true, initial: false }),
      category: new StringField({ required: true, blank: false, initial: "actions", choices: { actions: "VEILRUNNER.ActionCategory.actions", reactions: "VEILRUNNER.ActionCategory.reactions", magic: "VEILRUNNER.ActionCategory.magic", tech: "VEILRUNNER.ActionCategory.tech" } }),
      actions: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageType: new StringField({ required: true, blank: true, initial: "" }),
      currentLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      maxLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      damageDice: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageDie: new NumberField({ required: true, integer: true, min: 2, initial: 6, nullable: false }),
      damageLevelInterval: new NumberField({ required: true, integer: true, min: 1, initial: 3, nullable: false }),
      recharge: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema()
    };
  }

  /** Use ability. */
  async roll(actor) {
    const item = this.parent;
    const name = foundry.utils.escapeHTML(item.name);
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner ability-use"><strong>${name}</strong></div>`
    });
  }
}
