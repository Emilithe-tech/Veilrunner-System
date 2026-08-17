import VeilrunnerHeroSheet from "./modules/sheets/hero-sheet.mjs";
import VeilrunnerActorSheet from "./modules/sheets/actor-sheet.mjs";
import VeilrunnerItemSheet from "./modules/sheets/item-sheet.mjs";
import { registerHandlebarsHelpers } from "./modules/helpers/handlebars.mjs";
import { registerConfig } from "./modules/config.mjs";
import { registerCharacterCreation } from "./modules/apps/character-creation.mjs";
import { registerPartyFolders } from "./modules/apps/party-folders.mjs";
import { DATAPAD_TEMPLATE_PARTIALS, registerDatapad } from "./modules/apps/datapad.mjs";
import { registerReferenceJournals } from "./modules/apps/reference-journals.mjs";
import { registerInitiativeBandDecider } from "./modules/apps/initiative-band-decider.mjs";
import { registerCombatCarousel } from "./modules/apps/combat-carousel.mjs";
import { registerItemCreateDialogGroups } from "./modules/apps/item-create-dialog.mjs";
import { registerSettings } from "./modules/settings.mjs";

const PARTY_SHEET_PARTIALS = [
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
];

const HERO_SHEET_PARTIALS = [
  "systems/veilrunner/templates/actor/hero/parts/header.hbs",
  "systems/veilrunner/templates/actor/hero/parts/equipment.hbs",
  "systems/veilrunner/templates/actor/hero/parts/equip-slot.hbs",
  "systems/veilrunner/templates/actor/hero/parts/details.hbs",
  "systems/veilrunner/templates/actor/hero/parts/drawer-handles.hbs",
  "systems/veilrunner/templates/actor/hero/parts/top-nav.hbs"
];

const ITEM_SHEET_PARTIALS = [
  "systems/veilrunner/templates/item/parts/physical.hbs"
];

Hooks.once("init", async () => {
  await foundry.applications.handlebars.loadTemplates([...PARTY_SHEET_PARTIALS, ...HERO_SHEET_PARTIALS, ...ITEM_SHEET_PARTIALS, ...DATAPAD_TEMPLATE_PARTIALS]);

  registerConfig();
  registerSettings();
  registerHandlebarsHelpers();
  registerCharacterCreation();
  registerPartyFolders();
  registerDatapad();
  registerReferenceJournals();
  registerInitiativeBandDecider();
  registerCombatCarousel();
  registerItemCreateDialogGroups();

  const { DocumentSheetConfig } = foundry.applications.apps;
  const sid = game.system.id;

  DocumentSheetConfig.registerSheet(foundry.documents.Actor, sid, VeilrunnerHeroSheet, {
    types: ["hero"],
    makeDefault: true,
    label: "VEILRUNNER.SheetLabel.hero"
  });

  DocumentSheetConfig.registerSheet(foundry.documents.Actor, sid, VeilrunnerActorSheet, {
    types: ["npc", "creature", "summon", "drone", "vehicle", "party", "loot", "hazard"],
    makeDefault: true,
    label: "VEILRUNNER.SheetLabel.actor"
  });

  DocumentSheetConfig.registerSheet(foundry.documents.Item, sid, VeilrunnerItemSheet, {
    types: [
      "action", "accessory", "ability", "armor", "profession", "treasure", "species", "origin", "background",
      "weapon", "ammunition", "magazine", "shield", "consumable", "container", "equipment"
    ],
    makeDefault: true,
    label: "VEILRUNNER.SheetLabel.item"
  });
});
