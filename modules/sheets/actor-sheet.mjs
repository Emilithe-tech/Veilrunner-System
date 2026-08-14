const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { buildPartyOverview } from "../helpers/party.mjs";
import { journalDatapadData } from "../apps/datapad.mjs";

const BASE_CURRENCY_NAME = "Galactic Federation Credits";
const BASE_CURRENCY_ICON = "fa-solid fa-sim-card";

function validIconClass(icon) {
  const value = String(icon ?? "").trim();
  return /^fa(?:-[a-z]+)*\s+fa-[a-z0-9-]+$/i.test(value) ? value : "fa-solid fa-coins";
}

/**
 * Copy the stored currency rows before replacing the ArrayField. Using the
 * actor's source avoids reconstructing existing rows from a form/model view
 * while a submit or rerender is in progress.
 */
function storedCurrencyRows(actor) {
  const sourceCurrencies = actor.toObject()?.system?.currencies;
  const currencies = Array.isArray(sourceCurrencies)
    ? sourceCurrencies
    : Array.isArray(actor.system?.currencies) ? actor.system.currencies : [];
  return currencies.map(currency => foundry.utils.deepClone(currency));
}

function getFilePickerClass() {
  return foundry.applications?.apps?.FilePicker?.implementation
    ?? foundry.applications?.apps?.FilePicker
    ?? null;
}

async function renderFilePicker(picker) {
  if (typeof picker.browse === "function") return picker.browse();
  try {
    return picker.render(true);
  } catch (err) {
    return picker.render({ force: true });
  }
}

