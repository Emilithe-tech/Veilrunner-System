import { CANONICAL_ID_PATTERN, SEMANTIC_TYPE_DOMAINS } from "../data/definitions/canonical-id.mjs";

export const CONTENT_AUDIT_VERSION = 1;

export const PACK_ITEM_TYPE_EXPECTATIONS = Object.freeze({
  archetypes: Object.freeze(["archetype"]),
  professions: Object.freeze(["profession"]),
  disciplines: Object.freeze(["discipline"]),
  "unique-abilities": Object.freeze(["ability", "spell"]),
  "unique-actions": Object.freeze(["action"]),
  "unique-reactions": Object.freeze(["action"]),
  "unique-traits": Object.freeze(["trait"]),
  species: Object.freeze(["species"]),
  origins: Object.freeze(["origin"]),
  backgrounds: Object.freeze(["background"]),
  languages: Object.freeze(["language"]),
  "qualities-perks": Object.freeze(["quality"])
});

const LEGACY_ITEM_TYPES = new Set(["perk", "flaw"]);
const RULE_KEYS = new Set([
  "ActiveEffectLike", "FlatModifier", "RollOption", "DamageDice",
  "Resistance", "Weakness", "ChoiceSet", "GrantItem",
  "ItemAlteration", "DegreeOfSuccess"
]);
const LEGACY_ACTION_FIELDS = Object.freeze([
  "actionMode", "activationKind", "actionType", "actions", "reactions",
  "resourceCosts", "requiresTarget", "requiredEffects", "requiredTargetEffects",
  "requiredItemTypes", "requiredItemTraits", "requiredDefinitionIds",
  "requiredItemIntents", "currentLevel", "maxLevel", "rankScaling"
]);
const CANONICAL_ACTION_FIELDS = Object.freeze([
  "timing", "economy", "targeting", "requirements", "progression", "owned"
]);

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? "").trim();
const sorted = values => [...values].sort((left, right) => String(left).localeCompare(String(right)));
const location = (pack, document) => ({
  pack: pack.name,
  id: text(document?._id ?? document?.id),
  name: text(document?.name),
  type: text(document?.type)
});

