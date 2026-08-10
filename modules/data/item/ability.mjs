const { StringField, BooleanField, HTMLField } = foundry.data.fields;

/** Ability data. */
export default class AbilityData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Ability"];

  static defineSchema() {
    return {
      featured: new BooleanField({ required: true, initial: false }),
      recharge: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
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