/** Basic actor sheet. */
export default class VeilrunnerActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["veilrunner", "sheet", "actor", "basic"],
    position: { width: 960, height: 800 },
    window: { resizable: true, title: "", icon: false },
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      addPartyCurrency: VeilrunnerActorSheet.#onAddPartyCurrency,
      removePartyCurrency: VeilrunnerActorSheet.#onRemovePartyCurrency,
      toggleCurrencyTracking: VeilrunnerActorSheet.#onToggleCurrencyTracking,
      setPartyImage: VeilrunnerActorSheet.#onSetPartyImage,
      setPartyTab: VeilrunnerActorSheet.#onSetPartyTab,
      openPartyJournalEntry: VeilrunnerActorSheet.#onOpenPartyJournalEntry,
      closePartyJournalEntry: VeilrunnerActorSheet.#onClosePartyJournalEntry,
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
  partyTabPrevious = null;
  partyJournalEntryId = null;
  partyJournalClosing = false;

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
      context.partyTabIndicatorFrom = this.partyTabPrevious === null
        ? ["currencies", "inventory", "journal"].indexOf(this.partyTab)
        : ["currencies", "inventory", "journal"].indexOf(this.partyTabPrevious);
      context.partyJournalClosing = this.partyJournalClosing;
      context.partyJournals = game.journal
        .filter(journal => {
          const datapad = journalDatapadData(journal);
          const canView = game.user.isGM || journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
          return canView && datapad.category === "party-journal" && datapad.partyId === this.actor.id && (game.user.isGM || !datapad.hidden);
        })
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(journal => ({
          id: journal.id,
          name: journal.name,
          folder: journal.folder?.name ?? "",
          pageCount: journal.pages.size
        }));
      context.partyJournalEntry = await this.#preparePartyJournalEntry();
    }
    return context;
  }

  /** Apply the opening player's hero-sheet palette to Party sheets. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.actor.type !== "party") return;

    const indicator = this.element?.querySelector(".vr-party-v2-tab-indicator");
    if (indicator && this.partyTabPrevious !== null && this.partyTabPrevious !== this.partyTab) {
      const target = ["currencies", "inventory", "journal"].indexOf(this.partyTab);
      requestAnimationFrame(() => indicator.style.setProperty("--party-tab-offset", target));
    }
    this.partyTabPrevious = null;

    const sheetOptions = game.user?.character?.system?.sheetOptions ?? {};
    const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value ?? "").trim()) ? String(value).trim() : fallback;
    const colorVision = ["default", "protanopia", "deuteranopia", "tritanopia"].includes(sheetOptions.colorVision)
      ? sheetOptions.colorVision
      : "default";
    const themeSources = [
      game.user?.character?.sheet?.element?.querySelector?.(".window-content"),
      game.user?.character?.sheet?.element,
      document.querySelector(".veilrunner.sheet.actor.hero .window-content"),
      document.querySelector(".veilrunner.sheet.actor.hero")
    ].filter(Boolean);
    const themeValue = property => {
      for (const source of themeSources) {
        const value = getComputedStyle(source).getPropertyValue(property).trim();
        if (value) return value;
      }
      return "";
    };
    const copiedTheme = Object.fromEntries(["--vr-vision-bg", "--vr-bg", "--vr-panel", "--vr-panel-alt", "--vr-border", "--vr-text", "--vr-text-dim"]
      .map(property => [property, themeValue(property)])
      .filter(([, value]) => value));
    const roots = [this.element, this.element?.closest(".application"), this.element?.querySelector(".window-content")].filter(Boolean);
    for (const root of roots) {
      root.classList.remove("color-vision-default", "color-vision-protanopia", "color-vision-deuteranopia", "color-vision-tritanopia");
      root.classList.add(`color-vision-${colorVision}`);
      root.style.setProperty("--vr-ui-color", color(sheetOptions.uiColor, "#101216"));
      root.style.setProperty("--vr-accent", color(sheetOptions.categoryHighlightColor, "#a855f7"));
      for (const [property, value] of Object.entries(copiedTheme)) root.style.setProperty(property, value);
    }
  }

  /** @override */
  _prepareSubmitData(event, form, formData) {
    const submitData = super._prepareSubmitData(event, form, formData);
    if (foundry.utils.hasProperty(submitData, "system.currencies")) {
      const rawCurrencies = foundry.utils.getProperty(submitData, "system.currencies");
      const currencies = Array.isArray(rawCurrencies) ? rawCurrencies : Object.values(rawCurrencies ?? {});
      const storedCurrencies = storedCurrencyRows(this.actor);
      const normalizedCurrencies = currencies
        .map((currency, index) => ({
          name: String(currency?.name ?? "").trim(),
          value: Math.max(0, Number(currency?.value ?? 0) || 0),
          // Tracking is changed only by its dedicated action. Keeping it out
          // of the editable form prevents an add/name/value submit from
          // replacing the state of every existing currency.
          tracked: Boolean(storedCurrencies[index]?.tracked),
          icon: validIconClass(currency?.icon)
        }))
        .filter(currency => currency.name || currency.value > 0);
      const baseIndex = normalizedCurrencies.findIndex(currency => currency.name === BASE_CURRENCY_NAME);
      if (baseIndex < 0) normalizedCurrencies.unshift({ name: BASE_CURRENCY_NAME, value: 0, tracked: true, icon: BASE_CURRENCY_ICON });
      else normalizedCurrencies[baseIndex] = { ...normalizedCurrencies[baseIndex], name: BASE_CURRENCY_NAME, icon: BASE_CURRENCY_ICON };
      foundry.utils.setProperty(submitData, "system.currencies", normalizedCurrencies);
    }
    return submitData;
  }

  static async #onAddPartyCurrency() {
    const icon = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("VEILRUNNER.CurrencyIcon") },
      modal: true,
      rejectClose: false,
      content: `<div class="vr-party-v2-icon-prompt">
        <label>${game.i18n.localize("VEILRUNNER.CurrencyIcon")}
          <input type="text" name="icon" value="fa-solid fa-coins" placeholder="fa-solid fa-coins" />
        </label>
      </div>`,
      ok: {
        label: game.i18n.localize("VEILRUNNER.AddCurrency"),
        callback: (event, button) => button.form.elements.icon.value
      }
    });
    if (icon === null || icon === undefined) return;
    const currencies = storedCurrencyRows(this.actor);
    currencies.push({ name: "", value: 0, tracked: true, icon: validIconClass(icon) });
    await this.actor.update({ "system.currencies": currencies });
  }

  static async #onRemovePartyCurrency(event, target) {
    const index = Number(target.dataset.index);
    const currencies = storedCurrencyRows(this.actor);
    if (!Number.isInteger(index) || index < 0 || index >= currencies.length || currencies[index]?.name === BASE_CURRENCY_NAME) return;
    currencies.splice(index, 1);
    await this.actor.update({ "system.currencies": currencies });
  }

  static async #onToggleCurrencyTracking(event, target) {
    const index = Number(target.dataset.index);
    const currencies = storedCurrencyRows(this.actor);
    if (!Number.isInteger(index) || index < 0 || index >= currencies.length) return;
    currencies[index] = { ...currencies[index], tracked: !Boolean(currencies[index]?.tracked) };
    await this.actor.update({ "system.currencies": currencies });
  }

  static async #onSetPartyImage() {
    if (!game.user.isGM) return;
    try {
      const FilePickerClass = getFilePickerClass();
      if (!FilePickerClass) throw new Error("FilePicker is not available.");
      const picker = new FilePickerClass({
        type: "image",
        current: this.actor.img,
        callback: path => this.actor.update({ img: path })
      });
      await renderFilePicker(picker);
    } catch (err) {
      console.error("Veilrunner | Failed to open party image picker", err);
      ui.notifications.error(game.i18n.localize("VEILRUNNER.ImagePickerFailed"));
    }
  }

  static #onSetPartyTab(event, target) {
    const tab = target.dataset.tab;
    if (!["currencies", "inventory", "journal"].includes(tab) || this.partyTab === tab) return;
    this.partyTabPrevious = this.partyTab;
    this.partyTab = tab;
    if (tab !== "journal") {
      this.partyJournalEntryId = null;
      this.partyJournalClosing = false;
    }
    this.render();
  }

  static #onOpenPartyJournalEntry(event, target) {
    this.partyJournalEntryId = target.closest("[data-journal-id]")?.dataset.journalId ?? null;
    this.partyJournalClosing = false;
    this.render();
  }

  static async #onClosePartyJournalEntry() {
    if (!this.partyJournalEntryId || this.partyJournalClosing) return;
    this.partyJournalClosing = true;
    await this.render();
    await new Promise(resolve => setTimeout(resolve, 240));
    this.partyJournalEntryId = null;
    this.partyJournalClosing = false;
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

  async #preparePartyJournalEntry() {
    const journal = this.partyJournalEntryId ? game.journal.get(this.partyJournalEntryId) : null;
    if (!journal) return null;
    const datapad = journalDatapadData(journal);
    const canView = game.user.isGM || journal.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
    if (!canView || datapad.category !== "party-journal" || datapad.partyId !== this.actor.id || (!game.user.isGM && datapad.hidden)) return null;

    const editor = foundry.applications?.ux?.TextEditor?.implementation ?? globalThis.TextEditor;
    const pages = await Promise.all(journal.pages.map(async page => ({
      name: page.name,
      type: page.type,
      content: page.type === "text" ? await editor.enrichHTML(page.text?.content ?? "", { relativeTo: page }) : ""
    })));
    return { id: journal.id, name: journal.name, pages };
  }
}
