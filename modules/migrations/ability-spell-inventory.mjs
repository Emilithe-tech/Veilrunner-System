import { ACTION_CONTRACT_FIELDS, hasCanonicalActionContractField } from "./action-contract.mjs";
import { canonicalIdBuilder } from "../data/definitions/canonical-id.mjs";

const DEFINITION_ID_PATTERN = /^veilrunner\.[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)+$/;
const DEFINITION_FIELDS = Object.freeze(["classification", "mechanics", "rules"]);
const CANONICAL_FIELDS = Object.freeze([...ACTION_CONTRACT_FIELDS, ...DEFINITION_FIELDS]);

function documentEntry(source, record, cohort) {
  const document = record?.value ?? {};
  const system = document.system && typeof document.system === "object" ? document.system : {};
  const hasContract = field => ACTION_CONTRACT_FIELDS.includes(field)
    ? hasCanonicalActionContractField(system, field)
    : Object.hasOwn(system, field);
  const presentContracts = CANONICAL_FIELDS.filter(hasContract);
  const missingContracts = CANONICAL_FIELDS.filter(field => !hasContract(field));
  const actorId = cohort === "actor-spell"
    ? String(record.key).match(/^!actors\.items!([^.]+)\./)?.[1] ?? ""
    : "";
  const proposedDefinitionId = ["world-spell", "actor-spell"].includes(cohort) && String(system.tree?.practice ?? "").trim()
    ? canonicalIdBuilder.build({ type: "spell", scope: system.tree.practice, name: document.name })
    : String(system.definitionId ?? "");
  return Object.freeze({
    cohort,
    scope: source.scope,
    world: source.world ?? "",
    collection: source.collection,
    key: String(record.key),
    actorId,
    id: String(document._id ?? document.id ?? ""),
    name: String(document.name ?? ""),
    type: String(document.type ?? ""),
    topLevelKeys: Object.freeze(Object.keys(document).sort()),
    folder: document.folder ?? null,
    ownership: Object.freeze(structuredClone(document.ownership ?? {})),
    stats: Object.freeze(structuredClone(document._stats ?? {})),
    definitionId: String(system.definitionId ?? ""),
    proposedDefinitionId,
    systemKeys: Object.freeze(Object.keys(system).sort()),
    presentContracts: Object.freeze(presentContracts),
    missingContracts: Object.freeze(missingContracts),
    completeActionContract: ACTION_CONTRACT_FIELDS.every(field => hasCanonicalActionContractField(system, field)),
    partialActionContract: ACTION_CONTRACT_FIELDS.some(field => hasCanonicalActionContractField(system, field))
      && !ACTION_CONTRACT_FIELDS.every(field => hasCanonicalActionContractField(system, field)),
    legacyCurrentLevel: Object.hasOwn(system, "currentLevel") ? Number(system.currentLevel) : null,
    ownedCurrentLevel: system.owned?.currentLevel ?? null,
    compendiumSource: String(document._stats?.compendiumSource ?? ""),
    provenanceDefinitionId: String(document.flags?.Veilrunner?.provenance?.definitionId ?? ""),
    provenanceSourceUuid: String(document.flags?.Veilrunner?.provenance?.sourceUuid ?? ""),
    legacyClassification: Object.freeze({
      category: String(system.category ?? ""),
      page: String(system.tree?.page ?? ""),
      school: String(system.tree?.school ?? ""),
      practice: String(system.tree?.practice ?? "")
    })
  });
}

function itemRecords(source) {
  return (source.records ?? []).filter(record => String(record.key).startsWith("!items!"));
}

function actorItemRecords(source) {
  return (source.records ?? []).filter(record => String(record.key).startsWith("!actors.items!"));
}

function fieldPresence(entries) {
  return Object.freeze(Object.fromEntries(CANONICAL_FIELDS.map(field => [
    field,
    entries.filter(entry => entry.presentContracts.includes(field)).length
  ])));
}

function shapeGroups(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const signature = entry.systemKeys.join(",");
    const group = groups.get(signature) ?? { count: 0, systemKeys: entry.systemKeys, examples: [] };
    group.count += 1;
    if (group.examples.length < 4) group.examples.push(entry.name);
    groups.set(signature, group);
  }
  return Object.freeze([...groups.values()]
    .sort((left, right) => right.count - left.count || left.systemKeys.join(",").localeCompare(right.systemKeys.join(",")))
    .map(group => Object.freeze({ ...group, examples: Object.freeze(group.examples) })));
}

function duplicateDefinitionIds(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (!entry.definitionId) continue;
    const rows = byId.get(entry.definitionId) ?? [];
    rows.push(entry);
    byId.set(entry.definitionId, rows);
  }
  return Object.freeze([...byId.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([definitionId, rows]) => Object.freeze({
      definitionId,
      rows: Object.freeze(rows.map(row => Object.freeze({ cohort: row.cohort, collection: row.collection, id: row.id, name: row.name })))
    })));
}

