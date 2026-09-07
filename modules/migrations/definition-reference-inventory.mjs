import { CANONICAL_ID_PATTERN } from "../data/definitions/canonical-id.mjs";

export const DEFINITION_REFERENCE_INVENTORY_VERSION = 1;

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? "").trim();
const compareOccurrences = (left, right) => [
  left.tokenType, left.definitionId, left.scope, left.world, left.collection,
  left.recordKey, left.path
].join(":").localeCompare([
  right.tokenType, right.definitionId, right.scope, right.world, right.collection,
  right.recordKey, right.path
].join(":"));

function sourceUuid(row, systemId) {
  return `Compendium.${systemId}.${row.pack}.Item.${row.documentId}`;
}

function tokenTargets(mappingRows, systemId) {
  const targets = new Map();
  for (const row of mappingRows) {
    const common = {
      pack: row.pack,
      documentId: row.documentId,
      name: row.name,
      oldDefinitionId: row.oldDefinitionId,
      proposedDefinitionId: row.proposedDefinitionId
    };
    for (const [tokenType, token] of [
      ["old-definition-id", row.oldDefinitionId],
      ["proposed-definition-id", row.proposedDefinitionId],
      ["source-uuid", sourceUuid(row, systemId)]
    ]) {
      const value = text(token);
      if (!value) continue;
      const entries = targets.get(value) ?? [];
      entries.push(Object.freeze({ ...common, tokenType, token: value }));
      targets.set(value, entries);
    }
  }
  return targets;
}

function embeddedItemContext(source, record, path) {
  if (source.scope !== "world-data" || source.collection !== "actors") return null;
  if (/^!actors\.items!/.test(record.key) && path === "system.definitionId") {
    const ids = record.key.replace(/^!actors\.items!/, "").split(".");
    return {
      ownerId: ids[0] ?? "",
      ownerName: "",
      documentId: text(record.value?._id ?? ids[1]),
      documentName: text(record.value?.name)
    };
  }
  const match = path.match(/^items\.(\d+)\.system\.definitionId$/);
  if (!match) return null;
  const item = list(record.value?.items)[Number(match[1])] ?? {};
  return {
    ownerId: text(record.value?._id),
    ownerName: text(record.value?.name),
    documentId: text(item?._id ?? item?.id),
    documentName: text(item?.name)
  };
}

function definitionIdentityKind(source, record, path) {
  if (path !== "system.definitionId" && !/^items\.\d+\.system\.definitionId$/.test(path)) return "definition-id-reference";
  if (source.scope === "system-compendium" && /^!items!/.test(record.key)) return "system-definition-identity";
  if (source.scope === "world-data" && source.collection === "items" && /^!items!/.test(record.key)) return "world-item-identity";
  if (source.scope === "world-data" && source.collection === "actors" && (/^!actors\.items!/.test(record.key) || /^items\.\d+\./.test(path))) {
    return "actor-embedded-item-identity";
  }
  if (source.scope === "world-compendium" && /^!items!/.test(record.key)) return "world-compendium-item-identity";
  return "definition-id-reference";
}

function occurrenceKind(target, source, record, path, exact) {
  if (path.startsWith("flags.Veilrunner.migrations.canonicalIdentity")) return "migration-provenance";
  if (!exact) return "embedded-text-reference";
  if (target.tokenType !== "old-definition-id" && target.tokenType !== "proposed-definition-id") return "source-uuid-reference";
  return definitionIdentityKind(source, record, path);
}

function occurrence(target, source, record, path, exact) {
  const embedded = embeddedItemContext(source, record, path);
  return Object.freeze({
    tokenType: target.tokenType,
    token: target.token,
    exact,
    occurrenceKind: occurrenceKind(target, source, record, path, exact),
    definitionId: target.oldDefinitionId,
    proposedDefinitionId: target.proposedDefinitionId,
    canonicalPack: target.pack,
    canonicalDocumentId: target.documentId,
    canonicalName: target.name,
    scope: source.scope,
    world: source.world ?? "",
    collection: source.collection,
    databasePath: source.databasePath ?? "",
    recordKey: record.key,
    recordId: text(record.value?._id ?? record.value?.id),
    recordName: text(record.value?.name),
    documentId: embedded?.documentId ?? text(record.value?._id ?? record.value?.id),
    documentName: embedded?.documentName ?? text(record.value?.name),
    ownerId: embedded?.ownerId ?? "",
    ownerName: embedded?.ownerName ?? "",
    path
  });
}

