import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ChargenBuildStore } from "../modules/apps/chargen/build-store.mjs";
import { validateChargenBuild } from "../modules/apps/chargen/validation.mjs";
import { renderReviewPage, renderReviewStatus } from "../modules/apps/chargen/review-view.mjs";
import { creditsForLevel } from "../modules/data/progression.mjs";
import { normalizeLanguageRecord, queryLanguageCatalog } from "../modules/apps/chargen/language-catalog.mjs";
import { renderBiographyPane, renderContactPane, renderIdentityDetails, renderIdentityOverview, renderLanguagePane } from "../modules/apps/chargen/identity-view.mjs";
import { migrateSpeciesSizes } from "../modules/data/item/species-size-migration.mjs";

globalThis.foundry ??= { utils: { escapeHTML: value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;") } };
globalThis.game ??= { i18n: { localize: key => key } };

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

const reviewState = {
  startingLevel: 10, species: "Human", origin: "Terra", background: "Scholar",
  archetype: "Magic", profession: "Cleric", discipline: "Priest",
  freeLanguage: { definitionId: "", sourceUuid: "", name: "" }
};
const missingLanguageReview = validateChargenBuild(reviewState, {
  attributeSpent: 100, attributeBudget: 126,
  review: { freeLanguageRequired: true, qualityFlawValid: true, pendingCartCount: 0, purchasesValid: true, biographyText: "", contactCount: 0, attributePointsRemaining: 26, talentPointsRemaining: 2, skillPointsRemaining: 1, creditsRemaining: 1900 }
});
assert.equal(missingLanguageReview.valid, true, "Languages and Contacts can be selected after creation");
assert.equal(missingLanguageReview.readiness.state, "unspent");
assert.equal(missingLanguageReview.blockingIssues.length, 0);
assert.ok(missingLanguageReview.incompleteSections.some(section => section.pane === "languages"), "an optional empty Language selection remains visible");
assert.ok(missingLanguageReview.incompleteSections.some(section => section.pane === "contacts"), "optional empty Contacts remain visible");
assert.ok(missingLanguageReview.incompleteSections.some(section => section.pane === "biography"), "optional empty Biography remains visible");
assert.equal(missingLanguageReview.unspentResources.length, 4, "banked points and Credits remain informational");

const bankedReview = validateChargenBuild({ ...reviewState, freeLanguage: { definitionId: "veilrunner.language.trade", name: "Trade" } }, {
  attributeSpent: 100, attributeBudget: 126,
  review: { freeLanguageRequired: true, qualityFlawValid: true, pendingCartCount: 0, purchasesValid: true, biographyText: "", contactCount: 0, attributePointsRemaining: 26, talentPointsRemaining: 2, skillPointsRemaining: 1, creditsRemaining: 1900 }
});
assert.equal(bankedReview.valid, true, "banked resources and optional incomplete sections do not block creation");
assert.equal(bankedReview.readiness.state, "unspent");
assert.equal(bankedReview.blockingIssues.length, 0);
const reviewMarkup = renderReviewPage({
  validation: bankedReview, actionLabel: "CREATE CHARACTER",
  identity: { name: "Hero", level: 10, species: "Human", origin: "Terra", background: "Scholar", archetype: "Magic", profession: "Cleric", discipline: "Priest", portrait: "icons/svg/mystery-man.svg", portraitCrop: {} },
  persona: { axes: [{ key: "criminalLawful", left: "Criminal", right: "Lawful" }, { key: "ruthlessEmpathy", left: "Ruthless", right: "Empathy" }, { key: "individualCollectivist", left: "Individual", right: "Collectivist" }], values: { criminalLawful: 9, ruthlessEmpathy: -10, individualCollectivist: 0 } },
  attributes: { remaining: 26, groups: [{ label: "Physical", entries: [{ abbreviation: "STR", value: 5 }] }] },
  talentsSkills: { talents: [{ name: "Divine", detail: "Talent" }], skills: [{ name: "Healing", detail: "Rank 2" }], talentRemaining: 2, skillRemaining: 1 },
  qualities: { perks: [{ name: "Keen Insight" }], flaws: [{ name: "Overconfident" }], valid: true },
  languagesContacts: { languages: ["Trade"], contacts: [], freeLanguageMissing: false },
  purchases: { remainingCredits: 1900, entries: [{ name: "Medkit", quantity: 1, total: 100 }] },
  biography: { text: "" }
});
assert.match(reviewMarkup, /Review Character Build[\s\S]*?Character Dossier[\s\S]*?Persona Index/);
assert.match(reviewMarkup, /Attributes[\s\S]*?Talents &amp; Skills[\s\S]*?Perks &amp; Flaws[\s\S]*?Languages &amp; Contacts[\s\S]*?Starting Loadout \/ Purchases[\s\S]*?About Your Character/);
assert.match(reviewMarkup, /26 points banked[\s\S]*?2 Talent Points banked[\s\S]*?1 Skill Point banked[\s\S]*?1,900¢ Credits Remaining/);
assert.match(reviewMarkup, /data-action="confirm"[^>]*><i[^>]*><\/i><span>CREATE CHARACTER<\/span>/, "the final action keeps the existing confirm commit path");
assert.doesNotMatch(reviewMarkup, /data-action="confirm" disabled/, "banked resources do not disable Create Character");
const optionalSocialMarkup = renderReviewPage({ ...{
  validation: missingLanguageReview, actionLabel: "CREATE CHARACTER",
  identity: { name: "Hero", level: 10, species: "Human", origin: "Terra", background: "Scholar", archetype: "Magic", profession: "Cleric", discipline: "Priest", portrait: "icons/svg/mystery-man.svg", portraitCrop: {} },
  persona: { axes: [], values: {} }, attributes: { remaining: 26, groups: [] }, talentsSkills: { talents: [], skills: [], talentRemaining: 2, skillRemaining: 1 }, qualities: { perks: [], flaws: [], valid: true }, languagesContacts: { languages: [], contacts: [], freeLanguageMissing: true }, purchases: { remainingCredits: 1900, entries: [] }, biography: { text: "" }
} });
assert.match(optionalSocialMarkup, /Optional[\s\S]*?No language selected\. You can add one later\.[\s\S]*?No contacts added\. You can add them later\./);
assert.doesNotMatch(optionalSocialMarkup, /data-action="confirm" disabled/, "empty Languages and Contacts do not disable Create Character");
assert.doesNotMatch(optionalSocialMarkup, /Free Language Required|Choose 1 Free Language/);
assert.match(renderReviewStatus(missingLanguageReview), /Quick Jump[\s\S]*?Incomplete Sections[\s\S]*?Languages[\s\S]*?Contacts[\s\S]*?Unspent Resources[\s\S]*?Completed Checks/);

const levelUpReview = validateChargenBuild(reviewState, {
  mode: "levelUp", attributeSpent: 100, attributeBudget: 126,
  review: { freeLanguageRequired: true, qualityFlawValid: true, pendingCartCount: 2, purchasesValid: false, biographyText: "", contactCount: 0, attributePointsRemaining: 26, talentPointsRemaining: 2, skillPointsRemaining: 1, creditsRemaining: 1900 }
});
assert.equal(levelUpReview.valid, true, "creation-only Language and storefront checks do not block restricted level-up");
assert.deepEqual(levelUpReview.allowedTargets, ["attributes", "talents", "qualitiesFlaws"]);
assert.equal(levelUpReview.unspentResources.length, 3, "level-up Review omits the unrelated Credits pool");
const levelUpStatus = renderReviewStatus(levelUpReview);
assert.match(levelUpStatus, /Attributes[\s\S]*?Talents &amp; Skills[\s\S]*?Perks &amp; Flaws/);
assert.doesNotMatch(levelUpStatus, /data-review-target="identity"|data-review-target="credits"/, "level-up Quick Jump preserves its restricted step boundary");

assert.equal(creditsForLevel(1), 1000, "Level 1 starts with 1,000c");
assert.equal(creditsForLevel(2), 1100, "each additional level adds 100c");
assert.equal(creditsForLevel(11), 2000, "starting credits scale from the selected chargen level");
assert.equal(creditsForLevel(0), 1000, "invalid levels normalize to Level 1");

const chargenSource = readFileSync(new URL("../modules/apps/character-creation.mjs", import.meta.url), "utf8");
const storefrontAddHandler = chargenSource.match(/if \(button\.dataset\.storefrontAdd\) \{([\s\S]*?)\n    \}/)?.[1] ?? "";
assert.match(storefrontAddHandler, /addToCart/, "Add places the selected catalog item in the cart");
assert.doesNotMatch(storefrontAddHandler, /selectedDefinitionId|rightPane/, "Add does not change the inspected item or open the Details page");
const visibleInputSaver = chargenSource.match(/#saveVisibleInputs\(\) \{([\s\S]*?)\n  \}\n\n  #setStateValue/)?.[1] ?? "";
assert.match(visibleInputSaver, /input\.name\.startsWith\("storefront\.query\."\)[\s\S]*?#setStateValue\(input\.name, input\.value\)/, "blank storefront number bounds remain blank instead of becoming zero");
const identitySource = readFileSync(new URL("../modules/apps/chargen/identity-view.mjs", import.meta.url), "utf8");
const heroSource = readFileSync(new URL("../modules/data/actor/hero.mjs", import.meta.url), "utf8");
const speciesSource = readFileSync(new URL("../modules/data/item/species.mjs", import.meta.url), "utf8");
const cssSource = readFileSync(new URL("../css/veilrunner.css", import.meta.url), "utf8");
assert.match(chargenSource, /\{ label: "Origin", keys: \["species", "origin", "background"\] \}/, "phase 02 is labeled Origin");
assert.match(chargenSource, /\{ key: "origin", label: "Home Planet"/, "the origin data field is presented as Home Planet");
assert.match(chargenSource, /\{ label: "Details", keys: \["credits", "identity"\] \}/, "Contacts management lives inside the combined Identity subsection");
assert.match(chargenSource, /\{ key: "credits", label: "Galactic Market"/, "the Purchases subsection is labeled Galactic Market");
assert.match(chargenSource, /#identityStep\(\)[\s\S]*?renderBiographyPane[\s\S]*?renderLanguagePane[\s\S]*?renderContactPane[\s\S]*?renderIdentityOverview/, "Identity owns overview, biography, language, and contact panes");
assert.doesNotMatch(chargenSource, /#field\("size", "Size"\)/, "Identity never renders an editable Size field");
assert.match(chargenSource, /"system\.size": this\.#speciesSize\(\)/, "Hero Size is derived from the selected Species");
assert.match(chargenSource, /if \(species\) return String\(species\.size \?\? ""\)\.trim\(\) \|\| "Medium";[\s\S]*?return String\(this\.state\.size/, "a resolved Species uses its authored/default Medium size while an unresolved legacy Species preserves the Actor size");
assert.match(chargenSource, /"system\.biographySections": foundry\.utils\.deepClone/, "all Biography tabs persist through the confirm-only commit");
assert.doesNotMatch(chargenSource, /function biographyHtml/, "chargen no longer rebuilds Biography from unrelated fields");
for (const field of ["appearance", "personalityCues", "values", "mannerisms", "firstImpression", "importantEvent", "currentMotivation", "unresolvedConnection"]) {
  assert.match(heroSource, new RegExp(`${field}: new StringField`), `${field} has a compatible empty Hero schema field`);
}
assert.match(speciesSource, /size: new StringField\(\{ required: true, blank: false, initial: "Medium" \}\)/, "Species definitions default to Medium until canonical sizes are authored");
assert.match(identitySource, /What does the city see when it looks at you\?/, "Appearance uses the guided question-first voice");
assert.match(identitySource, /Who do people meet before they really know you\?/, "Personality Cues use the guided question-first voice");
assert.match(identitySource, /Why are you still running\?/, "Current Motivation uses the guided question-first voice");
assert.match(identitySource, /BIOGRAPHY_SECTIONS[\s\S]*?overview[\s\S]*?earlyLife[\s\S]*?career[\s\S]*?relationships[\s\S]*?notes/, "Biography exposes the five requested sections");
assert.match(identitySource, /<textarea name="biographySections\.\$\{escape\(section\.key\)\}"/, "Biography uses directly editable draft-backed textareas");
assert.match(identitySource, /No language records have been authored/, "the empty Languages compendium has a clear management state");
assert.match(identitySource, /contactSearch[\s\S]*?contactRoleFilter/, "Contacts management is filter and search ready");
assert.match(chargenSource, /#personaValueFromPointer\(track, clientX\)[\s\S]*?Math\.round\(\(ratio \* 200\) - 100\)/, "Persona pointer input allows one-point increments");
assert.match(chargenSource, /const adjustments = \{ ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 \}/, "Persona keyboard input allows one-point increments");
assert.match(chargenSource, /const leftPips = Math\.floor\(Math\.max\(0, -value\) \/ 10\);[\s\S]*?const rightPips = Math\.floor\(Math\.max\(0, value\) \/ 10\);/, "Persona pip highlighting remains on ten-point thresholds");

const language = normalizeLanguageRecord({
  _id: "language-test", uuid: "Compendium.Veilrunner.languages.language-test", type: "language", name: "Test Language",
  system: { definitionId: "veilrunner.language.test", description: "<p>Fixture only.</p>" }
});
assert.equal(language.name, "Test Language");
assert.equal(language.description, "Fixture only.");
assert.deepEqual(queryLanguageCatalog([language], "fixture").map(entry => entry.definitionId), ["veilrunner.language.test"]);
assert.equal(normalizeLanguageRecord({ type: "weapon", name: "Not a Language", system: { definitionId: "veilrunner.weapon.no" } }), null);

const packLocks = [];
const speciesPack = {
  locked: true,
  collection: "Veilrunner.species",
  async getDocuments() {
    return [
      { id: "missing-size", type: "species", _source: { system: {} } },
      { id: "authored-size", type: "species", _source: { system: { size: "Large" } } }
    ];
  },
  async configure({ locked }) { this.locked = locked; packLocks.push(locked); }
};
globalThis.game.user = { isGM: true };
globalThis.game.packs = new Map([["Veilrunner.species", speciesPack]]);
let speciesUpdates = [];
globalThis.Item = { async updateDocuments(updates, options) { speciesUpdates = [updates, options]; } };
assert.deepEqual(await migrateSpeciesSizes(), { migrated: 1, missingPack: false });
assert.deepEqual(speciesUpdates, [[{ _id: "missing-size", "system.size": "Medium" }], { pack: "Veilrunner.species" }], "Species migration updates only missing sizes and targets the source pack");
assert.deepEqual(packLocks, [false, true], "Species migration restores the pack's original lock state");

const identityModel = {
  name: "Runner", portraitImage: "icons/svg/mystery-man.svg", species: "Human", origin: "Terra", background: "Smuggler",
  pronouns: "theyThem", age: "29", size: "Medium", appearance: "Neon coat", personalityCues: "Guarded", values: "Loyalty",
  mannerisms: "Counts exits", firstImpression: "Sharp eyes", importantEvent: "The failed run", currentMotivation: "Find the truth",
  unresolvedConnection: "An old debt", biography: "<p>A long road.</p>", biographySections: { overview: "A long road.", earlyLife: "", career: "A hard career.", relationships: "", notes: "" }, biographyTab: "overview", biographySummaryTab: "overview", personaBaselineEstablished: false, personaHtml: "<div>Persona fixture</div>", knownLanguages: [],
  freeLanguage: { definitionId: "", sourceUuid: "", name: "" }, contacts: [], identityEditingField: "", identityProfileEditing: false
};
const restingIdentity = renderIdentityOverview(identityModel);
assert.match(restingIdentity, /Character Profile[\s\S]*?Appearance[\s\S]*?About Your Character[\s\S]*?History &amp; Motivation[\s\S]*?Persona Index/);
assert.match(restingIdentity, /vr-cc-dossier-heading[\s\S]*?<h1>Dossier<\/h1>[\s\S]*?vr-cc-character-profile/, "Dossier labels the full Identity overview outside the Character Profile card");
assert.match(restingIdentity, /vr-cc-character-profile[\s\S]*?Character Profile[\s\S]*?vr-cc-profile-grid[\s\S]*?data-identity-focus="appearance"[\s\S]*?vr-cc-language-summary[\s\S]*?Languages[\s\S]*?<\/article>/, "Languages occupies the lower-right portion of Character Profile beneath Appearance");
assert.match(restingIdentity, /<\/article>\s*<article class="vr-cc-identity-card vr-cc-contact-summary"[\s\S]*?Relationships &amp; Contacts[\s\S]*?<\/article>\s*<article class="vr-cc-identity-card vr-cc-about-character vr-cc-about-history"/, "Contacts is its own section directly after Character Profile");
assert.match(restingIdentity, /vr-cc-about-history[\s\S]*?About Your Character[\s\S]*?vr-cc-history-motivation[\s\S]*?History &amp; Motivation[\s\S]*?<\/article>/, "About Your Character and History & Motivation render inside one card");
assert.doesNotMatch(restingIdentity, /vr-cc-about-history[\s\S]*?vr-cc-identity-secondary-summaries/, "the About and History card no longer owns Languages or Contacts");
assert.doesNotMatch(restingIdentity, /vr-cc-identity-card vr-cc-history-motivation/, "History & Motivation is not a separate outer card");
assert.match(restingIdentity, /vr-cc-identity-card-heading[\s\S]*?Persona Index[\s\S]*?vr-cc-persona-baseline[\s\S]*?Persona baseline not established yet\.[\s\S]*?Persona fixture/, "an unestablished Persona baseline appears right-aligned in the Persona Index header");
assert.match(restingIdentity, /vr-cc-identity-card-heading[\s\S]*?Character Profile[\s\S]*?data-action="edit-identity-profile"/, "Edit Profile remains attached to the Character Profile header area");
assert.doesNotMatch(restingIdentity, /<textarea name="personalityCues"/, "filled narrative fields rest as character information rather than permanent textareas");
assert.doesNotMatch(restingIdentity, /<input name="name"/, "the resting Character Profile is a dossier rather than a form");
assert.match(restingIdentity, /Continue Biography/, "a populated Biography renders a compact continuation preview");
const longBiography = renderIdentityOverview({ ...identityModel, biographySections: { overview: `Opening ${"long biography text ".repeat(80)}VISIBLE END`, earlyLife: "", career: "", relationships: "", notes: "" } });
assert.match(longBiography, /VISIBLE END/, "Biography preserves all text until the container overflow behavior takes over");
const emptyIdentity = renderIdentityOverview({ ...identityModel, personalityCues: "", biography: "", biographySections: { overview: "", earlyLife: "", career: "", relationships: "", notes: "" } });
assert.match(emptyIdentity, /Add response/);
assert.match(emptyIdentity, /Start Biography/);
assert.match(emptyIdentity, /Your story hasn&#39;t been written yet|Your story hasn&#x27;t been written yet|Your story hasn't been written yet/, "Biography uses an inviting empty state instead of a zero-word status");
assert.doesNotMatch(emptyIdentity, />0 words</, "an empty Biography does not advertise a zero-word count");
assert.match(emptyIdentity, /No bonus languages selected yet/, "Languages explains the free pick in its empty state");
assert.match(emptyIdentity, /No contacts added yet[\s\S]*?friends, rivals, mentors/, "Contacts explains what belongs in the character network");
assert.doesNotMatch(emptyIdentity, /<textarea name="personalityCues"/, "empty guidance does not allocate textarea height until selected");
assert.match(renderIdentityOverview({ ...identityModel, identityEditingField: "personalityCues" }), /<textarea name="personalityCues"[\s\S]*?data-identity-editor/);
assert.match(renderIdentityOverview({ ...identityModel, identityProfileEditing: true }), /<input name="name"[\s\S]*?data-identity-editor/);
const biographyPane = renderBiographyPane(identityModel);
for (const label of ["Overview", "Early Life", "Career", "Relationships", "Notes"]) assert.match(biographyPane, new RegExp(`>${label}<`));
assert.match(biographyPane, /textarea name="biographySections\.overview"[\s\S]*?A long road\./);
assert.match(restingIdentity, /vr-cc-biography-tabs compact[\s\S]*?Overview[\s\S]*?Career/, "populated Biography sections appear as tabs on the Identity overview");
assert.match(renderLanguagePane({ ...identityModel, languageSearch: "", languages: [] }), /No language records have been authored/);
assert.match(renderContactPane({ contacts: [], contactFocus: 0, contactSearch: "", contactRoleFilter: "all", contactRoles: [], filteredContacts: [] }), /Add Contact/);
assert.match(renderIdentityDetails("overview"), /Persona Index[\s\S]*?Relationships &amp; Contacts/);
assert.match(renderIdentityDetails("overview", "personalityCues"), /Personality Cues[\s\S]*?outward temperament/);
assert.match(renderIdentityDetails("overview", "persona"), /Persona Index[\s\S]*?establish these values automatically/);
assert.match(renderIdentityDetails("overview", "importantEvent"), /Why this matters[\s\S]*?callbacks, NPC connections, consequences, or story hooks/);
assert.match(renderIdentityDetails("overview", "languages"), /optional[\s\S]*?selected later/);
assert.match(chargenSource, /data-identity-focus[\s\S]*?#refreshInfoPanel/, "Identity focus updates the contextual Details drawer");
assert.match(chargenSource, /addEventListener\("pointerover"[\s\S]*?identityFocus = focus;[\s\S]*?#refreshInfoPanel/, "hovered Identity sections update the contextual Details drawer");
assert.match(chargenSource, /Current influences[\s\S]*?vr-cc-persona-axis-influences/, "Persona displays automatic authored influences with their affected axes");
assert.match(identitySource, /vr-cc-persona-baseline[\s\S]*?Persona baseline not established yet/, "Persona preserves its useful empty baseline state in the section header");
assert.doesNotMatch(chargenSource, /vr-cc-persona-recommendation[\s\S]*?Persona baseline not established yet/, "Persona no longer renders the baseline as a full-width content banner");
assert.doesNotMatch(chargenSource, /data-action="apply-persona-recommendation"/, "Persona no longer requires a manual apply action");
assert.match(chargenSource, /!\/\^\(\?:undefined\|null\)\$\/i\.test\(value\)/, "Persona modifier normalization removes missing-value artifacts");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-persona-centerpiece \{ grid-column: 6 \/ -1; grid-row: 2; \}/, "Persona Index occupies the upper-right Dossier column");
assert.match(cssSource, /\.vr-cc-persona-baseline \{[^}]*max-width: min\(66%,58rem\);[^}]*text-align: right;/, "the Persona baseline is constrained and right-aligned in the header");
assert.match(cssSource, /@media \(min-width: 2200px\)[\s\S]*?grid-template-columns: repeat\(12/, "Identity expands into an ultrawide twelve-column composition");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-identity-overview \{[^}]*max-width: none;/, "Identity is not capped to a desktop-sized centered column");
assert.match(cssSource, /\.vr-cc-character-profile \{ grid-column: 1 \/ span 5; grid-row: 2; \}[\s\S]*?\.vr-cc-about-character \{ grid-column: 6 \/ -1; grid-row: 3 \/ span 2; \}/, "Character Profile stays upper-left while About and History spans the lower-right column");
assert.match(cssSource, /\.vr-cc-character-profile \{ position: relative; display: grid; grid-template-columns: repeat\(2[^}]*grid-template-rows: auto auto minmax\(0,1fr\);[^}]*align-content: stretch;/, "Character Profile reserves a lower-right row for Languages beneath Appearance");
assert.match(cssSource, /\.vr-cc-character-profile > \.vr-cc-identity-answer \{[^}]*grid-row: 2;[^}]*align-self: start;[^}]*height: auto;/, "Appearance remains in the upper-right of Character Profile");
assert.match(cssSource, /\.vr-cc-character-profile > \.vr-cc-language-summary \{[^}]*grid-column: 1 \/ -1;[^}]*grid-row: 3;[^}]*border-top:/, "Languages spans the full lower width of Character Profile");
assert.match(cssSource, /\.vr-cc-identity-overview > \.vr-cc-contact-summary \{[^}]*grid-column: 1 \/ span 5;[^}]*grid-row: 3;[^}]*align-self: start;/, "Contacts is a compact standalone section below Character Profile");
assert.match(cssSource, /\.vr-cc-character-profile :is\(\.vr-cc-profile-dossier,\.vr-cc-profile-fields\) > \.vr-cc-text-action \{[^}]*position: absolute;[^}]*top: \.72rem;[^}]*right: 1rem;/, "Edit Profile and Done occupy the top-right of Character Profile");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-guided-grid \{ grid-template-columns: repeat\(2/, "standard layouts render About Your Character as a 2x2 grid");
assert.match(cssSource, /@media \(min-width: 2200px\)[\s\S]*?\.vr-cc-about-character > \.vr-cc-guided-grid \{ grid-template-columns: repeat\(2/, "ultrawide About Your Character remains a 2x2 card grid without affecting nested History");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-guided-grid\.three \{ grid-template-columns: repeat\(3/, "History & Motivation renders as one row of three cards");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-biography-summary \{ grid-column: 1 \/ span 5; grid-row: 4;/, "Biography continues beneath the standalone Contacts section");
assert.match(cssSource, /\.vr-cc-identity-overview \{[^}]*grid-template-rows: auto auto auto minmax\(22rem,1fr\);[^}]*min-height: 100%;/, "the final Biography row expands to fill the available screen height");
assert.match(cssSource, /\.vr-character-creation \.vr-cc-biography-summary \{[^}]*min-height: 0;[^}]*max-height: 100%;[^}]*overflow: hidden;[^}]*contain: size;/, "Biography cannot enlarge shared grid rows or push Languages and Contacts downward");
assert.match(cssSource, /\.vr-cc-about-character \{[^}]*grid-template-rows: auto minmax\(0,1fr\) minmax\(0,\.72fr\);[^}]*align-self: stretch;[^}]*contain: size;/, "About and History stretch vertically beside the expanded Biography area");
assert.match(cssSource, /\.vr-cc-about-history > \.vr-cc-history-motivation \{[^}]*margin-top: \.55rem;[^}]*padding-top: 1\.15rem;[^}]*border-top:/, "History & Motivation has a padded internal subsection break beneath About Your Character");
assert.match(cssSource, /\.vr-cc-biography-summary\.filled \{[^}]*grid-template-rows: auto auto minmax\(0,1fr\) auto;[^}]*overflow: hidden;/, "a populated Biography allocates all remaining card height to its text preview");
assert.match(cssSource, /\.vr-cc-biography-preview > blockquote \{[^}]*height: 100%;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*scrollbar-width: thin;/, "Biography scrolls only after its full container height is exhausted");
assert.doesNotMatch(cssSource, /vr-cc-biography-summary \.vr-cc-biography-preview > blockquote \{[^}]*-webkit-line-clamp:/, "Biography is not visually cut off by a fixed line clamp");
assert.match(cssSource, /@media \(min-width: 2200px\)[\s\S]*?vr-cc-persona-centerpiece \.vr-cc-live-axis,[\s\S]*?width: 84%/, "ultrawide Persona tracks are centered and internally constrained");
assert.match(cssSource, /vr-cc-persona-axes \{[^}]*grid-auto-rows: 1fr;[^}]*gap: \.7rem;/, "Persona axes use equal-height rows and one exact vertical gap");
assert.match(identitySource, /vr-cc-identity-answer-header[^\n]*data-action="finish-identity-field"[^\n]*DoneEditing/, "every guided narrative editor puts Done in its top-right header");
assert.doesNotMatch(identitySource, /data-identity-autogrow/, "guided narrative textareas remain bounded scroll regions instead of auto-growing");
assert.match(cssSource, /\.vr-cc-identity-answer-header \{[^}]*justify-content: space-between;[^}]*align-items: start;/, "narrative field actions occupy the top-right header position");
assert.match(cssSource, /\.vr-cc-identity-answer \{[^}]*max-width: 100%;[^}]*overflow: hidden;[^}]*white-space: normal;/, "Identity response cards contain long answers");
assert.match(cssSource, /\.vr-cc-about-character \.vr-cc-identity-answer \{[^}]*height: 11\.5rem;[^}]*min-height: 11\.5rem;/, "About Your Character response cards form a compact bounded 2x2 grid");
assert.match(cssSource, /\.vr-cc-identity-answer\.filled \{[^}]*grid-template-rows: auto auto auto minmax\(0,1fr\);/, "filled narrative cards reserve a bounded answer row");
assert.match(cssSource, /\.vr-cc-identity-answer > p \{[^}]*height: 100%;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*overflow-wrap: anywhere;[^}]*scrollbar-width: thin;/, "long narrative responses wrap and wheel-scroll inside their cards");
assert.match(cssSource, /identity-answer > p::\-webkit-scrollbar[^}]*\{ width: 8px; \}/, "long narrative responses expose a visible Chromium scrollbar");
assert.match(cssSource, /\.vr-cc-identity-answer\.editing textarea \{[^}]*height: 100%;[^}]*min-height: 0;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*resize: none;[^}]*scrollbar-width: thin;/, "long narrative editors scroll inside the same bounded card height");
assert.match(cssSource, /vr-cc-identity-contact-preview > \.vr-cc-purposeful-empty \{[^}]*grid-template-columns: minmax\(0,1fr\);/, "empty contact summaries use the full card width");

console.log("chargen draft store and validation checks passed");
