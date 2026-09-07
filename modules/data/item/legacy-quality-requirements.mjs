/** Convert historical Quality prerequisite fields into the shared expression. */
export function qualityRequirements(source = {}) {
  const requirements = source?.toObject?.() ?? source;
  const result = { all: structuredClone(requirements.all ?? []), any: structuredClone(requirements.any ?? []), none: structuredClone(requirements.none ?? []),
    description: String(requirements.description || requirements.text || "") };
  const add = (id, entry) => { if (!result.all.some(leaf => leaf.id === id)) result.all.push({ id, subject: "self", operator: "gte", knowledge: "mechanical", threshold: 1, ...entry }); };
  if (Number(requirements.minimumLevel) > 0) add("migrated-quality-level", { kind: "level", threshold: Number(requirements.minimumLevel), description: `Requires Level ${requirements.minimumLevel}.` });
  for (const reference of requirements.requiredDefinitionIds ?? []) add(`migrated-quality-${reference}`, { kind: "definition", reference, description: "Requires another selected definition." });
  for (const reference of requirements.requiredTags ?? []) add(`migrated-quality-tag-${reference}`, { kind: "trait", reference, description: `Requires tag: ${reference}.` });
  return result;
}
