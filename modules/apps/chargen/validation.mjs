/** Pure chargen validation shared by navigation, review, and confirmation. */
export function validateChargenBuild(state, {
  attributeSpent = 0, attributeBudget = 0, treeIssues = [], mode = "creation",
  review = null
} = {}) {
  const section = new Map();
  const blockingIssues = [];
  const incompleteSections = [];
  const unspentResources = [];
  const completedChecks = [];
  const add = (key, message, { severity = "attention", pane = "" } = {}) => {
    const list = section.get(key) ?? [];
    if (!list.includes(message)) list.push(message);
    section.set(key, list);
    if (!blockingIssues.some(issue => issue.key === key && issue.label === message)) {
      blockingIssues.push({ key, pane, label: message, detail: message, severity });
    }
  };
  if (mode === "creation") {
    if (!Number.isInteger(Number(state.startingLevel)) || Number(state.startingLevel) < 1) add("level", "Choose a starting level.");
    const identityLabels = { species: "species", origin: "home planet", background: "background" };
    for (const key of ["species", "origin", "background"]) if (!String(state[key] ?? "").trim()) add(key, `Choose a ${identityLabels[key]}.`);
    if (["archetype", "profession", "discipline"].some(key => !String(state[key] ?? "").trim())) add("profession", "Choose an archetype, profession, and discipline.");
  }
  if (attributeSpent > attributeBudget) add("attributes", "Attribute allocation exceeds the available points.", { severity: "error" });
  for (const issue of treeIssues) add("talents", issue, { severity: "error" });

  if (review) {
    if (review.qualityFlawValid === false) add("qualitiesFlaws", review.qualityFlawMessage || "Resolve the Perks & Flaws requirements.", { severity: "error" });
    if (mode === "creation" && Number(review.pendingCartCount) > 0) add("credits", "Purchase or clear the remaining storefront cart.");
    if (mode === "creation" && review.purchasesValid === false) add("credits", review.purchaseMessage || "Resolve the invalid starting loadout.", { severity: "error" });

    if (mode === "creation" && !String(review.biographyText ?? "").trim()) incompleteSections.push({ key: "identity", pane: "biography", label: "Biography / About Your Character", detail: "Your character biography is empty." });
    if (mode === "creation" && !String(state.freeLanguage?.definitionId || state.freeLanguage?.name || "").trim()) incompleteSections.push({ key: "identity", pane: "languages", label: "Languages", detail: "No optional language has been selected. It can be added later." });
    if (mode === "creation" && !Number(review.contactCount)) incompleteSections.push({ key: "identity", pane: "contacts", label: "Contacts", detail: "No optional contacts have been added. They can be added later." });

    const resources = [
      [review.attributePointsRemaining, "Attribute Point", "attributes", true],
      [review.talentPointsRemaining, "Talent Point", "talents", true],
      [review.skillPointsRemaining, "Skill Point", "talents", true],
      ...(mode === "creation" ? [[review.creditsRemaining, "Credits Remaining", "credits", false]] : [])
    ];
    for (const [amount, label, key, pluralize] of resources) if (Number(amount) > 0) unspentResources.push({ key, label: pluralize && Number(amount) !== 1 ? `${label}s` : label, amount: Number(amount) });

    const checks = mode === "creation" ? [
      [state.species, "species", "Species selected"],
      [state.origin, "origin", "Home planet selected"],
      [state.background, "background", "Background selected"],
      [[state.archetype, state.profession, state.discipline].every(value => String(value ?? "").trim()), "profession", "Path selected"],
      [String(state.freeLanguage?.definitionId || state.freeLanguage?.name || "").trim(), "identity", "Language selected", "languages"],
      [review.qualityFlawValid !== false, "qualitiesFlaws", "Perks & Flaws valid"],
      [review.purchasesValid !== false && !Number(review.pendingCartCount), "credits", "Purchases valid"]
    ] : [[review.qualityFlawValid !== false, "qualitiesFlaws", "Perks & Flaws valid"]];
    for (const [complete, key, label, pane = ""] of checks) if (complete) completedChecks.push({ key, pane, label });
  }

  const valid = blockingIssues.length === 0;
  const readiness = !valid
    ? { state: "not-ready", severity: blockingIssues.some(issue => issue.severity === "error") ? "error" : "attention", label: "Not Ready", summary: `${blockingIssues.length} required action${blockingIssues.length === 1 ? "" : "s"} remaining.` }
    : unspentResources.length
      ? { state: "unspent", severity: "info", label: "Ready with Unspent Resources", summary: "All required selections are complete." }
      : { state: "ready", severity: "complete", label: "Ready", summary: "Character creation requirements are satisfied." };
  const allowedTargets = mode === "levelUp" ? ["attributes", "talents", "qualitiesFlaws"] : ["level", "species", "origin", "background", "profession", "attributes", "talents", "qualitiesFlaws", "credits", "identity"];
  return { section, valid, messages: [...section.values()].flat(), readiness, blockingIssues, incompleteSections, unspentResources, completedChecks, allowedTargets };
}
