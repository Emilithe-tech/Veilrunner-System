import { actionTreeSchema } from "./action-tree.mjs";

const { StringField, NumberField, BooleanField, HTMLField } = foundry.data.fields;

/** Action data. */
export default class ActionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Action"];

  static defineSchema() {
    return {
      activationKind: new StringField({ required: true, blank: false, initial: "action", choices: { action: "Action", ability: "Ability" } }),
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
      actions: new NumberField({ required: true, integer: true, min: 0, initial: 1, nullable: false }),
      damageType: new StringField({ required: true, blank: true, initial: "" }),
      currentLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      maxLevel: new NumberField({ required: true, integer: true, min: 1, initial: 1, nullable: false }),
      damageDice: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageDie: new NumberField({ required: true, integer: true, min: 2, initial: 6, nullable: false }),
      damageLevelInterval: new NumberField({ required: true, integer: true, min: 1, initial: 3, nullable: false }),
      cost: new StringField({ required: true, blank: true, initial: "" }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema()
    };
  }

  /** Roll action. */
  async roll(actor) {
    const item = this.parent;
    const name = foundry.utils.escapeHTML(item.name);
    const costs = item.system?.resourceCosts ?? {};
    const updates = {};
    for (const key of ["mana", "stamina", "health"]) {
      const cost = Math.max(0, Number(costs[key]) || 0);
      const current = Math.max(0, Number(actor.system?.resources?.[key]?.value) || 0);
      if (cost > current) return ui.notifications.warn(`${item.name} requires ${cost} ${key}, but ${actor.name} has ${current}.`);
      if (cost) updates[`system.resources.${key}.value`] = current - cost;
    }
    if (Object.keys(updates).length) await actor.update(updates);
    const applied = [];
    for (const effect of item.system?.effects ?? []) {
      const targetActors = effect.scope === "area"
        ? [...(game.user?.targets ?? [])].map(token => token.actor).filter(Boolean)
        : [actor];
      if (effect.scope === "area" && !targetActors.length) {
        ui.notifications.warn(`${item.name} has an area effect; target affected tokens before using it.`);
        continue;
      }
      if (!effect.target || !String(effect.value ?? "").trim()) continue;
      const key = String(effect.target).startsWith("system.") ? String(effect.target) : `system.${effect.target}`;
      for (const target of targetActors) {
        await target.createEmbeddedDocuments("ActiveEffect", [{
          name: item.name, img: item.img, origin: item.uuid,
          changes: [{ key, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(effect.value), priority: 20 }],
          flags: { veilrunner: { duration: String(effect.duration ?? ""), scope: effect.scope, notes: String(effect.notes ?? "") } }
        }]);
        applied.push(target.name);
      }
    }
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner action-use"><strong>${name}</strong>${applied.length ? `<p>Effects applied to ${foundry.utils.escapeHTML([...new Set(applied)].join(", "))}.</p>` : ""}</div>`
    });
  }
}