function increment(record, key, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function sortedRecord(record) {
  return Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
}

function actionShape(document) {
  const system = document?.system ?? {};
  const canonicalPresent = CANONICAL_ACTION_FIELDS.filter(field => {
    const value = system[field];
    return value && typeof value === "object" && !Array.isArray(value);
  });
  const legacyPresent = LEGACY_ACTION_FIELDS.filter(field => Object.hasOwn(system, field));
  return {
    canonicalPresent,
    canonicalMissing: CANONICAL_ACTION_FIELDS.filter(field => !canonicalPresent.includes(field)),
    legacyPresent,
    state: canonicalPresent.length === CANONICAL_ACTION_FIELDS.length
      ? legacyPresent.length ? "mixed" : "canonical"
      : "legacy"
  };
}

function targetType(pack, document) {
  const current = text(document?.type).toLowerCase();
  const expected = list(pack.expectedTypes);
  if (!expected.length || expected.includes(current)) return current;
  return expected.length === 1 ? expected[0] : current;
}

function semanticIdentityIssues(pack, document, definitionId) {
  if (!pack.semanticIdentityRequired || !CANONICAL_ID_PATTERN.test(definitionId)) return [];
  const type = targetType(pack, document);
  const domain = SEMANTIC_TYPE_DOMAINS[type];
  if (!domain) return [{ code: "unknown-target-type", expectedType: type }];
  const segments = definitionId.split(".");
  const issues = [];
  if (segments[1] !== domain) issues.push({ code: "wrong-domain", expected: domain, actual: segments[1] ?? "" });
  if (type === "quality") {
    const classification = text(document?.system?.kind ?? (LEGACY_ITEM_TYPES.has(document?.type) ? document.type : "")).toLowerCase();
    if (!["perk", "flaw"].includes(classification)) issues.push({ code: "quality-kind-missing", expected: "perk or flaw", actual: classification });
    else if (segments[2] !== classification) issues.push({ code: "wrong-classification", expected: classification, actual: segments[2] ?? "" });
  } else if (domain !== type && segments[2] !== type) {
    issues.push({ code: "wrong-type-segment", expected: type, actual: segments[2] ?? "" });
  }
  return issues;
}

function referenceKind(field, value, path) {
  if (path.startsWith("flags.Veilrunner.migrations.")) return null;
  if (/definitionids?$/i.test(field)) return path === "system.definitionId" ? null : "definition-id";
  if (/uuid$/i.test(field) && /^(?:Compendium|Actor|Item)\./.test(value)) return "uuid";
  if (["providedActionIds", "requires"].includes(field) && /^[A-Za-z0-9]{8,}$/.test(value)) return "document-id";
  return null;
}

function collectReferences(value, visit, path = "", field = "") {
  if (typeof value === "string") {
    const kind = referenceKind(field, value, path);
    if (kind) visit({ kind, path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectReferences(entry, visit, `${path}.${index}`.replace(/^\./, ""), field));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    collectReferences(entry, visit, nextPath, key);
  }
}

function resolveReference(reference, registries) {
  if (reference.kind === "definition-id") {
    const matches = registries.definitionIds.get(reference.value) ?? [];
    return { resolved: matches.length === 1, ambiguous: matches.length > 1, matches };
  }
  if (reference.kind === "uuid") {
    const match = registries.uuids.get(reference.value);
    return { resolved: Boolean(match), ambiguous: false, matches: match ? [match] : [] };
  }
  const matches = registries.documentIds.get(reference.value) ?? [];
  return { resolved: matches.length === 1, ambiguous: matches.length > 1, matches };
}

function auditPack(pack) {
  const report = {
    name: text(pack.name),
    label: text(pack.label),
    path: text(pack.path),
    documentType: text(pack.documentType ?? pack.type),
    role: text(pack.role) || "content",
    expectedTypes: sorted(list(pack.expectedTypes)),
    records: Math.max(0, Number(pack.records) || 0),
    documents: list(pack.documents).length,
    types: {},
    typeMismatches: [],
    definitionIds: { present: 0, missing: [], optionalMissing: [], invalid: [], semanticMismatch: [] },
    legacyAliases: [],
    actions: { total: 0, canonical: 0, mixed: 0, legacy: 0, candidates: [] },
    rules: { total: 0, keys: {}, unknown: [] },
    effects: { embedded: 0, actionRows: 0 }
  };

  for (const document of list(pack.documents)) {
    const itemLocation = location(pack, document);
    increment(report.types, itemLocation.type || "<missing>");
    if (LEGACY_ITEM_TYPES.has(itemLocation.type)) report.legacyAliases.push(itemLocation);
    const expectedType = targetType(pack, document);
    if (report.expectedTypes.length && !report.expectedTypes.includes(itemLocation.type)) {
      report.typeMismatches.push({ ...itemLocation, expectedType });
    }

    const definitionId = text(document?.system?.definitionId);
    if (!definitionId) report.definitionIds[pack.identityRequired === false ? "optionalMissing" : "missing"].push(itemLocation);
    else {
      report.definitionIds.present += 1;
      if (!CANONICAL_ID_PATTERN.test(definitionId)) report.definitionIds.invalid.push({ ...itemLocation, definitionId });
      else {
        const issues = semanticIdentityIssues(pack, document, definitionId);
        if (issues.length) report.definitionIds.semanticMismatch.push({ ...itemLocation, expectedType, definitionId, issues });
      }
    }

    if (itemLocation.type === "action") {
      const shape = actionShape(document);
      report.actions.total += 1;
      report.actions[shape.state] += 1;
      if (shape.state !== "canonical" || shape.legacyPresent.length) {
        report.actions.candidates.push({
          ...itemLocation,
          state: shape.state,
          canonicalMissing: shape.canonicalMissing,
          legacyPresent: shape.legacyPresent
        });
      }
    }

    for (const [index, rule] of list(document?.system?.rules).entries()) {
      const key = text(rule?.key) || "<missing>";
      report.rules.total += 1;
      increment(report.rules.keys, key);
      if (!RULE_KEYS.has(key)) report.rules.unknown.push({ ...itemLocation, index, key });
    }
    report.effects.embedded += list(document?.effects).length;
    report.effects.actionRows += itemLocation.type === "action" ? list(document?.system?.effects).length : 0;
  }

  report.types = sortedRecord(report.types);
  report.rules.keys = sortedRecord(report.rules.keys);
  for (const key of ["missing", "optionalMissing", "invalid", "semanticMismatch"]) report.definitionIds[key].sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));
  report.typeMismatches.sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));
  report.legacyAliases.sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));
  report.actions.candidates.sort((a, b) => `${a.name}:${a.id}`.localeCompare(`${b.name}:${b.id}`));
  report.rules.unknown.sort((a, b) => `${a.name}:${a.index}`.localeCompare(`${b.name}:${b.index}`));
  return report;
}

