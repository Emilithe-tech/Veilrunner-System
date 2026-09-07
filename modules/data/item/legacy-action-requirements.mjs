/** Convert stored pre-contract prerequisites; callers evaluate only the resulting set. */
export function actionRequirements(system = {}) {
  const source = system.requirements?.toObject?.() ?? system.requirements ?? {};
  const result = Array.isArray(source) ? { all: structuredClone(source), any: [], none: [] }
    : { ...structuredClone(source), all: structuredClone(source.all ?? []), any: structuredClone(source.any ?? []), none: structuredClone(source.none ?? []) };
  const add = (id, entry) => {
    if (!result.all.some(requirement => requirement.id === id)) result.all.push({ id, subject: "self", operator: "gte", threshold: 1, knowledge: "mechanical", ...entry });
  };
  for (const [key, match, description] of [
    ["requiredItemTypes", "types", "Requires an equipped item of the required type."],
    ["requiredItemTraits", "traits", "Requires the listed equipped item traits."],
  ]) if (system[key]?.length) add(`migrated-${key}`, { kind: "equipped", equipment: { [match]: [...system[key]] }, description });
  for (const reference of system.requiredDefinitionIds ?? []) add(`migrated-equipped-${reference}`, { kind: "equipped", equipment: { definitionIds: [reference] }, description: "Requires the listed equipped item definition." });
  for (const intent of system.requiredItemIntents ?? []) {
    const capability = { equippable: "equippable", "action-provider": "actionProvider", "chargen-selectable": "chargenSelectable", "market-sellable": "marketSellable", "reaction-provider": "actionProvider" }[intent];
    const equipment = capability ? { capabilities: [capability], ...(intent === "reaction-provider" ? { timing: "reaction" } : {}) } : { types: [intent] };
    add(`migrated-capability-${intent}`, { kind: "equipped", equipment, description: "Requires the listed equipped item capability." });
  }
  for (const [key, subject, knowledge] of [["requiredEffects", "self", "mechanical"], ["requiredTargetEffects", "target", "player"]]) {
    for (const reference of system[key] ?? []) add(`migrated-${key}-${reference}`, { kind: "effect", subject, knowledge, reference });
  }
  return result;
}
