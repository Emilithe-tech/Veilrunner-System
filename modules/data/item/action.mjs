import { actionTreeSchema } from "./action-tree.mjs";
import { isItemEquipped } from "../../rules/item-rules.mjs";

const { StringField, NumberField, BooleanField, HTMLField, ArrayField } = foundry.data.fields;

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
      rollFormula: new StringField({ required: true, blank: true, initial: "" }),
      selector: new StringField({ required: true, blank: true, initial: "action" }),
      requiredItemTypes: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredItemTraits: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema()
    };
  }

  /** Roll action. */
  async roll(actor) {
    const item = this.parent;
    const name = foundry.utils.escapeHTML(item.name);
    const equippedItems = actor.items.filter(document => isItemEquipped(actor, document));
    const requiredTypes = item.system?.requiredItemTypes ?? [];
    const requiredTraits = item.system?.requiredItemTraits ?? [];
    if (requiredTypes.length && !requiredTypes.some(type => equippedItems.some(document => document.type === type))) {
      return ui.notifications.warn(`${item.name} requires an equipped ${requiredTypes.join(" or ")}.`);
    }
    if (requiredTraits.length && !requiredTraits.every(trait => equippedItems.some(document => document.system?.traits?.includes(trait)))) {
      return ui.notifications.warn(`${item.name} requires equipped item traits: ${requiredTraits.join(", ")}.`);
    }
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
          flags: { [game.system.id]: { duration: String(effect.duration ?? ""), scope: effect.scope, notes: String(effect.notes ?? "") } }
        }]);
        applied.push(target.name);
      }
    }
    const selector = String(item.system?.selector || "action");
    const formula = String(item.system?.rollFormula || "").trim();
    let roll = null;
    if (formula) {
      const context = actor.getItemRuleContext?.({
        selectors: [selector, "action", `action:${item.id}`],
        options: ["action:roll", `action:${item.id}`, `action:category:${item.system?.category ?? "actions"}`, ...(item.system?.traits ?? []).map(trait => `trait:${trait}`)]
      });
      const modifier = context?.modifiers?.total ?? 0;
      roll = await new Roll(`${formula}${modifier ? ` + ${modifier}` : ""}`, context?.rollData ?? actor.getRollData()).evaluate();
    }
    if (roll) return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${name}${applied.length ? ` — Effects applied to ${foundry.utils.escapeHTML([...new Set(applied)].join(", "))}` : ""}`
    });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner action-use"><strong>${name}</strong>${applied.length ? `<p>Effects applied to ${foundry.utils.escapeHTML([...new Set(applied)].join(", "))}.</p>` : ""}</div>`
    });
  }
}