/** Analyze already-loaded pack documents. This function never opens or writes a database. */
export function auditCompendiumContent(packs = [], { systemId = "Veilrunner", source = "" } = {}) {
  const normalizedPacks = list(packs).map(pack => ({ ...pack, documents: list(pack.documents) }));
  const registries = { definitionIds: new Map(), documentIds: new Map(), uuids: new Map() };
  const allDocuments = [];

  for (const pack of normalizedPacks) {
    for (const document of pack.documents) {
      const itemLocation = location(pack, document);
      const definitionId = text(document?.system?.definitionId);
      if (definitionId) {
        const matches = registries.definitionIds.get(definitionId) ?? [];
        matches.push(itemLocation);
        registries.definitionIds.set(definitionId, matches);
      }
      if (itemLocation.id) {
        const matches = registries.documentIds.get(itemLocation.id) ?? [];
        matches.push(itemLocation);
        registries.documentIds.set(itemLocation.id, matches);
        registries.uuids.set(`Compendium.${systemId}.${pack.name}.Item.${itemLocation.id}`, itemLocation);
      }
      allDocuments.push({ pack, document, location: itemLocation });
    }
  }

  const packReports = normalizedPacks.map(auditPack).sort((a, b) => a.name.localeCompare(b.name));
  const duplicates = [...registries.definitionIds.entries()]
    .filter(([, matches]) => matches.length > 1)
    .map(([definitionId, matches]) => ({ definitionId, matches }))
    .sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  const references = [];
  for (const entry of allDocuments) {
    collectReferences(entry.document, reference => {
      const resolution = resolveReference(reference, registries);
      references.push({ ...entry.location, ...reference, ...resolution });
    });
  }
  references.sort((a, b) => `${a.pack}:${a.name}:${a.path}:${a.value}`.localeCompare(`${b.pack}:${b.name}:${b.path}:${b.value}`));

  const missingDefinitionIds = packReports.flatMap(pack => pack.definitionIds.missing.map(document => ({ ...document, pack: pack.name })));
  const optionalMissingDefinitionIds = packReports.flatMap(pack => pack.definitionIds.optionalMissing.map(document => ({ ...document, pack: pack.name })));
  const invalidDefinitionIds = packReports.flatMap(pack => pack.definitionIds.invalid.map(document => ({ ...document, pack: pack.name })));
  const semanticDefinitionIdMismatches = packReports.flatMap(pack => pack.definitionIds.semanticMismatch.map(document => ({ ...document, pack: pack.name })));
  const typeMismatches = packReports.flatMap(pack => pack.typeMismatches.map(document => ({ ...document, pack: pack.name })));
  const legacyAliases = packReports.flatMap(pack => pack.legacyAliases.map(document => ({ ...document, pack: pack.name })));
  const actionCandidates = packReports.flatMap(pack => pack.actions.candidates.map(document => ({ ...document, pack: pack.name })));
  const unresolvedReferences = references.filter(reference => !reference.resolved);
  const summary = {
    packs: packReports.length,
    documents: allDocuments.length,
    contentDocuments: packReports.filter(pack => pack.role === "content").reduce((sum, pack) => sum + pack.documents, 0),
    fixtureDocuments: packReports.filter(pack => pack.role !== "content").reduce((sum, pack) => sum + pack.documents, 0),
    emptyPacks: packReports.filter(pack => pack.documents === 0).map(pack => pack.name),
    definitionIds: registries.definitionIds.size,
    missingDefinitionIds: missingDefinitionIds.length,
    optionalMissingDefinitionIds: optionalMissingDefinitionIds.length,
    invalidDefinitionIds: invalidDefinitionIds.length,
    semanticDefinitionIdMismatches: semanticDefinitionIdMismatches.length,
    duplicateDefinitionIds: duplicates.length,
    typeMismatches: typeMismatches.length,
    references: references.length,
    unresolvedReferences: unresolvedReferences.length,
    legacyAliases: legacyAliases.length,
    actionMigrationCandidates: actionCandidates.length,
    contentActionMigrationCandidates: actionCandidates.filter(entry => packReports.find(pack => pack.name === entry.pack)?.role === "content").length,
    fixtureActionMigrationCandidates: actionCandidates.filter(entry => packReports.find(pack => pack.name === entry.pack)?.role !== "content").length,
    ruleElements: packReports.reduce((sum, pack) => sum + pack.rules.total, 0),
    embeddedEffects: packReports.reduce((sum, pack) => sum + pack.effects.embedded, 0),
    actionEffectRows: packReports.reduce((sum, pack) => sum + pack.effects.actionRows, 0)
  };

  return {
    auditVersion: CONTENT_AUDIT_VERSION,
    systemId,
    source: text(source),
    summary,
    packs: packReports,
    findings: {
      missingDefinitionIds,
      optionalMissingDefinitionIds,
      invalidDefinitionIds,
      semanticDefinitionIdMismatches,
      duplicateDefinitionIds: duplicates,
      typeMismatches,
      unresolvedReferences,
      legacyAliases,
      actionMigrationCandidates: actionCandidates,
      unknownRuleElements: packReports.flatMap(pack => pack.rules.unknown.map(rule => ({ ...rule, pack: pack.name })))
    }
  };
}

