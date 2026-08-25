import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ChargenBuildStore } from "../modules/apps/chargen/build-store.mjs";
import { validateChargenBuild } from "../modules/apps/chargen/validation.mjs";
import { creditsForLevel } from "../modules/data/progression.mjs";

const setProperty = (target, path, value) => {
  const keys = path.split(".");
  const final = keys.pop();
  const destination = keys.reduce((entry, key) => entry[key] ??= {}, target);
  destination[final] = value;
};

const store = new ChargenBuildStore({ attributes: { physical: { strength: 1 } } }, { setProperty, deepClone: structuredClone });
let change = "";
store.subscribe((_state, reason) => { change = reason; });
assert.equal(store.set("attributes.physical.strength", 4), true);
assert.equal(store.state.attributes.physical.strength, 4);
assert.equal(change, "attributes.physical.strength");
assert.equal(store.set("attributes.__proto__.unsafe", true), false, "unsafe draft paths are rejected");

const invalid = validateChargenBuild({ startingLevel: 0, species: "", origin: "", background: "", archetype: "", profession: "", discipline: "" }, { attributeSpent: 11, attributeBudget: 10 });
assert.equal(invalid.valid, false);
assert.ok(invalid.section.has("level"));
assert.ok(invalid.section.has("profession"));
assert.ok(invalid.section.has("attributes"));
assert.ok(invalid.messages.includes("Choose a home planet."));

const valid = validateChargenBuild({ startingLevel: 1, species: "Human", origin: "Terra", background: "Scholar", archetype: "Magic", profession: "Magus", discipline: "Wizard" }, { attributeSpent: 10, attributeBudget: 10 });
assert.equal(valid.valid, true);

assert.equal(creditsForLevel(1), 1000, "Level 1 starts with 1,000c");
assert.equal(creditsForLevel(2), 1100, "each additional level adds 100c");
assert.equal(creditsForLevel(11), 2000, "starting credits scale from the selected chargen level");
assert.equal(creditsForLevel(0), 1000, "invalid levels normalize to Level 1");

const chargenSource = readFileSync(new URL("../modules/apps/character-creation.mjs", import.meta.url), "utf8");
assert.match(chargenSource, /\{ label: "Origin", keys: \["species", "origin", "background"\] \}/, "phase 02 is labeled Origin");
assert.match(chargenSource, /\{ key: "origin", label: "Home Planet"/, "the origin data field is presented as Home Planet");
assert.match(chargenSource, /\{ label: "Details", keys: \["contacts", "credits", "identity"\] \}/, "Galactic Market appears before the combined Identity subsection");
assert.match(chargenSource, /\{ key: "credits", label: "Galactic Market"/, "the Purchases subsection is labeled Galactic Market");
assert.match(chargenSource, /#identityStep\(\)[\s\S]*?#bioStep\(\)[\s\S]*?Known Languages[\s\S]*?#personaStep\(\)/, "the Identity subsection renders biography, language, and Persona controls together");
assert.match(chargenSource, /#personaValueFromPointer\(track, clientX\)[\s\S]*?Math\.round\(\(ratio \* 200\) - 100\)/, "Persona pointer input allows one-point increments");
assert.match(chargenSource, /const adjustments = \{ ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 \}/, "Persona keyboard input allows one-point increments");
assert.match(chargenSource, /const leftPips = Math\.floor\(Math\.max\(0, -value\) \/ 10\);[\s\S]*?const rightPips = Math\.floor\(Math\.max\(0, value\) \/ 10\);/, "Persona pip highlighting remains on ten-point thresholds");

console.log("chargen draft store and validation checks passed");
