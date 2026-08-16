const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

import { buildPartyOverview } from "../helpers/party.mjs";
import { journalDatapadData } from "../apps/datapad.mjs";
import { bringVeilrunnerApplicationToFront } from "../helpers/application-layer.mjs";

const BASE_CURRENCY_NAME = "Galactic Federation Credits";
const BASE_CURRENCY_ICON = "fa-solid fa-sim-card";
const PARTY_INVENTORY_CATEGORIES = ["all", "weapon", "ammo", "armor", "consumable", "tech", "keyItem", "junk", "other"];

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
      togglePartyEditMode: VeilrunnerActorSheet.#onTogglePartyEditMode,
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
      templates: [
        "systems/veilrunner/templates/actor/party/parts/party.hbs",
        "systems/veilrunner/templates/actor/party/parts/summary.hbs",
        "systems/veilrunner/templates/actor/party/parts/members.hbs",
        "systems/veilrunner/templates/actor/party/parts/party-image-button.hbs",
        "systems/veilrunner/templates/actor/party/parts/member-button.hbs",
        "systems/veilrunner/templates/actor/party/parts/panel.hbs",
        "systems/veilrunner/templates/actor/party/parts/tab-currencies.hbs",
        "systems/veilrunner/templates/actor/party/parts/tab-inventory.hbs",
        "systems/veilrunner/templates/actor/party/parts/tab-journal.hbs",
        "systems/veilrunner/templates/actor/party/parts/currencies.hbs",
        "systems/veilrunner/templates/actor/party/parts/currency-add-button.hbs",
        "systems/veilrunner/templates/actor/party/parts/currency-row.hbs",
        "systems/veilrunner/templates/actor/party/parts/currency-track-button.hbs",
        "systems/veilrunner/templates/actor/party/parts/currency-delete-button.hbs",
        "systems/veilrunner/templates/actor/party/parts/inventory.hbs",
        "systems/veilrunner/templates/actor/party/parts/inventory-row.hbs",
        "systems/veilrunner/templates/actor/party/parts/journal.hbs",
        "systems/veilrunner/templates/actor/party/parts/journal-row.hbs",
        "systems/veilrunner/templates/actor/party/parts/journal-overlay.hbs",
        "systems/veilrunner/templates/actor/party/parts/journal-close-button.hbs"
      ]
    }
  };

  partyTab = "currencies";
  partyTabPrevious = null;
  partyInventoryCategory = "all";
  partyJournalEntryId = null;
  partyJournalClosing = false;
  partyEditMode = false;
  #partyMemberContextMenu = null;
  #partyMemberContextDismiss = null;

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
      context.partyEditMode = context.isGM && this.partyEditMode;
      context.partyOverview = buildPartyOverview(this.actor);
      context.partyInventoryCategory = PARTY_INVENTORY_CATEGORIES.includes(this.partyInventoryCategory)
        ? this.partyInventoryCategory
        : "all";
      if (context.partyInventoryCategory !== "all") {
        context.partyOverview.inventory = context.partyOverview.inventory
          .filter(item => item.category === context.partyInventoryCategory);
      }
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

  /** Place the GM-only Party edit toggle in Foundry's native window header. */
  _getFrameButtons(options) {
    const buttons = super._getFrameButtons(options);
    if (this.actor.type === "party" && game.user.isGM) {
      buttons.unshift({
        action: "togglePartyEditMode",
        icon: `fa-solid ${this.partyEditMode ? "fa-toggle-on" : "fa-toggle-off"}`,
        label: "VEILRUNNER.EditMode"
      });
    }
    return buttons;
  }

  /** Apply the opening player's hero-sheet palette to Party sheets. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    if (this.element && !this.element.dataset.veilrunnerFrontBinding) {
      this.element.dataset.veilrunnerFrontBinding = "true";
      this.element.addEventListener("pointerdown", () => bringVeilrunnerApplicationToFront(this.element, this), { passive: true });
    }
    if (this.actor.type !== "party") return;

    this.#syncPartyEditToggle();

    const indicator = this.element?.querySelector(".vr-party-v2-tab-indicator");
    if (indicator && this.partyTabPrevious !== null && this.partyTabPrevious !== this.partyTab) {
      const target = ["currencies", "inventory", "journal"].indexOf(this.partyTab);
      requestAnimationFrame(() => indicator.style.setProperty("--party-tab-offset", target));
    }
    this.partyTabPrevious = null;

    const inventoryCategorySelect = this.element?.querySelector(".vr-party-v2-inventory-filter select");
    if (inventoryCategorySelect && !inventoryCategorySelect.dataset.veilrunnerBinding) {
      inventoryCategorySelect.dataset.veilrunnerBinding = "true";
      inventoryCategorySelect.addEventListener("change", event => {
        const category = event.currentTarget.value;
        if (!PARTY_INVENTORY_CATEGORIES.includes(category) || this.partyInventoryCategory === category) return;
        this.partyInventoryCategory = category;
        this.render();
      });
    }

    const inventorySearch = this.element?.querySelector(".vr-party-v2-inventory-search input");
    if (inventorySearch && !inventorySearch.dataset.veilrunnerBinding) {
      inventorySearch.dataset.veilrunnerBinding = "true";
      inventorySearch.addEventListener("input", event => {
        const query = event.currentTarget.value.trim().toLocaleLowerCase();
        const inventoryList = this.element?.querySelector(".vr-party-v2-scroll-list");
        if (!inventoryList) return;
        const rows = inventoryList.querySelectorAll(".vr-party-v2-inventory-row");
        let visible = 0;
        for (const row of rows) {
          const matches = !query || row.textContent.toLocaleLowerCase().includes(query);
          row.hidden = !matches;
          if (matches) visible += 1;
        }
        const emptyRow = inventoryList.querySelector(".empty-row");
        if (emptyRow) emptyRow.hidden = Boolean(rows.length) && visible > 0;
      });
    }

    if (this.partyEditMode && game.user.isGM && !this.element?.dataset.veilrunnerPartyContextBinding) {
      this.element.dataset.veilrunnerPartyContextBinding = "true";
      this.element.addEventListener("contextmenu", event => this.#onPartyMemberContextMenu(event));
    }

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

  /** Toggle the GM-only controls which may change Party Actor identity data. */
  static #onTogglePartyEditMode() {
    if (!game.user.isGM || this.actor.type !== "party") return;
    this.partyEditMode = !this.partyEditMode;
    if (!this.partyEditMode) this.#closePartyMemberContextMenu();
    this.render();
  }

  /** Keep the native header control's icon and pressed state in sync. */
  #syncPartyEditToggle() {
    const buttons = new Set();
    let root = this.element;
    while (root) {
      if (root.matches?.("[data-action='togglePartyEditMode']")) buttons.add(root);
      for (const button of root.querySelectorAll?.("[data-action='togglePartyEditMode']") ?? []) buttons.add(button);
      if (root.matches?.(".application, .app, .window-app")) break;
      root = root.parentElement;
    }
    for (const button of buttons) {
      const control = button.closest("li") ?? button;
      control.classList?.toggle("active", this.partyEditMode);
      button.classList?.toggle("active", this.partyEditMode);
      button.dataset.editMode = this.partyEditMode ? "on" : "off";
      button.setAttribute?.("aria-pressed", this.partyEditMode ? "true" : "false");
      button.classList.remove("fa-toggle-on", "fa-toggle-off");
      button.classList.add("fa-solid", this.partyEditMode ? "fa-toggle-on" : "fa-toggle-off");
    }
  }

  /** GM-only context menu for moving a Hero between Party Actor folders. */
  #onPartyMemberContextMenu(event) {
    if (!this.partyEditMode || !game.user.isGM) return;
    const memberButton = event.target.closest?.(".vr-party-v2-member[data-actor-id]");
    const member = game.actors.get(memberButton?.dataset.actorId);
    if (!member || member.type !== "hero") return;

    event.preventDefault();
    event.stopPropagation();
    this.#openPartyMemberContextMenu(event, member);
  }

  #openPartyMemberContextMenu(event, member) {
    this.#closePartyMemberContextMenu();
    const destinations = game.actors
      .filter(actor => actor.type === "party")
      .map(party => ({ party, folderId: party.folder?.id ?? party.folder ?? "" }))
      .filter(({ folderId }) => Boolean(folderId));
    if (!destinations.length) return;

    const menu = document.createElement("menu");
    menu.className = "vr-party-member-context-menu";
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    const submenu = document.createElement("div");
    submenu.className = "vr-party-member-context-submenu";
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.innerHTML = `<span>Send To</span><i class="fa-solid fa-chevron-right" aria-hidden="true"></i>`;
    const options = document.createElement("div");
    for (const { party, folderId } of destinations) {
      const option = document.createElement("button");
      option.type = "button";
      option.disabled = (member.folder?.id ?? member.folder) === folderId;
      option.textContent = party.name;
      option.addEventListener("click", async () => {
        if (!game.user.isGM || option.disabled) return;
        try {
          await member.update({ folder: folderId });
          this.#closePartyMemberContextMenu();
          await this.render();
        } catch (error) {
          console.error("Veilrunner | Failed to move Party member", error);
          ui.notifications.error(`Could not move ${member.name} to ${party.name}.`);
        }
      });
      options.append(option);
    }
    submenu.append(trigger, options);
    menu.append(submenu);
    menu.addEventListener("contextmenu", innerEvent => innerEvent.preventDefault());
    document.body.append(menu);
    this.#partyMemberContextMenu = menu;
    this.#partyMemberContextDismiss = dismissEvent => {
      if (!menu.contains(dismissEvent.target)) this.#closePartyMemberContextMenu();
    };
    document.addEventListener("pointerdown", this.#partyMemberContextDismiss, true);
  }

  #closePartyMemberContextMenu() {
    this.#partyMemberContextMenu?.remove();
    this.#partyMemberContextMenu = null;
    if (this.#partyMemberContextDismiss) document.removeEventListener("pointerdown", this.#partyMemberContextDismiss, true);
    this.#partyMemberContextDismiss = null;
  }

  async _onClose(options) {
    this.#closePartyMemberContextMenu();
    return super._onClose(options);
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