export function renderContentAuditMarkdown(report) {
  const summary = report.summary;
  const lines = [
    "# Veilrunner V14 Content Audit",
    "",
    `Source: \`${report.source || "loaded documents"}\``,
    "",
    "## Summary",
    "",
    `- Configured packs: ${summary.packs}`,
    `- Documents: ${summary.documents}`,
    `- Production / fixture documents: ${summary.contentDocuments} / ${summary.fixtureDocuments}`,
    `- Empty packs: ${summary.emptyPacks.length ? summary.emptyPacks.join(", ") : "none"}`,
    `- Canonical definition IDs: ${summary.definitionIds}`,
    `- Required missing / optional fixture missing IDs: ${summary.missingDefinitionIds} / ${summary.optionalMissingDefinitionIds}`,
    `- Invalid / duplicate IDs: ${summary.invalidDefinitionIds} / ${summary.duplicateDefinitionIds}`,
    `- Semantic ID / Item type mismatches: ${summary.semanticDefinitionIdMismatches} / ${summary.typeMismatches}`,
    `- References / unresolved: ${summary.references} / ${summary.unresolvedReferences}`,
    `- Legacy perk/flaw aliases: ${summary.legacyAliases}`,
    `- Action migration candidates, production / fixture: ${summary.contentActionMigrationCandidates} / ${summary.fixtureActionMigrationCandidates}`,
    `- Rule elements / embedded effects / action effect rows: ${summary.ruleElements} / ${summary.embeddedEffects} / ${summary.actionEffectRows}`,
    "",
    "## Pack Coverage",
    "",
    "| Pack | Role | Documents | Types | Type mismatches | Semantic ID mismatches | Legacy/mixed actions | Rules | Effects |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: |"
  ];
  for (const pack of report.packs) {
    const types = Object.entries(pack.types).map(([type, count]) => `${type}: ${count}`).join(", ") || "empty";
    lines.push(`| ${pack.name} | ${pack.role} | ${pack.documents} | ${types} | ${pack.typeMismatches.length} | ${pack.definitionIds.semanticMismatch.length} | ${pack.actions.legacy + pack.actions.mixed} | ${pack.rules.total} | ${pack.effects.embedded + pack.effects.actionRows} |`);
  }
  lines.push("", "## Blocking Findings", "");
  const blocking = [
    ...report.findings.invalidDefinitionIds.map(entry => `Invalid definition ID on ${entry.pack}/${entry.name}: \`${entry.definitionId}\``),
    ...report.findings.semanticDefinitionIdMismatches.map(entry => `Semantic definition ID mismatch on ${entry.pack}/${entry.name}: \`${entry.definitionId}\``),
    ...report.findings.duplicateDefinitionIds.map(entry => `Duplicate definition ID \`${entry.definitionId}\` (${entry.matches.length} documents)`),
    ...report.findings.typeMismatches.map(entry => `Item type mismatch on ${entry.pack}/${entry.name}: \`${entry.type}\` should become \`${entry.expectedType}\``),
    ...report.findings.unresolvedReferences.map(entry => `Unresolved ${entry.kind} on ${entry.pack}/${entry.name} at \`${entry.path}\`: \`${entry.value}\``)
  ];
  lines.push(...(blocking.length ? blocking.map(entry => `- ${entry}`) : ["- None."]));
  lines.push("", "## Migration Families", "");
  lines.push(`- Production identity repair: ${summary.missingDefinitionIds + summary.invalidDefinitionIds + summary.semanticDefinitionIdMismatches + summary.duplicateDefinitionIds} finding(s); ${summary.optionalMissingDefinitionIds} optional fixture ID(s).`);
  lines.push(`- Semantic Item type conversion: ${summary.typeMismatches} document(s).`);
  lines.push(`- Quality alias conversion: ${summary.legacyAliases} document(s).`);
  lines.push(`- ActionData conversion: ${summary.contentActionMigrationCandidates} production document(s), then ${summary.fixtureActionMigrationCandidates} fixture document(s).`);
  lines.push(`- Reference repair: ${summary.unresolvedReferences} unresolved reference(s).`);
  lines.push("", "The report is evidence only. No source document or pack was modified.", "");
  return lines.join("\n");
}
