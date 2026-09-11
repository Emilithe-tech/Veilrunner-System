/** System Item. */
import { isOwnedActionItem } from "../actions/action-sources.mjs";
import { assertDefinitionIdentityUpdate } from "../data/definitions/identity-update.mjs";
import { characterLibraryFolder } from "../data/definitions/character-library-folders.mjs";

export class VeilrunnerItem extends Item {
  /** @override */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if ((this.pack ?? options.pack) === "Veilrunner.character-library" && !this.folder && !data.folder) {
      const folder = characterLibraryFolder(this);
      if (folder) this.updateSource({ folder });
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
      equipment: "icons/svg/item-bag.svg",
      spell: "icons/svg/light.svg",
      skill: "icons/svg/book.svg"
    };
    if (defaultImages[this.type]) this.updateSource({ img: defaultImages[this.type] });
  }

  /** @override */
  async _preUpdate(changes, options, user) {
    assertDefinitionIdentityUpdate(this, changes);
    return super._preUpdate(changes, options, user);
  }

  /** Delegate roll. */
  async roll(...args) {
    if (typeof this.system?.roll !== "function") return null;
    if (isOwnedActionItem(this) && !args[0]?.skipHudExecution) {
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