export function inventoryAbilitySpellSources(sources, { worldId = "veilrunner" } = {}) {
  if (!Array.isArray(sources)) throw new TypeError("Ability/spell inventory requires source databases.");
  const systemAbilities = [];
  const systemSpells = [];
  const worldSpells = [];
  const actorSpells = [];
  for (const source of sources) {
    if (source.scope === "system-compendium" && source.collection === "unique-abilities") {
      for (const record of itemRecords(source)) {
        if (record.value?.type === "ability") systemAbilities.push(documentEntry(source, record, "system-ability"));
        else if (record.value?.type === "spell") systemSpells.push(documentEntry(source, record, "system-spell"));
      }
    }
    if (source.scope === "world-compendium" && source.world === worldId && source.collection === "spells") {
      for (const record of itemRecords(source)) {
        if (record.value?.type === "spell") worldSpells.push(documentEntry(source, record, "world-spell"));
      }
    }
    if (source.scope === "world-data" && source.world === worldId && source.collection === "actors") {
      for (const record of actorItemRecords(source)) {
        if (record.value?.type === "spell") actorSpells.push(documentEntry(source, record, "actor-spell"));
      }
    }
  }
  const sortRows = rows => rows.sort((left, right) => `${left.definitionId}:${left.actorId}:${left.id}`.localeCompare(`${right.definitionId}:${right.actorId}:${right.id}`));
  for (const rows of [systemAbilities, systemSpells, worldSpells, actorSpells]) sortRows(rows);
  const canonicalDefinitions = [...systemAbilities, ...systemSpells, ...worldSpells];
  const duplicateIds = duplicateDefinitionIds(canonicalDefinitions);
  const proposedDefinitions = [
    ...systemAbilities.map(entry => ({ ...entry, definitionId: entry.proposedDefinitionId })),
    ...systemSpells.map(entry => ({ ...entry, definitionId: entry.proposedDefinitionId })),
    ...worldSpells.map(entry => ({ ...entry, definitionId: entry.proposedDefinitionId }))
  ];
  const duplicateProposedIds = duplicateDefinitionIds(proposedDefinitions);
  const invalidDefinitionIds = canonicalDefinitions.filter(entry => !DEFINITION_ID_PATTERN.test(entry.definitionId));
  const missingSpellScopes = worldSpells.filter(entry => !entry.proposedDefinitionId);
  const actorSnapshotsWithoutProvenance = actorSpells.filter(entry => !entry.provenanceDefinitionId || !entry.provenanceSourceUuid);
  const cohorts = Object.freeze({
    systemAbilities: Object.freeze(systemAbilities),
    systemSpells: Object.freeze(systemSpells),
    worldSpells: Object.freeze(worldSpells),
    actorSpells: Object.freeze(actorSpells)
  });
  const summary = Object.freeze({
    systemAbilityDefinitions: systemAbilities.length,
    systemSpellDefinitions: systemSpells.length,
    worldSpellDefinitions: worldSpells.length,
    actorSpellSnapshots: actorSpells.length,
    distinctCanonicalDefinitionIds: new Set(canonicalDefinitions.map(entry => entry.definitionId).filter(Boolean)).size,
    duplicateCanonicalDefinitionIds: duplicateIds.length,
    invalidCanonicalDefinitionIds: invalidDefinitionIds.length,
    proposedCanonicalDefinitionIds: new Set(proposedDefinitions.map(entry => entry.definitionId).filter(Boolean)).size,
    duplicateProposedDefinitionIds: duplicateProposedIds.length,
    worldSpellsMissingCanonicalScope: missingSpellScopes.length,
    worldSpellIdentityRemapCandidates: worldSpells.filter(entry => entry.proposedDefinitionId && entry.proposedDefinitionId !== entry.definitionId).length,
    systemAbilityContractCandidates: systemAbilities.filter(entry => !entry.completeActionContract).length,
    worldSpellRelocationCandidates: worldSpells.length,
    worldSpellContractCandidates: worldSpells.filter(entry => !entry.completeActionContract).length,
    canonicalDefinitionsWithLegacyCurrentLevel: canonicalDefinitions.filter(entry => entry.legacyCurrentLevel !== null).length,
    actorSnapshotsWithoutProvenance: actorSnapshotsWithoutProvenance.length
  });
  return Object.freeze({
    version: 1,
    ok: duplicateIds.length === 0 && invalidDefinitionIds.length === 0 && duplicateProposedIds.length === 0 && missingSpellScopes.length === 0,
    summary,
    fieldPresence: Object.freeze({
      systemAbilities: fieldPresence(systemAbilities),
      systemSpells: fieldPresence(systemSpells),
      worldSpells: fieldPresence(worldSpells),
      actorSpells: fieldPresence(actorSpells)
    }),
    shapes: Object.freeze({
      systemAbilities: shapeGroups(systemAbilities),
      systemSpells: shapeGroups(systemSpells),
      worldSpells: shapeGroups(worldSpells),
      actorSpells: shapeGroups(actorSpells)
    }),
    cohorts,
    findings: Object.freeze({
      duplicateDefinitionIds: duplicateIds,
      duplicateProposedDefinitionIds: duplicateProposedIds,
      invalidDefinitionIds: Object.freeze(invalidDefinitionIds),
      worldSpellsMissingCanonicalScope: Object.freeze(missingSpellScopes),
      actorSnapshotsWithoutProvenance: Object.freeze(actorSnapshotsWithoutProvenance)
    })
  });
}