function inspectString(value, path, source, record, targets, occurrences, unmappedIds) {
  const exactTargets = targets.get(value);
  if (exactTargets) {
    for (const target of exactTargets) occurrences.push(occurrence(target, source, record, path, true));
    return;
  }
  if (CANONICAL_ID_PATTERN.test(value)) {
    const entries = unmappedIds.get(value) ?? [];
    entries.push(Object.freeze({
      occurrenceKind: definitionIdentityKind(source, record, path),
      scope: source.scope,
      world: source.world ?? "",
      collection: source.collection,
      recordKey: record.key,
      recordId: text(record.value?._id ?? record.value?.id),
      recordName: text(record.value?.name),
      path
    }));
    unmappedIds.set(value, entries);
  }
  if (!value.includes("veilrunner") && !value.includes("Compendium.Veilrunner")) return;
  for (const [token, tokenEntries] of targets) {
    if (!value.includes(token)) continue;
    for (const target of tokenEntries) occurrences.push(occurrence(target, source, record, path, false));
  }
}

function walkStrings(value, visit, path = "", seen = new WeakSet()) {
  if (typeof value === "string") {
    visit(value, path);
    return 1;
  }
  if (!value || typeof value !== "object") return 0;
  if (seen.has(value)) return 0;
  seen.add(value);
  let strings = 0;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => { strings += walkStrings(entry, visit, path ? `${path}.${index}` : String(index), seen); });
    return strings;
  }
  for (const [key, entry] of Object.entries(value)) {
    strings += walkStrings(entry, visit, path ? `${path}.${key}` : key, seen);
  }
  return strings;
}

