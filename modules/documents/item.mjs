/** System Item. */
export class VeilrunnerItem extends Item {
  /** @override */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (this.type !== "armor") return;
    if (this.img && this.img !== "icons/svg/item-bag.svg") return;
    this.updateSource({ img: "icons/svg/shield.svg" });
  }

  /** Delegate roll. */
  async roll(...args) {
    if (typeof this.system?.roll !== "function") return null;
    return this.system.roll(this.actor, ...args);
  }

  /** Has roll. */
  get hasRoll() {
    return typeof this.system?.roll === "function";
  }
}