function fieldPresenceRow(label, entries, presence) {
  return `| ${label} | ${entries.length} | ${CANONICAL_FIELDS.map(field => `${presence[field]}/${entries.length}`).join(" | ")} |`;
}

export function renderAbilitySpellInventoryMarkdown(report) {
  const { summary, cohorts, fieldPresence: presence } = report;
  const lines = [
    "# Veilrunner V14 Ability and Spell Source Inventory",
    "",
    `System snapshot: \`${report.source?.systemSnapshot ?? ""}\``,
    `World snapshot: \`${report.source?.worldSnapshot ?? ""}\``,
    "",
    "## Summary",
    "",
    `- System ability definitions: ${summary.systemAbilityDefinitions}`,
    `- System spell definitions: ${summary.systemSpellDefinitions}`,
    `- World spell definitions awaiting canonical relocation: ${summary.worldSpellDefinitions}`,
    `- Actor-owned spell snapshots: ${summary.actorSpellSnapshots}`,
    `- Distinct / duplicate / invalid canonical definition IDs: ${summary.distinctCanonicalDefinitionIds} / ${summary.duplicateCanonicalDefinitionIds} / ${summary.invalidCanonicalDefinitionIds}`,
    `- Proposed canonical IDs / proposal collisions / missing spell scopes: ${summary.proposedCanonicalDefinitionIds} / ${summary.duplicateProposedDefinitionIds} / ${summary.worldSpellsMissingCanonicalScope}`,
    `- World spell identity remaps: ${summary.worldSpellIdentityRemapCandidates}`,
    `- Ability / spell Action-contract candidates: ${summary.systemAbilityContractCandidates} / ${summary.worldSpellContractCandidates}`,
    `- Canonical definitions carrying legacy current level: ${summary.canonicalDefinitionsWithLegacyCurrentLevel}`,
    `- Actor snapshots missing complete provenance: ${summary.actorSnapshotsWithoutProvenance}`,
    "",
    "## Shared contract field presence",
    "",
    `| Cohort | Count | ${CANONICAL_FIELDS.join(" | ")} |`,
    `|---|---:|${CANONICAL_FIELDS.map(() => "---:").join("|")}|`,
    fieldPresenceRow("System abilities", cohorts.systemAbilities, presence.systemAbilities),
    fieldPresenceRow("System spells", cohorts.systemSpells, presence.systemSpells),
    fieldPresenceRow("World spells", cohorts.worldSpells, presence.worldSpells),
    fieldPresenceRow("Actor spells", cohorts.actorSpells, presence.actorSpells),
    "",
    "## Canonical source rows",
    "",
    "| Cohort | Name | Type | Current definition ID | Proposed definition ID | Missing contracts |",
    "|---|---|---|---|---|---|",
    ...[...cohorts.systemAbilities, ...cohorts.systemSpells, ...cohorts.worldSpells].map(entry =>
      `| ${entry.cohort} | ${entry.name} | ${entry.type} | \`${entry.definitionId}\` | \`${entry.proposedDefinitionId || "unresolved"}\` | ${entry.missingContracts.join(", ") || "none"} |`
    ),
    "",
    "## Actor-owned spell snapshots",
    "",
    "| Actor | Name | Current / proposed definition ID | Compendium source | Provenance definition/source |",
    "|---|---|---|---|---|",
    ...(cohorts.actorSpells.length ? cohorts.actorSpells.map(entry =>
      `| \`${entry.actorId}\` | ${entry.name} | \`${entry.definitionId}\` / \`${entry.proposedDefinitionId || "unresolved"}\` | \`${entry.compendiumSource || "none"}\` | \`${entry.provenanceDefinitionId || "none"}\` / \`${entry.provenanceSourceUuid || "none"}\` |`
    ) : ["| none | none | none | none | none |"])
  ];
  return `${lines.join("\n")}\n`;
}
