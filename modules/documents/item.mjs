/** System Item. */
import { defaultIntentsForItem, getDefinitionId, normalizeItemIntents } from "../data/item/identity.mjs";

export class VeilrunnerItem extends Item {
  /** @override */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (getDefinitionId(this) && !(this.system?.intents?.length)) {
      this.updateSource({ "system.intents": normalizeItemIntents(defaultIntentsForItem(this.type, this.system)) });
    }
    if (this.img && this.img !== "icons/svg/item-bag.svg") return;
    const defaultImages = {
      armor: "icons/svg/shield.svg",
      shield: "icons/svg/shield.svg",
      weapon: "icons/svg/sword.svg",
      ammunition: "icons/svg/coins.svg",
      magazine: "icons/svg/item-bag.svg",
      consumable: "icons/svg/potion.svg",
      container: "icons/svg/chest.svg",
      equipment: "icons/svg/item-bag.svg"
    };
    if (defaultImages[this.type]) this.updateSource({ img: defaultImages[this.type] });
  }

  /** Delegate roll. */
  async roll(...args) {
    if (typeof this.system?.roll !== "function") return null;
    if (["action", "ability"].includes(this.type) && !args[0]?.skipHudExecution) {
      const { executeHudAction } = await import("../apps/action-hud/execution.mjs");
      return executeHudAction(this.actor, this.id, { selections: args[0]?.composer ?? null });
    }
    return this.system.roll(this.actor, ...args);
  }

  /** Has roll. */
  get hasRoll() {
    return typeof this.system?.roll === "function";
  }
}
