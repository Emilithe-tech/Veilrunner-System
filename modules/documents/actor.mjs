import { adjustedDegreeOfSuccess, applyResolvedChanges, resolveActorItemRules, stackedModifiers } from "../rules/item-rules.mjs";

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
    const resolved = resolveActorItemRules(this, { options: ["actor:roll-data"], data });
    return applyResolvedChanges(data, resolved);
  }

  /** Resolve equipped-item rule synthetics for a particular roll or action. */
  getItemRuleContext({ selectors = ["all"], options = [], activeItemIds = [], data = null } = {}) {
    const rollData = data ?? super.getRollData();
    const resolved = resolveActorItemRules(this, { options, activeItemIds, data: rollData });
    return { resolved, modifiers: stackedModifiers(resolved, selectors), rollData: applyResolvedChanges(rollData, resolved) };
  }

  /** Apply equipped-item degree-of-success rules to a zero-to-three result. */
  adjustDegreeOfSuccess(base, { selectors = ["all"], options = [], activeItemIds = [] } = {}) {
    const { resolved } = this.getItemRuleContext({ selectors, options, activeItemIds });
    return adjustedDegreeOfSuccess(base, resolved, selectors);
  }
}
