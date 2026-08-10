const { StringField, BooleanField, HTMLField } = foundry.data.fields;

/** Action data. */
export default class ActionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Action"];

  static defineSchema() {
    return {
      actionType: new StringField({
        required: true,
        blank: false,
        initial: "standard",
        choices: {
          standard: "VEILRUNNER.ActionType.standard",
          bonus: "VEILRUNNER.ActionType.bonus",
          reaction: "VEILRUNNER.ActionType.reaction",
          free: "VEILRUNNER.ActionType.free"
        }
      }),
      category: new StringField({
        required: true,
        blank: false,
        initial: "actions",
        choices: {
          actions: "VEILRUNNER.ActionCategory.actions",
          reactions: "VEILRUNNER.ActionCategory.reactions",
          magic: "VEILRUNNER.ActionCategory.magic",
          tech: "VEILRUNNER.ActionCategory.tech"
        }
      }),
      favorite: new BooleanField({ required: true, initial: false }),
      cost: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" })
    };
  }

  /** Roll action. */
  async roll(actor) {
    const item = this.parent;
    const name = foundry.utils.escapeHTML(item.name);
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner action-use"><strong>${name}</strong></div>`
    });
  }
}