function countBy(values, keyOf) {
  const counts = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

/** Analyze decoded database records. This function never opens or writes a database. */
export function inventoryDefinitionReferences(mappingRows = [], sources = [], { systemId = "Veilrunner" } = {}) {
  const rows = list(mappingRows);
  const targets = tokenTargets(rows, systemId);
  const occurrences = [];
  const unmappedIds = new Map();
  let records = 0;
  let stringValues = 0;

  for (const source of list(sources)) {
    for (const record of list(source.records)) {
      records += 1;
      stringValues += walkStrings(record.value, (value, path) => {
        inspectString(value, path, source, record, targets, occurrences, unmappedIds);
      });
    }
  }
  occurrences.sort(compareOccurrences);

  const oldDefinitionIds = occurrences.filter(entry => entry.tokenType === "old-definition-id");
  const proposedDefinitionIds = occurrences.filter(entry => entry.tokenType === "proposed-definition-id");
  const sourceUuids = occurrences.filter(entry => entry.tokenType === "source-uuid");
  const identityKinds = new Set([
    "system-definition-identity", "world-item-identity",
    "actor-embedded-item-identity", "world-compendium-item-identity"
  ]);
  const identities = oldDefinitionIds.filter(entry => identityKinds.has(entry.occurrenceKind));
  const provenance = occurrences.filter(entry => entry.occurrenceKind === "migration-provenance");
  const references = oldDefinitionIds.filter(entry => !identityKinds.has(entry.occurrenceKind) && entry.occurrenceKind !== "migration-provenance");
  const activeProposedDefinitionIds = proposedDefinitionIds.filter(entry => entry.occurrenceKind !== "migration-provenance");
  const unmappedDefinitionIds = [...unmappedIds.entries()]
    .map(([definitionId, locations]) => Object.freeze({ definitionId, locations: Object.freeze(locations) }))
    .sort((left, right) => left.definitionId.localeCompare(right.definitionId));

  const summary = Object.freeze({
    mappingRows: rows.length,
    sources: list(sources).length,
    records,
    stringValues,
    oldDefinitionIdOccurrences: oldDefinitionIds.length,
    oldDefinitionIdIdentities: identities.length,
    oldDefinitionIdReferences: references.length,
    distinctOldDefinitionIdsPresent: new Set(oldDefinitionIds.map(entry => entry.definitionId)).size,
    proposedDefinitionIdOccurrences: proposedDefinitionIds.length,
    activeProposedDefinitionIdOccurrences: activeProposedDefinitionIds.length,
    migrationProvenanceOccurrences: provenance.length,
    sourceUuidOccurrences: sourceUuids.length,
    unmappedDefinitionIds: unmappedDefinitionIds.length,
    unmappedByKind: countBy(unmappedDefinitionIds.flatMap(entry => entry.locations), entry => entry.occurrenceKind),
    identitiesByKind: countBy(identities, entry => entry.occurrenceKind),
    referencesByKind: countBy(references, entry => entry.occurrenceKind),
    occurrencesByScope: countBy(occurrences, entry => entry.scope)
  });

  return Object.freeze({
    version: DEFINITION_REFERENCE_INVENTORY_VERSION,
    ok: true,
    summary,
    identities: Object.freeze(identities),
    references: Object.freeze(references),
    proposedDefinitionIds: Object.freeze(proposedDefinitionIds),
    migrationProvenance: Object.freeze(provenance),
    sourceUuids: Object.freeze(sourceUuids),
    unmappedDefinitionIds: Object.freeze(unmappedDefinitionIds)
  });
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function occurrenceTable(lines, entries) {
  lines.push(
    "| Kind | World / collection | Document | Path | Current ID | Proposed ID |",
    "|---|---|---|---|---|---|"
  );
  if (!entries.length) lines.push("| none | none | none | none | none | none |");
  for (const entry of entries) {
    const collection = [entry.world, entry.collection].filter(Boolean).join(" / ");
    const document = entry.ownerName
      ? `${entry.ownerName} -> ${entry.documentName || entry.documentId}`
      : entry.documentName || entry.recordName || entry.documentId || entry.recordKey;
    lines.push(`| ${markdownCell(entry.occurrenceKind)} | ${markdownCell(collection)} | ${markdownCell(document)} | \`${markdownCell(entry.path)}\` | \`${markdownCell(entry.definitionId)}\` | \`${markdownCell(entry.proposedDefinitionId)}\` |`);
  }
}

export function renderDefinitionReferenceInventoryMarkdown(report) {
  const summary = report.summary;
  const lines = [
    "# Veilrunner V14 Definition Reference Inventory",
    "",
    `System snapshot: \`${report.source?.systemSnapshot ?? "decoded sources"}\``,
    `World snapshot: \`${report.source?.worldSnapshot ?? "decoded sources"}\``,
    "",
    "## Summary",
    "",
    `- Mapping rows: ${summary.mappingRows}`,
    `- Databases / decoded records / strings: ${summary.sources} / ${summary.records} / ${summary.stringValues}`,
    `- Current ID occurrences: ${summary.oldDefinitionIdOccurrences}`,
    `- Definition identities / cross-document references: ${summary.oldDefinitionIdIdentities} / ${summary.oldDefinitionIdReferences}`,
    `- Distinct mapped current IDs present: ${summary.distinctOldDefinitionIdsPresent}`,
    `- Proposed IDs already present: ${summary.proposedDefinitionIdOccurrences}`,
    `- Active proposed-ID / migration-provenance occurrences: ${summary.activeProposedDefinitionIdOccurrences} / ${summary.migrationProvenanceOccurrences}`,
    `- Stored canonical Compendium UUID occurrences: ${summary.sourceUuidOccurrences}`,
    `- Exact out-of-map Veilrunner IDs: ${summary.unmappedDefinitionIds}`,
    "",
    "## Identities requiring coordinated remap",
    ""
  ];
  occurrenceTable(lines, report.identities);
  lines.push("", "## Cross-document current-ID references", "");
  occurrenceTable(lines, report.references);
  lines.push("", "## Proposed IDs already present", "");
  occurrenceTable(lines, report.proposedDefinitionIds);
  lines.push("", "## Historical migration provenance", "");
  occurrenceTable(lines, report.migrationProvenance);
  lines.push("", "## Stored source UUIDs", "");
  occurrenceTable(lines, report.sourceUuids);
  lines.push("", "## Exact Veilrunner IDs outside this 179-row map", "");
  if (!report.unmappedDefinitionIds.length) lines.push("None.");
  else for (const entry of report.unmappedDefinitionIds) {
    const kinds = Object.entries(countBy(entry.locations, location => location.occurrenceKind))
      .map(([kind, count]) => `${kind}: ${count}`)
      .join(", ");
    lines.push(`- \`${markdownCell(entry.definitionId)}\` (${entry.locations.length} occurrence(s); ${markdownCell(kinds)})`);
  }
  return `${lines.join("\n")}\n`;
}
