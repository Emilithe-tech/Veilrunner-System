const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { buildPartyOverview } from "../helpers/party.mjs";

/** Basic actor sheet. */
export default class VeilrunnerActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "actor", "basic"],
    position: { width: 520, height: 560 },
    window: { resizable: true, title: "", icon: false },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addPartyCurrency: VeilrunnerActorSheet.#onAddPartyCurrency,
      removePartyCurrency: VeilrunnerActorSheet.#onRemovePartyCurrency,
      setPartyTab: VeilrunnerActorSheet.#onSetPartyTab,
      openPartyMember: VeilrunnerActorSheet.#onOpenPartyMember,
      openPartyItem: VeilrunnerActorSheet.#onOpenPartyItem
    }
  };

  static PARTS = {
    body: {
      template: "systems/veilrunner/templates/actor/basic-sheet.hbs",
      templates: ["systems/veilrunner/templates/actor/party/parts/currencies.hbs"]
    }
  };

  partyTab = "currencies";

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system ?? {};
    context.actor = this.actor;
    context.system = system;
    context.isGM = game.user.isGM;
    context.hasSpecies = Object.hasOwn(system, "species");
    context.hasLevel = Object.hasOwn(system, "level");
    context.hasResources = Boolean(system.resources);
    context.hasCrew = Object.hasOwn(system, "crew");
    context.hasSeverity = Object.hasOwn(system, "severity");
    context.hasSaveDC = Object.hasOwn(system, "saveDC");
    context.hasBiography = Object.hasOwn(system, "biography");
    context.isParty = this.actor.type === "party";
    if (context.isParty) {
      context.partyOverview = buildPartyOverview(this.actor);
      context.partyTab = this.partyTab;
    }
    return context;
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = super._prepareSubmitData(event, form, formData);
    if (!foundry.utils.hasProperty(submitData, "system.currencies")) return submitData;

    const rawCurrencies = foundry.utils.getProperty(submitData, "system.currencies");
    const currencies = Array.isArray(rawCurrencies) ? rawCurrencies : Object.values(rawCurrencies ?? {});

    foundry.utils.setProperty(submitData, "system.currencies", currencies
      .map(currency => ({
        name: String(currency?.name ?? "").trim(),
        value: Math.max(0, Number(currency?.value ?? 0) || 0)
      }))
      .filter(currency => currency.name || currency.value > 0));
    return submitData;
  }

  static async #onAddPartyCurrency() {
    const currencies = Array.isArray(this.actor.system?.currencies) ? [...this.actor.system.currencies] : [];
    currencies.push({ name: "", value: 0 });
    await this.actor.update({ "system.currencies": currencies });
  }

  static async #onRemovePartyCurrency(event, target) {
    const index = Number(target.dataset.index);
    const currencies = Array.isArray(this.actor.system?.currencies) ? [...this.actor.system.currencies] : [];
    if (!Number.isInteger(index) || index < 0 || index >= currencies.length) return;
    currencies.splice(index, 1);
    await this.actor.update({ "system.currencies": currencies });
  }

  static #onSetPartyTab(event, target) {
    const tab = target.dataset.tab;
    if (!["currencies", "inventory"].includes(tab) || this.partyTab === tab) return;
    this.partyTab = tab;
    this.render();
  }

  static #onOpenPartyMember(event, target) {
    const actor = game.actors.get(target.closest("[data-actor-id]")?.dataset.actorId);
    actor?.sheet?.render(true);
  }

  static #onOpenPartyItem(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    item?.sheet?.render(true);
  }
}
