import { getInitiativeBandReferenceBands } from "../apps/initiative-band-decider.mjs";

export function getVeilrunnerRuleReferences() {
  return VEILRUNNER_RULE_REFERENCES.map(rule => rule.key === "initiativeBands"
    ? { ...rule, bands: getInitiativeBandReferenceBands() }
    : rule);
}

const VEILRUNNER_RULE_REFERENCES = [
  {
    key: "initiativeBands",
    title: "Initiative Bands",
    summary: "Combat uses initiative bands instead of a strict individual turn order. Roll 1d10 + Perception + Reaction + modifiers, then group combatants into speed bands.",
    bands: [
      { name: "Fast", range: "20+" },
      { name: "Normal", range: "10-19" },
      { name: "Slow", range: "<10" }
    ],
    rules: [
      "Bands are sorted from highest to lowest initiative range.",
      "Within a band, the side with the highest initiative roll acts first. If a player character has the highest roll, PCs act before NPCs in that band; if an NPC has the highest roll, NPCs act before PCs.",
      "Neutral or friendly NPCs default to being sorted with PCs and can be assigned to a neutral or PC turn at the GM's discretion.",
      "A combat round is 6 seconds. Actors in a band act at near-simultaneous speed.",
      "Actors without initiative are set to 1. Neutral NPCs entering combat roll initiative on their turn and join the appropriate band at the start of the next round.",
      "Band ranges are flexible. The GM may adjust thresholds or the number of bands for the encounter."
    ],
    callouts: [
      {
        title: "Determining Who Acts First in a Turn",
        text: "When two or more actors in the same band are attempting to act against the same target, the actor with the higher initiative score can act first if they decide to do so. Resolve that actor's actions first, then the lower-initiative actor takes their actions."
      }
    ]
  }
];
