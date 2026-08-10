import HeroData from "./data/actor/hero.mjs";
import NpcData from "./data/actor/npc.mjs";
import CreatureData from "./data/actor/creature.mjs";
import SummonData from "./data/actor/summon.mjs";
import DroneData from "./data/actor/drone.mjs";
import VehicleData from "./data/actor/vehicle.mjs";
import PartyData from "./data/actor/party.mjs";
import LootData from "./data/actor/loot.mjs";
import HazardData from "./data/actor/hazard.mjs";
import ActionData from "./data/item/action.mjs";
import AccessoryData from "./data/item/accessory.mjs";
import AbilityData from "./data/item/ability.mjs";
import ArmorData from "./data/item/armor.mjs";
import ProfessionData from "./data/item/profession.mjs";
import TreasureData from "./data/item/treasure.mjs";
import SpeciesData from "./data/item/species.mjs";
import OriginData from "./data/item/origin.mjs";
import BackgroundData from "./data/item/background.mjs";
import { VeilrunnerActor } from "./documents/actor.mjs";
import { VeilrunnerItem } from "./documents/item.mjs";

/** Register CONFIG. */
export function registerConfig() {
  CONFIG.Actor.documentClass = VeilrunnerActor;
  CONFIG.Item.documentClass = VeilrunnerItem;
  CONFIG.Combat.initiative = {
    formula: "1d10 + @attributes.social.perception + @attributes.physical.reaction",
    decimals: 0
  };

  Object.assign(CONFIG.Actor.dataModels, {
    hero: HeroData,
    npc: NpcData,
    creature: CreatureData,
    summon: SummonData,
    drone: DroneData,
    vehicle: VehicleData,
    party: PartyData,
    loot: LootData,
    hazard: HazardData
  });

  Object.assign(CONFIG.Item.dataModels, {
    action: ActionData,
    accessory: AccessoryData,
    ability: AbilityData,
    armor: ArmorData,
    profession: ProfessionData,
    treasure: TreasureData,
    species: SpeciesData,
    origin: OriginData,
    background: BackgroundData
  });

  CONFIG.Actor.trackableAttributes = {
    hero: {
      bar: ["resources.health", "resources.mana", "resources.stamina", "resources.armor", "resources.shield", "resources.shields", "resources.barriers"],
      value: ["resources.tempHealth.value", "resources.inspiration.value", "level", "experience.value"]
    },
    npc: {
      bar: ["resources.health", "resources.mana", "resources.stamina", "resources.armor", "resources.shield", "resources.shields", "resources.barriers"],
      value: ["level"]
    },
    creature: {
      bar: ["resources.health", "resources.mana", "resources.stamina", "resources.armor", "resources.shield", "resources.shields", "resources.barriers"],
      value: []
    },
    summon: {
      bar: ["resources.health", "resources.mana", "resources.stamina", "resources.armor", "resources.shield", "resources.shields", "resources.barriers"],
      value: []
    },
    drone: {
      bar: ["resources.health", "resources.mana", "resources.stamina", "resources.armor", "resources.shield", "resources.shields", "resources.barriers"],
      value: []
    },
    vehicle: {
      bar: ["resources.health"],
      value: ["crew"]
    },
    party: { bar: [], value: [] },
    loot: { bar: [], value: [] },
    hazard: { bar: [], value: ["saveDC"] }
  };
}
