import VeilrunnerHeroSheet from "./modules/sheets/hero-sheet.mjs";
import VeilrunnerActorSheet from "./modules/sheets/actor-sheet.mjs";
import VeilrunnerItemSheet from "./modules/sheets/item-sheet.mjs";
import { registerHandlebarsHelpers } from "./modules/helpers/handlebars.mjs";
import { registerConfig } from "./modules/config.mjs";
import { registerCharacterCreation } from "./modules/apps/character-creation.mjs";
import { registerPartyFolders } from "./modules/apps/party-folders.mjs";
import { registerDatapad } from "./modules/apps/datapad.mjs";
import { registerReferenceJournals } from "./modules/apps/reference-journals.mjs";
import { registerInitiativeBandDecider } from "./modules/apps/initiative-band-decider.mjs";
import { registerCombatCarousel } from "./modules/apps/combat-carousel.mjs";
import { registerSettings } from "./modules/settings.mjs";

Hooks.once("init", () => {
  registerConfig();
  registerSettings();
  registerHandlebarsHelpers();
  registerCharacterCreation();
  registerPartyFolders();
  registerDatapad();
  registerReferenceJournals();
  registerInitiativeBandDecider();
  registerCombatCarousel();

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
    types: ["action", "accessory", "ability", "armor", "profession", "treasure", "species", "origin", "background"],
    makeDefault: true,
    label: "VEILRUNNER.SheetLabel.item"
  });
});
