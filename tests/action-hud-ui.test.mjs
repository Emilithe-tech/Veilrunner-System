import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [controller, projection, template, css, partyTemplate, economyTemplate] = await Promise.all([
  readFile(new URL("../modules/apps/action-hud/controller.mjs", import.meta.url), "utf8"),
  readFile(new URL("../modules/apps/action-hud/projection.mjs", import.meta.url), "utf8"),
  readFile(new URL("../templates/action-hud/workspace.hbs", import.meta.url), "utf8"),
  readFile(new URL("../css/veilrunner.css", import.meta.url), "utf8"),
  readFile(new URL("../templates/action-hud/party.hbs", import.meta.url), "utf8"),
  readFile(new URL("../templates/action-hud/economy.hbs", import.meta.url), "utf8")
]);

test("composer calculation disclosure survives selection rerenders", () => {
  assert.match(controller, /calculationOpen = Boolean\(this\.element\.querySelector\("\.vr-hud-calculation"\)\?\.open\)/);
  assert.match(controller, /addEventListener\("toggle", event => \{\s*this\.state\.calculationOpen = event\.currentTarget\.open;/);
  assert.match(template, /class="vr-hud-calculation" \{\{#if hud\.calculationOpen\}\}open\{\{\/if\}\}/);
});

test("projected cost presents damage at top right and marks unaffordable resources", () => {
  assert.match(template, /vr-hud-projected-cost-header[\s\S]*vr-hud-estimated-damage[\s\S]*Estimated \{\{#if composer\.action\.damageType\}\}/);
  assert.match(template, /vr-hud-estimated-damage"><span>Estimated[\s\S]*<strong class="vr-hud-formula-tokens">/);
  assert.match(template, /composer\.action\.damageOutcome\.formula[\s\S]*<i class="\{\{composer\.action\.damageIcon\}\}/);
  assert.match(template, /vr-hud-preview \{\{#unless entry\.affordable\}\}over-budget/);
  assert.match(template, /Short \{\{entry\.shortfall\}\}/);
  assert.match(css, /\.vr-hud-projected-cost-header \{[^}]*justify-content:space-between/);
  assert.match(css, /\.vr-hud-preview\.over-budget/);
});

test("spell modifier cards use resolved cost labels", () => {
  assert.match(template, /\{\{modifier\.costLabel\}\}/);
});

test("focused and subtle can remain binary while stackable modifiers get steppers", () => {
  assert.match(template, /\{\{#unless modifier\.stackable\}\}is-binary/);
  assert.match(template, /\{\{#if modifier\.stackable\}\}<span class="vr-hud-modifier-stepper">/);
  assert.match(template, /data-action="adjustSpellModifier" data-delta="1"[\s\S]*data-spell-modifier-count[\s\S]*data-action="adjustSpellModifier" data-delta="-1"/);
  assert.match(controller, /static onAdjustSpellModifier[\s\S]*enabled\.checked = next > 0/);
  assert.match(css, /input\[type="checkbox"\][^}]*width:28px; height:28px/);
  assert.match(css, /\.vr-hud-spell-modifiers \.vr-hud-modifier-stepper \{[^}]*grid-template-columns:20px 14px;[^}]*grid-template-rows:repeat\(2,10px\);[^}]*gap:0;[^}]*width:34px; height:20px/);
  assert.match(css, /\.vr-hud-modifier-stepper input\[type="number"\] \{[^}]*box-sizing:border-box;[^}]*grid-column:1;[^}]*width:20px; height:20px;[^}]*padding:0 1px/);
  assert.match(css, /\.vr-hud-modifier-stepper button \{[^}]*box-sizing:border-box;[^}]*width:14px; height:10px;[^}]*overflow:visible/);
  assert.doesNotMatch(css, /\.vr-hud-modifier-stepper \{[^}]*grid-template-rows:12px 28px 12px/);
});

test("spell modifiers use a three by three grid", () => {
  assert.match(css, /\.vr-hud-spell-modifiers \{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\);[^}]*grid-template-rows:repeat\(3,minmax\(70px,auto\)\)/);
});

test("composer typography grows without changing its outer dimensions", () => {
  assert.match(css, /\.vr-hud-composer \{[^}]*height:100%; font-size:12px;/);
  assert.match(css, /\.vr-hud-composer header div strong \{ font-size:14px; \}/);
  assert.match(css, /\.vr-hud-composer label \{[^}]*font-size:13px/);
  assert.match(css, /\.vr-hud-spell-modifiers strong \{[^}]*font-size:14px/);
  assert.match(css, /\.vr-hud-projected-cost \{ font-size:14px; \}/);
  assert.match(css, /\.vr-hud-estimated-damage \.vr-hud-formula-tokens mark \{[^}]*font-size:18px/);
});

test("GM token selection remembers the most recently clicked combat actor", () => {
  assert.match(controller, /let gmSelectedCombatActorId = "";/);
  assert.match(controller, /Hooks\.on\("controlToken", \(token, controlled\) => \{/);
  assert.match(controller, /game\.user\.isGM && controlled && token\?\.actor[\s\S]*gmSelectedCombatActorId = token\.actor\.id/);
  assert.match(controller, /combatant\.actor\?\.id === gmSelectedCombatActorId/);
});

test("party list excludes the selected actor and clips top-aligned portraits", () => {
  assert.match(partyTemplate, /data-action="toggleParty"/);
  assert.match(partyTemplate, /fa-chevron-\{\{#if partyOpen\}\}down\{\{else\}\}up\{\{\/if\}\}/);
  assert.match(partyTemplate, /\{\{#if partyOpen\}\}[\s\S]*vr-hud-party-list[\s\S]*\{\{\/if\}\}/);
  assert.match(projection, /getPartyMembers\([^\n]+\.filter\(member => member\.id !== actor\.id\)/);
  assert.match(partyTemplate, /class="vr-hud-party-portrait"><img src="\{\{member\.img\}\}"/);
  assert.match(css, /\.vr-hud-party-portrait \{[^}]*align-self:start;[^}]*overflow:hidden;/);
  assert.match(css, /\.vr-hud-party-portrait > img \{[^}]*object-fit:cover;[^}]*object-position:50% 0;/);
  assert.match(controller, /selfTop - partyBottom/);
  assert.match(css, /transform:translateY\(var\(--vr-hud-party-offset\)\)/);
  assert.match(css, /\.vr-hud-party \{[^}]*grid-template-rows:auto minmax\(0,1fr\);[^}]*max-height:min\(42vh,440px\)/);
  assert.match(css, /\.vr-hud-party-list \{[^}]*min-height:0;[^}]*overflow:auto;/);
  assert.doesNotMatch(css, /\.vr-hud-party-list \{[^}]*max-height:inherit/);
});

test("composer joins actor, target, and footer while controls stay compact", () => {
  assert.match(controller, /classList\.toggle\("composer-open", context\.workspaceComposer\)/);
  assert.match(css, /\.vr-action-hud\.composer-open \{ column-gap:0; \}/);
  assert.match(css, /\.vr-action-hud\.composer-open \.vr-hud-workspace \{ grid-row:2\/3;/);
  assert.match(css, /\.vr-action-hud\.composer-open \.vr-hud-primary,[^}]*min-height:25px/);
  assert.match(css, /grid-template-rows:minmax\(0,1fr\) auto 52px;[^}]*column-gap:0;/);
  assert.match(css, /\.vr-hud-workspace \{[^}]*left:-1px;[^}]*bottom:-\d+px;[^}]*width:calc\(100% \+ 2px\)/);
});

test("normal and search navigation sit at the bottom with larger controls", () => {
  assert.match(template, /vr-hud-action-grid[\s\S]*<footer class="vr-hud-workspace-footer">[\s\S]*data-hud-search/);
  assert.doesNotMatch(template, /<header class="vr-hud-workspace-header">[^\n]*data-hud-search/);
  assert.match(css, /\.vr-hud-domain-nav \{[^}]*align-items:flex-end;[^}]*margin-top:auto;[^}]*padding:0;/);
  assert.match(css, /\.vr-hud-domain-nav button,\.vr-hud-workspace-footer button \{[^}]*min-height:34px;[^}]*padding:6px 10px;/);
  assert.match(css, /\.vr-hud-workspace-footer \{[^}]*margin-top:auto;[^}]*border-top:/);
});

test("saves and rightmost undo are centered on both axes", () => {
  assert.ok(economyTemplate.indexOf("vr-hud-macro-strip") < economyTemplate.indexOf("vr-hud-undo"));
  assert.match(css, /\.vr-hud-economy-rail > \.vr-hud-saves,\.vr-hud-undo-trigger \{[^}]*place-content:center; place-items:center;/);
  assert.match(css, /\.vr-hud-economy-rail > \.vr-hud-saves span,[^}]*\.vr-hud-undo-trigger span,[^}]*justify-self:center;/);
});

test("undo exposes action and movement history on hover or keyboard focus", () => {
  assert.match(economyTemplate, /class="vr-hud-undo-history" role="menu"/);
  assert.match(economyTemplate, /data-action="undoToHistory" data-history-index="\{\{entry\.index\}\}"/);
  assert.match(controller, /undoToHistory: VeilrunnerActionHud\.onUndoToHistory/);
  assert.match(controller, /undoHudActionsThrough\(this\.actor, target\.dataset\.historyIndex\)/);
  assert.match(projection, /undoEntries = undoHistory\.map/);
  assert.match(css, /\.vr-hud-economy-rail \{[^}]*overflow:visible;/);
  assert.match(css, /\.vr-hud-undo-history \{[^}]*bottom:100%;[^}]*opacity:0;[^}]*visibility:hidden;/);
  assert.match(css, /\.vr-hud-undo:hover \.vr-hud-undo-history,\.vr-hud-undo:focus-within \.vr-hud-undo-history \{[^}]*opacity:1;[^}]*visibility:visible;[^}]*pointer-events:auto;/);
});

test("movement is left aligned in a six-box-wide total-based color track", () => {
  assert.match(economyTemplate, /class="vr-hud-movement-tracker"[\s\S]*class="vr-hud-movement-boxes"/);
  assert.match(economyTemplate, /class="vr-hud-movement-label">Movement<\/span>[\s\S]*class="vr-hud-movement-value">\{\{#if economy\}\}\{\{economy\.movement\}\}\/\{\{economy\.movementTrack\.maximumMeters\}\} m/);
  assert.match(economyTemplate, /vr-hud-movement-box \{\{box\.color\}\}/);
  assert.match(css, /\.vr-hud-economy-rail > \.vr-hud-movement-tracker \{[^}]*grid-template-columns:18px minmax\(123px,1fr\) minmax\(52px,.55fr\);[^}]*grid-template-rows:auto 1fr;/);
  assert.match(css, /\.vr-hud-economy-rail \.vr-hud-movement-label \{[^}]*font-size:8px;/);
  assert.match(css, /\.vr-hud-economy-rail \.vr-hud-movement-value \{[^}]*grid-row:1\/3;[^}]*align-self:stretch;[^}]*display:flex;[^}]*font-size:18px;[^}]*text-transform:none;/);
  assert.match(css, /\.vr-hud-movement-boxes \{[^}]*grid-column:2;[^}]*grid-row:2;[^}]*grid-template-columns:repeat\(6,18px\);/);
  assert.match(css, /\.vr-hud-movement-box \{[^}]*width:18px; height:18px;/);
  assert.match(css, /\.vr-hud-movement-box\.orange/);
  assert.match(css, /\.vr-hud-movement-box\.white/);
});

test("inapplicable spell-modifier warnings are not rendered", () => {
  assert.doesNotMatch(template, /Summoning spells only/);
  assert.doesNotMatch(template, /modifier\.applicable/);
});
