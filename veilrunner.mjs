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
import { xpForLevel } from "./modules/data/xp.mjs";
import { registerSettings } from "./modules/settings.mjs";

Hooks.once("init", () => {
  console.log("Veilrunner | Initializing Veilrunner First Edition (Foundry V14 AppV2)");

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

Hooks.once("ready", () => {
  game.socket?.on(`system.${game.system.id}`, async data => {
    if (!game.user.isGM || data?.type !== "veilrunnerLevelUp") return;

    const actor = game.actors.get(data.actorId);
    const requester = game.users.get(data.userId);
    if (!actor || actor.type !== "hero" || !requester || !actor.testUserPermission(requester, "OWNER")) return;

    const level = Number(actor.system?.level ?? 0);
    const xp = Number(foundry.utils.getProperty(actor._source, "system.experience.value") ?? actor.system?.experience?.value ?? 0);
    const threshold = xpForLevel(level);
    if (threshold <= 0 || xp < threshold) return;

    await actor.update({
      "system.level": level + 1,
      "system.experience.value": xp - threshold,
      "system.experience.max": xpForLevel(level + 1)
    });
  });
});
