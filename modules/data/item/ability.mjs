import { actionTreeSchema } from "./action-tree.mjs";
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

const { StringField, NumberField, BooleanField, HTMLField, ArrayField } = foundry.data.fields;

/** Ability data. */
export default class AbilityData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Ability"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      featured: new BooleanField({ required: true, initial: false }),
      activationKind: new StringField({ required: true, blank: false, initial: "ability" }),
      actionType: new StringField({ required: true, blank: false, initial: "free", choices: { standard: "Standard", bonus: "Bonus", reaction: "Reaction", free: "Free" } }),
      category: new StringField({ required: true, blank: false, initial: "actions", choices: { actions: "VEILRUNNER.ActionCategory.actions", reactions: "VEILRUNNER.ActionCategory.reactions", magic: "VEILRUNNER.ActionCategory.magic", tech: "VEILRUNNER.ActionCategory.tech" } }),
      actions: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageType: new StringField({ required: true, blank: true, initial: "" }),
      currentLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      maxLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      damageDice: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageDie: new NumberField({ required: true, integer: true, min: 2, initial: 6, nullable: false }),
      damageLevelInterval: new NumberField({ required: true, integer: true, min: 1, initial: 3, nullable: false }),
      recharge: new StringField({ required: true, blank: true, initial: "" }),
      selector: new StringField({ required: true, blank: true, initial: "ability" }),
      requiresTarget: new BooleanField({ required: true, initial: false }),
      requiredItemTypes: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredItemTraits: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredDefinitionIds: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredItemIntents: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredEffects: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredTargetEffects: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      summary: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema()
    };
  }

  static migrateData(source) {
    return migrateItemIdentityData(super.migrateData(source));
  }

  /** Use ability. */
  async roll(actor, options = {}) {
    const item = this.parent;
    const name = foundry.utils.escapeHTML(item.name);
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner ability-use"><strong>${name}</strong>${options.mapPenalty ? `<p>MAP ${Number(options.mapPenalty)}</p>` : ""}</div>`
    });
  }
}
