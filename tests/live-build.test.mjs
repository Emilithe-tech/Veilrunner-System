import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.foundry = {
  utils: {
    escapeHTML: value => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
  }
};

const { renderLiveBuild } = await import("../modules/apps/chargen/live-build.mjs");
const chargenSource = fs.readFileSync(new URL("../modules/apps/character-creation.mjs", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../css/veilrunner.css", import.meta.url), "utf8");

const html = renderLiveBuild({
  name: "Hero",
  portrait: "hero.webp",
  level: 3,
  personaAxes: [],
  personaValues: {},
  credits: { value: "1,000c", remaining: true },
  sections: [{
    key: "identity",
    label: "Identity",
    presentation: "cards",
    entries: [
      { title: "Luna Base", description: "Home Planet", img: "worlds/veilrunner/luna.webp" },
      { title: "Acolyte", description: "Background" }
    ]
  }, {
    key: "attributes",
    label: "Attributes",
    presentation: "attributes",
    groups: [{ label: "Physical", rows: [{ label: "STR", base: 4, bonus: 1, value: 5 }, { label: "DEX", base: 4, bonus: 0, value: 4 }] }]
  }]
});

assert.match(html, /vr-cc-live-full-art-card[\s\S]*?vr-cc-live-card-art[\s\S]*?<img src="worlds\/veilrunner\/luna\.webp" alt="" \/>[\s\S]*?vr-cc-live-card-name">Luna Base<\/span>/, "Identity mini cards render full-bleed selected compendium artwork with a separate name layer");
assert.match(html, /vr-cc-live-card-art[^>]*>[\s\S]*?class="fa-regular fa-image"[^>]*><\/i>[\s\S]*?vr-cc-live-card-name">Acolyte<\/span>/, "Identity mini cards retain the placeholder beneath the same tinted name layer when no artwork exists");
assert.match(chargenSource, /\["Species", this\.state\.species, this\.#selectedReference\("species"\)\]/, "Species mini-card data uses the live selected reference");
assert.match(chargenSource, /\["Home Planet", this\.state\.origin, this\.#selectedReference\("origin"\)\]/, "Home Planet mini-card data uses the live selected reference");
assert.match(chargenSource, /\["Background", this\.state\.background, this\.#selectedReference\("background"\)\]/, "Background mini-card data uses the live selected reference");
assert.match(chargenSource, /\["Discipline", this\.state\.discipline, this\.#pathEntry\("discipline"[\s\S]*?img: reference\?\.img \?\? ""/, "Discipline and Identity mini-card data forward selected artwork");
assert.match(html, /vr-cc-live-attribute-adjustment"><b class="vr-cc-live-attribute-bonus">\+1<\/b><\/span><em class="vr-cc-live-attribute-total">5<\/em>/, "Live Build renders only the signed applied bonus before the total");
assert.match(html, /DEX<\/span><strong><span class="vr-cc-live-attribute-adjustment"><\/span><em class="vr-cc-live-attribute-total">4<\/em>/, "Live Build leaves the adjustment column empty when no bonus is applied");
assert.doesNotMatch(html, /vr-cc-live-attribute-base|<em[^>]*>\||>4<\/span><em/, "Live Build omits base values and text pipe characters");
assert.match(cssSource, /grid-template-columns: 3ch 3ch;[\s\S]*?vr-cc-live-attribute-adjustment[^}]*color: #22d3ee;[^}]*text-align: center;[\s\S]*?vr-cc-live-attribute-total[^}]*text-align: center;/, "Attribute values reserve three characters and center their numbers");
assert.match(cssSource, /vr-cc-live-attribute-table p strong[^}]*justify-self: end;[^}]*width: calc\(6ch \+ \.3rem\);[\s\S]*?vr-cc-live-attribute-total[^}]*border-left: 1px solid/, "each Attribute total stays inside a right-aligned cell with its divider attached");
assert.doesNotMatch(cssSource, /vr-cc-live-attribute-table section > div::after/, "Social does not inherit a divider through its empty rows");
assert.match(cssSource, /Compact every Live Build section to half of its previous padding[\s\S]*?padding: \.375rem;[\s\S]*?padding: \.325rem \.375rem;[\s\S]*?padding: \.275rem \.35rem;[\s\S]*?padding: \.225rem \.35rem \.325rem;[\s\S]*?padding: \.175rem \.35rem \.1375rem;/, "Live Build section padding is halved consistently");
assert.match(chargenSource, /#disciplineAttributeNames\("bonusAttributes"\)[\s\S]*?\? 1 : 0/, "discipline Bonus Attributes contribute one authored bonus point");
assert.match(chargenSource, /fa-star vr-cc-prime-stat/, "the Attributes page marks Discipline Primary Attributes as prime stats");
assert.match(chargenSource, /data-action="attribute-preset-balanced"[\s\S]*?data-action="attribute-preset-standard"/, "Balanced and Standard attribute controls are available");
assert.match(chargenSource, /data-action="choose-path-mode"[\s\S]*?Guided[\s\S]*?All[\s\S]*?Search/, "players receive the Guided, All, or Search Path prompt");
assert.doesNotMatch(chargenSource, /View School/, "the mistaken View School action is removed");
assert.match(chargenSource, /const viewPractice = `[\s\S]*?View Practice[\s\S]*?const purchasePractice = !practicePurchased && requirementsMet[\s\S]*?Purchase Practice/, "Practice nodes can always be viewed while Purchase Practice is omitted until access requirements are met");
assert.match(chargenSource, /else if \(record\.kind === "school"\) action = recordSchoolAccess\.rootUnlocked/, "Purchase School is omitted until root access is available");
assert.match(chargenSource, /const nodeAccessGranted = practicePurchased && requirementsMet;[\s\S]*?action = nodeAccessGranted[\s\S]*?: "";/, "node purchase is omitted until its practice and authored requirements are available");
assert.match(chargenSource, /if \(action === "open-practice-view"\) \{[\s\S]*?this\.openPracticeId = button\.dataset\.practiceId;[\s\S]*?this\.#draw\(\);/, "View Practice opens the practice without an access gate");
assert.match(cssSource, /\.vr-character-creation\.vr-cc-review-mode \.vr-cc-shell \{\s*grid-template-columns: clamp\(15\.5rem,17vw,22rem\)/, "Review uses the same full-width Live Build pane as the other chargen sections");
assert.match(cssSource, /Review status pane:[\s\S]*?font-size: 1\.28rem;[\s\S]*?font-size: \.95rem;[\s\S]*?font-size: \.82rem;/, "Review status typography is enlarged across its header, resources, controls, and empty states");
assert.match(chargenSource, /#drawPathModeTransition\(changed = true\)[\s\S]*?vr-cc-path-mode-transition[\s\S]*?if \(action === "selection-mode"\)[\s\S]*?#drawPathModeTransition\(previousMode !== this\.selectionModes\.discipline\)/, "Path mode changes use a dedicated transition without replaying for the active mode");
assert.match(cssSource, /vr-cc-path-mode-transition[\s\S]*?@keyframes vr-cc-path-art-image-in[\s\S]*?filter: blur\(3px\) saturate\(\.72\)[\s\S]*?prefers-reduced-motion: reduce/, "Guided, All, and Search artwork changes crossfade with reduced-motion support");

console.log("live build identity artwork checks passed");
