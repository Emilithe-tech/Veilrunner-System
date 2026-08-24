/** Pure chargen validation shared by navigation, review, and confirmation. */
export function validateChargenBuild(state, { attributeSpent = 0, attributeBudget = 0, treeIssues = [], mode = "creation" } = {}) {
  const section = new Map();
  const add = (key, message) => { const list = section.get(key) ?? []; list.push(message); section.set(key, list); };
  if (mode === "creation") {
    if (!Number.isInteger(Number(state.startingLevel)) || Number(state.startingLevel) < 1) add("level", "Choose a starting level.");
    const identityLabels = { species: "species", origin: "home planet", background: "background" };
    for (const key of ["species", "origin", "background"]) if (!String(state[key] ?? "").trim()) add(key, `Choose a ${identityLabels[key]}.`);
    for (const key of ["archetype", "profession", "discipline"]) if (!String(state[key] ?? "").trim()) add("profession", "Choose an archetype, profession, and discipline.");
  }
  if (attributeSpent > attributeBudget) add("attributes", "Attribute allocation exceeds the available points.");
  for (const issue of treeIssues) add("talents", issue);
  return { section, valid: section.size === 0, messages: [...section.values()].flat() };
}
