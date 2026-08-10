/** System Actor. */
export class VeilrunnerActor extends Actor {
  /** Set friendly as the prototype-token default for newly created heroes. */
  async _preCreate(data, options, user) {
    await super._preCreate(data, options, user);
    if (this.type !== "hero" || data.prototypeToken?.disposition !== undefined) return;
    this.updateSource({ "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY });
  }

  /** Resource percents. */
  get resourcePercents() {
    return this.system?.percent ?? {};
  }

  /** @override */
  getRollData() {
    const data = super.getRollData();
    data.attributes ??= {};
    data.attributes.social ??= {};
    data.attributes.physical ??= {};
    data.attributes.social.perception ??= 0;
    data.attributes.physical.reaction ??= 0;
    return data;
  }
}
