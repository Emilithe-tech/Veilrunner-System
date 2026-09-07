export const SPELL_MODIFIERS = Object.freeze([
  Object.freeze({ id: "twinned", label: "Twinned Spell", manaMultiplier: 3, maxStacks: null, stackable: true, description: "The spell effect is doubled and may affect one additional target per stack." }),
  Object.freeze({ id: "long-distance", label: "Long Distance", manaMultiplier: 1, maxStacks: null, stackable: true, description: "Increase the spell distance by 10 m per stack." }),
  Object.freeze({ id: "increased-potency", label: "Increased Potency", manaMultiplier: 3, manaOperation: "multiply", maxStacks: null, stackable: true, description: "Double the spell potency per stack." }),
  Object.freeze({ id: "focused", label: "Focused Spell", manaMultiplier: 2, manaOperation: "multiply", maxStacks: 1, description: "Raise the minimum damage halfway toward its maximum." }),
  Object.freeze({ id: "extended", label: "Extended Spell", manaMultiplier: 2, maxStacks: null, stackable: true, description: "A summoning spell remains for 2 additional turns per stack." }),
  Object.freeze({ id: "quickened", label: "Quickened Spell", manaMultiplier: 2, maxStacks: null, stackable: true, description: "Reduce the Action cost by 1 for each stack." }),
  Object.freeze({ id: "subtle", label: "Subtle Spell", manaMultiplier: 2, maxStacks: 1, description: "Cast the spell while silenced." }),
  Object.freeze({ id: "delayed", label: "Delayed Spell", manaOperation: "discount", manaReduction: 0.25, maxStacks: null, stackable: true, description: "Reduce the Mana cost by 25% iteratively for each additional turn before the spell activates." }),
  Object.freeze({ id: "conservative", label: "Conservative Spell", manaOperation: "discount", manaReduction: 0.25, maxStacks: null, stackable: true, description: "Add 1 Action and reduce the Mana cost by 25% iteratively per stack." })
]);
