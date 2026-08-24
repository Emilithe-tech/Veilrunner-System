import { actionTreeSchema } from "./action-tree.mjs";
import { isItemEquipped } from "../../rules/item-rules.mjs";
import { evaluateActionAvailability } from "../../apps/action-hud/availability.mjs";
import { hasItemIntent, itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";

const { StringField, NumberField, BooleanField, HTMLField, ArrayField, SchemaField } = foundry.data.fields;

/** Action data. */
export default class ActionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Action"];

  static defineSchema() {
    return {
      ...itemIdentityFields(),
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
          tech: "VEILRUNNER.ActionCategory.tech",
          weapon: "Weapon", digital: "Digital", normal: "Normal", consumables: "Consumables", gadgets: "Gadgets", "item-actions": "Item Actions", vehicles: "Vehicles", pets: "Pets", spirits: "Spirits"
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
      requiredDefinitionIds: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredItemIntents: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiresTarget: new BooleanField({ required: true, initial: false }),
      summary: new StringField({ required: true, blank: true, initial: "" }),
      requiredEffects: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      requiredTargetEffects: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
      composer: new ArrayField(new SchemaField({
        key: new StringField({ required: true, blank: false, initial: "option" }),
        label: new StringField({ required: true, blank: true, initial: "" }),
        choices: new ArrayField(new StringField({ required: true, blank: false }), { initial: [] }),
        required: new BooleanField({ required: true, initial: false })
      }), { initial: [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema()
    };
  }

  static migrateData(source) {
    return migrateItemIdentityData(super.migrateData(source));
  }

  /** Roll action. */
  async roll(actor, options = {}) {
    const item = this.parent;
    if (!options.skipAvailability) {
      const availability = evaluateActionAvailability({ actor, action: options.composer ? { ...item, composerSelections: options.composer } : item, target: [...(game.user?.targets ?? [])][0]?.actor ?? null });
      if (!availability.available) return ui.notifications.warn(availability.reason);
    }
    const name = foundry.utils.escapeHTML(item.name);
    const equippedItems = actor.items.filter(document => isItemEquipped(actor, document));
    const requiredTypes = item.system?.requiredItemTypes ?? [];
    const requiredTraits = item.system?.requiredItemTraits ?? [];
    const requiredDefinitionIds = item.system?.requiredDefinitionIds ?? [];
    const requiredIntents = item.system?.requiredItemIntents ?? [];
    if (requiredTypes.length && !requiredTypes.some(type => equippedItems.some(document => document.type === type))) {
      return ui.notifications.warn(`${item.name} requires an equipped ${requiredTypes.join(" or ")}.`);
    }
    if (requiredTraits.length && !requiredTraits.every(trait => equippedItems.some(document => document.system?.traits?.includes(trait)))) {
      return ui.notifications.warn(`${item.name} requires equipped item traits: ${requiredTraits.join(", ")}.`);
    }
    if (requiredDefinitionIds.length && !requiredDefinitionIds.every(definitionId => equippedItems.some(document => document.system?.definitionId === definitionId))) {
      return ui.notifications.warn(`${item.name} requires equipped definitions: ${requiredDefinitionIds.join(", ")}.`);
    }
    if (requiredIntents.length && !requiredIntents.every(intent => equippedItems.some(document => hasItemIntent(document, intent)))) {
      return ui.notifications.warn(`${item.name} requires equipped item capabilities: ${requiredIntents.join(", ")}.`);
    }
    const costs = options.skipResourceCommit ? {} : item.system?.resourceCosts ?? {};
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
        options: ["action:roll", `action:${item.id}`, `action:category:${item.system?.category ?? "actions"}`, ...(item.system?.traits ?? []).map(trait => `trait:${trait}`), ...Object.entries(options.composer ?? {}).map(([key, value]) => `action:${item.id}:choice:${key}:${value}`)]
      });
      const modifier = (context?.modifiers?.total ?? 0) + (selector === "attack" ? Number(options.mapPenalty ?? 0) : 0);
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
