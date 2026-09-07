import { actionTreeSchema } from "./action-tree.mjs";
import { prepareActionEffectDocument } from "../../rules/effect-boundary.mjs";
import { evaluateActionAvailability } from "../../apps/action-hud/availability.mjs";
import { itemIdentityFields, migrateItemIdentityData } from "./identity.mjs";
import { migrateActionSystemData } from "./action-formula.mjs";
import { canonicalDefinitionExtensionFields } from "../definitions/semantic-fields.mjs";

const { StringField, NumberField, BooleanField, HTMLField, ArrayField, SchemaField } = foundry.data.fields;

/** Action data. */
export default class ActionData extends foundry.abstract.TypeDataModel {
  static LOCALIZATION_PREFIXES = ["VEILRUNNER.Action"];
  static DEFAULT_CATEGORY = "actions";

  static defineSchema() {
    return {
      ...itemIdentityFields(),
      actionMode: new StringField({ required: true, blank: false, initial: "action", choices: { action: "Action", reaction: "Reaction", ability: "Ability", spell: "Spell", digital: "Digital" } }),
      activationKind: new StringField({ required: true, blank: false, initial: "action", choices: { action: "Action", ability: "Ability" } }),
      actionType: new StringField({
        required: true,
        blank: false,
        initial: "standard",
        choices: {
          standard: "VEILRUNNER.ActionType.standard",
          reaction: "VEILRUNNER.ActionType.reaction",
          free: "VEILRUNNER.ActionType.free"
        }
      }),
      category: new StringField({
        required: true,
        blank: false,
        initial: this.DEFAULT_CATEGORY,
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
      damageDice: new NumberField({ required: true, integer: true, min: 0, initial: 0, nullable: false }),
      damageDie: new NumberField({ required: true, integer: true, min: 2, initial: 6, nullable: false }),
      damageLevelInterval: new NumberField({ required: true, integer: true, min: 1, initial: 3, nullable: false }),
      damageFormula: new StringField({ required: true, blank: true, initial: "" }),
      cost: new StringField({ required: true, blank: true, initial: "" }),
      rollFormula: new StringField({ required: true, blank: true, initial: "" }),
      selector: new StringField({ required: true, blank: true, initial: "action" }),
      requiresTarget: new BooleanField({ required: true, initial: false }),
      summary: new StringField({ required: true, blank: true, initial: "" }),
      composer: new ArrayField(new SchemaField({
        key: new StringField({ required: true, blank: false, initial: "option" }),
        label: new StringField({ required: true, blank: true, initial: "" }),
        choices: new ArrayField(new StringField({ required: true, blank: false }), { initial: () => [] }),
        required: new BooleanField({ required: true, initial: false })
      }), { initial: () => [] }),
      description: new HTMLField({ required: false, blank: true, initial: "" }),
      ...actionTreeSchema(),
      ...canonicalDefinitionExtensionFields()
    };
  }

  static migrateData(source) {
    source = migrateActionSystemData(migrateItemIdentityData(super.migrateData(source)), { complete: false });
    if (source?.rules !== undefined && !Array.isArray(source.rules)) source.rules = [];
    return source;
  }

  /** Roll action. */
  async roll(actor, options = {}) {
    const item = this.parent;
    const resolved = options.resolvedAction?.resolvedAction ?? null;
    if (!options.skipAvailability) {
      const availability = evaluateActionAvailability({ actor, action: options.composer ? { ...item, composerSelections: options.composer } : item, target: [...(game.user?.targets ?? [])][0]?.actor ?? null });
      if (!availability.available) return ui.notifications.warn(availability.reason);
    }
    const modifierNames = (options.resolvedAction?.selectedSpellModifiers ?? []).map(modifier => `${modifier.label}${modifier.count > 1 ? ` x${modifier.count}` : ""}`);
    const name = foundry.utils.escapeHTML(`${resolved?.name ?? item.name}${modifierNames.length ? ` — ${modifierNames.join(", ")}` : ""}`);
    const costs = options.skipResourceCommit ? {} : resolved?.resourceCosts ?? item.system?.resourceCosts ?? {};
    const updates = {};
    for (const key of ["mana", "stamina", "health"]) {
      const cost = Math.max(0, Number(costs[key]) || 0);
      const current = Math.max(0, Number(actor.system?.resources?.[key]?.value) || 0);
      if (cost > current) return ui.notifications.warn(`${item.name} requires ${cost} ${key}, but ${actor.name} has ${current}.`);
      if (cost) updates[`system.resources.${key}.value`] = current - cost;
    }
    if (Object.keys(updates).length) await actor.update(updates);
    const applied = [];
    for (const effect of resolved?.effects ?? item.system?.effects ?? []) {
      const targetActors = effect.scope === "area"
        ? [...(game.user?.targets ?? [])].map(token => token.actor).filter(Boolean)
        : [actor];
      if (effect.scope === "area" && !targetActors.length) {
        ui.notifications.warn(`${item.name} has an area effect; target affected tokens before using it.`);
        continue;
      }
      if (!effect.target || !String(effect.value ?? "").trim()) continue;
      const preparedEffect = prepareActionEffectDocument(item, effect, { systemId: game.system.id });
      if (!preparedEffect.valid) {
        ui.notifications.warn(`${item.name} has an invalid effect: ${preparedEffect.errors.join(" ")}`);
        continue;
      }
      for (const target of targetActors) {
        await target.createEmbeddedDocuments("ActiveEffect", [preparedEffect.data]);
        applied.push(target.name);
      }
    }
    const selector = String(resolved?.roll.selector ?? item.system?.selector ?? "action");
    const formula = String(resolved?.roll.formula ?? item.system?.rollFormula ?? "").trim();
    let roll = null;
    let rollData = actor.getRollData();
    if (formula) {
      const context = actor.getItemRuleContext?.({
        selectors: [selector, "action", `action:${item.id}`],
        options: ["action:roll", `action:${item.id}`, `action:category:${item.system?.category ?? "actions"}`, ...(resolved?.traits ?? item.system?.traits ?? []).map(trait => `trait:${trait}`), ...Object.entries(resolved?.selections ?? options.composer ?? {}).map(([key, value]) => `action:${item.id}:choice:${key}:${value}`)]
      });
      const modifier = (context?.modifiers?.total ?? 0) + (selector === "attack" ? Number(options.mapPenalty ?? 0) : 0);
      rollData = context?.rollData ?? rollData;
      roll = await new Roll(`${formula}${modifier ? ` + ${modifier}` : ""}`, rollData).evaluate();
    }
    const damageFormula = String(resolved?.damage.formula ?? options.resolvedAction?.damageFormula ?? "").trim();
    const damageType = resolved?.damage.type ?? item.system?.damageType ?? "";
    const damage = damageFormula ? await new Roll(damageFormula, rollData).evaluate() : null;
    if (roll && damage) await damage.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${name} | ${damageType ? `${foundry.utils.escapeHTML(damageType)} ` : ""}Damage`
    });
    if (roll) return roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${name}${applied.length ? ` — Effects applied to ${foundry.utils.escapeHTML([...new Set(applied)].join(", "))}` : ""}`
    });
    if (damage) return damage.toMessage({
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor: `${name} | ${damageType ? `${foundry.utils.escapeHTML(damageType)} ` : ""}Damage`
    });
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="veilrunner action-use"><strong>${name}</strong>${applied.length ? `<p>Effects applied to ${foundry.utils.escapeHTML([...new Set(applied)].join(", "))}.</p>` : ""}</div>`
    });
  }
}
