import {
  SPELL_RELOCATION_MAP_SHA256,
  SPELL_RELOCATION_SOURCE_PACK,
  SPELL_RELOCATION_TARGET_PACK,
  SPELL_RELOCATION_VERSION,
  createSpellRelocationMap
} from "./spell-relocation.mjs";

export const SPELL_RETIREMENT_PLAN_VERSION = 1;
export const SPELL_RETIREMENT_POLICY = "external-archive-then-remove-live-source";

const LEGACY_DEFINITION_ID_PATTERN = /^veilrunner\.spell\.[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const LEGACY_UUID_PATTERN = /^Compendium\.world\.spells\.Item\.[A-Za-z0-9]+$/;
const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];
const countBy = (values, keyOf) => {
  const counts = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
};

function validateMapReport(report) {
  if (!report?.ok || report.version !== SPELL_RELOCATION_VERSION || report.mapSha256 !== SPELL_RELOCATION_MAP_SHA256) {
    throw new Error("Spell retirement planning requires the locked, passing version-2 Spell relocation map.");
  }
  const map = createSpellRelocationMap(report.rows, report.actorTargets, {
    expectedDefinitions: 54,
    expectedActorTargets: 2
  });
  return {
    map,
    sourceDefinitionIds: new Set(map.rows.map(row => row.sourceDefinitionId)),
    sourceUuids: new Set(map.rows.map(row => row.sourceUuid))
  };
}

function walkStrings(value, visit, path = "", seen = new WeakSet()) {
  if (typeof value === "string") {
    visit(value, path);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => walkStrings(entry, visit, path ? `${path}.${index}` : String(index), seen));
    return;
  }
  for (const [key, entry] of Object.entries(value)) walkStrings(entry, visit, path ? `${path}.${key}` : key, seen);
}

function decodedOccurrenceKind(source, record, path, tokenType) {
  if (source.scope === "world-manifest" && tokenType === "source-pack") return "legacy-manifest";
  if (path.startsWith("flags.Veilrunner.migrations.spellRelocation")) return "migration-provenance";
  if (path === "_stats.compendiumSource" || /\.items\.\d+\._stats\.compendiumSource$/.test(path)) {
    return "legacy-metadata-provenance";
  }
  if (source.scope === "world-compendium" && source.collection === "spells"
    && tokenType === "source-definition-id" && path === "system.definitionId") {
    return "legacy-definition-source";
  }
  return "active-data-reference";
}

function sourceRecordIdentity(source, record) {
  return {
    scope: text(source.scope),
    world: text(source.world),
    collection: text(source.collection),
    recordKey: text(record.key),
    recordId: text(record.value?._id ?? record.value?.id),
    recordName: text(record.value?.name)
  };
}

function inventoryDecodedSources(sources, targets) {
  const occurrences = [];
  let records = 0;
  for (const source of list(sources)) {
    for (const record of list(source.records)) {
      records += 1;
      walkStrings(record.value, (value, path) => {
        const tokenTypes = [];
        if (value === SPELL_RELOCATION_SOURCE_PACK) tokenTypes.push("source-pack");
        if (LEGACY_DEFINITION_ID_PATTERN.test(value)) {
          tokenTypes.push(targets.sourceDefinitionIds.has(value) ? "source-definition-id" : "unmapped-source-definition-id");
        }
        if (LEGACY_UUID_PATTERN.test(value)) tokenTypes.push(targets.sourceUuids.has(value) ? "source-uuid" : "unmapped-source-uuid");
        for (const tokenType of tokenTypes) occurrences.push(Object.freeze({
          tokenType,
          token: value,
          occurrenceKind: decodedOccurrenceKind(source, record, path, tokenType),
          ...sourceRecordIdentity(source, record),
          path
        }));
      });
    }
  }
  occurrences.sort((left, right) => [
    left.occurrenceKind, left.scope, left.world, left.collection, left.recordKey, left.path, left.token
  ].join(":").localeCompare([
    right.occurrenceKind, right.scope, right.world, right.collection, right.recordKey, right.path, right.token
  ].join(":")));
  return { records, occurrences };
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) if (content.charCodeAt(offset) === 10) line += 1;
  return line;
}

function hasExactTextBoundary(content, offset, token, tokenType) {
  const previous = content[offset - 1] ?? "";
  const next = content[offset + token.length] ?? "";
  const adjacentPattern = tokenType === "source-uuid" ? /[A-Za-z0-9]/ : /[A-Za-z0-9.-]/;
  return !adjacentPattern.test(previous) && !adjacentPattern.test(next);
}

function inventoryTextSources(sources, targets) {
  const occurrences = [];
  for (const source of list(sources)) {
    const content = String(source.content ?? "");
    const pushOccurrence = (tokenType, token, offset) => occurrences.push(Object.freeze({
      tokenType,
      token,
      occurrenceKind: text(source.classification) || "unclassified-text",
      file: text(source.file),
      line: lineNumberAt(content, offset)
    }));
    for (const [tokenType, token] of [
      ["source-pack", SPELL_RELOCATION_SOURCE_PACK],
      ["source-definition-prefix", "veilrunner.spell."],
      ["source-uuid-prefix", "Compendium.world.spells."],
      ["source-uuid-prefix", "Compendium.world.spells.Item."]
    ]) {
      let offset = 0;
      while ((offset = content.indexOf(token, offset)) !== -1) {
        if (hasExactTextBoundary(content, offset, token, tokenType)) pushOccurrence(tokenType, token, offset);
        offset += token.length;
      }
    }
    for (const [tokenType, pattern, mapped] of [
      ["source-definition-id", /veilrunner\.spell\.[a-z0-9]+(?:[.-][a-z0-9]+)*/g, targets.sourceDefinitionIds],
      ["source-uuid", /Compendium\.world\.spells\.Item\.[A-Za-z0-9]+/g, targets.sourceUuids]
    ]) {
      for (const match of content.matchAll(pattern)) {
        if (!hasExactTextBoundary(content, match.index, match[0], tokenType)) continue;
        pushOccurrence(mapped.has(match[0]) ? tokenType : `unmapped-${tokenType}`, match[0], match.index);
      }
    }
  }
  occurrences.sort((left, right) => [left.occurrenceKind, left.file, left.line, left.tokenType, left.token].join(":")
    .localeCompare([right.occurrenceKind, right.file, right.line, right.tokenType, right.token].join(":")));
  return occurrences;
}

/** Inventory exact legacy Spell tokens in decoded snapshots and repository text without opening or writing databases. */
export function inventoryLegacySpellTokens(mapReport, decodedSources = [], textSources = []) {
  const targets = validateMapReport(mapReport);
  const decoded = inventoryDecodedSources(decodedSources, targets);
  const repository = inventoryTextSources(textSources, targets);
  const activeDecoded = decoded.occurrences.filter(entry => entry.occurrenceKind === "active-data-reference");
  const activeText = repository.filter(entry => entry.occurrenceKind === "active-runtime");
  const unmappedDecoded = decoded.occurrences.filter(entry => entry.tokenType.startsWith("unmapped-"));
  const unmappedRepository = repository.filter(entry => entry.tokenType.startsWith("unmapped-"));
  return Object.freeze({
    ok: activeDecoded.length === 0 && activeText.length === 0 && unmappedDecoded.length === 0,
    version: SPELL_RETIREMENT_PLAN_VERSION,
    summary: Object.freeze({
      lockedDefinitions: targets.map.rows.length,
      lockedActorTargets: targets.map.actorTargets.length,
      decodedSources: list(decodedSources).length,
      decodedRecords: decoded.records,
      decodedOccurrences: decoded.occurrences.length,
      repositoryFiles: list(textSources).length,
      repositoryOccurrences: repository.length,
      activeDataReferences: activeDecoded.length,
      activeRuntimeReferences: activeText.length,
      unmappedDecodedTokens: unmappedDecoded.length,
      unmappedRepositoryTokens: unmappedRepository.length,
      decodedByKind: countBy(decoded.occurrences, entry => entry.occurrenceKind),
      repositoryByKind: countBy(repository, entry => entry.occurrenceKind),
      decodedByTokenType: countBy(decoded.occurrences, entry => entry.tokenType),
      repositoryByTokenType: countBy(repository, entry => entry.tokenType)
    }),
    decodedOccurrences: Object.freeze(decoded.occurrences),
    repositoryOccurrences: Object.freeze(repository),
    activeDecoded: Object.freeze(activeDecoded),
    activeText: Object.freeze(activeText),
    unmappedDecoded: Object.freeze(unmappedDecoded),
    unmappedRepository: Object.freeze(unmappedRepository)
  });
}

function exactLegacyPack(worldManifest) {
  const candidates = list(worldManifest?.packs).filter(pack => pack?.id === SPELL_RELOCATION_SOURCE_PACK
    || pack?.name === "spells" || pack?.path === "packs/spells");
  if (candidates.length !== 1) throw new Error(`Expected exactly one legacy Spell pack manifest entry, found ${candidates.length}.`);
  const pack = candidates[0];
  const expected = {
    id: SPELL_RELOCATION_SOURCE_PACK,
    name: "spells",
    path: "packs/spells",
    type: "Item",
    system: "Veilrunner",
    package: "world",
    packageType: "world"
  };
  for (const [key, value] of Object.entries(expected)) {
    if (pack?.[key] !== value) throw new Error(`Legacy Spell pack manifest ${key} drifted: expected ${value}, found ${pack?.[key]}.`);
  }
  return pack;
}

/** Lock the non-mutating retirement contract. This function prepares no filesystem or document updates. */
export function createSpellRetirementPlan({
  mapReport,
  inventory,
  worldManifest,
  sourceSnapshot,
  manifestBeforeSha256,
  manifestAfterSha256,
  packEntrySha256,
  storeTreeSha256,
  inventorySha256,
  systemTreeSha256,
  worldTreeSha256,
  systemFiles,
  systemBytes,
  worldFiles,
  worldBytes,
  relocationSummary,
  storeFiles = []
} = {}) {
  const targets = validateMapReport(mapReport);
  if (!inventory?.ok) throw new Error("Legacy Spell retirement refuses active runtime or decoded-data references.");
  if (worldManifest?.id !== "veilrunner" || worldManifest?.system !== "Veilrunner") {
    throw new Error("Legacy Spell retirement is locked to the Veilrunner world using the Veilrunner system.");
  }
  const pack = exactLegacyPack(worldManifest);
  const files = list(storeFiles).map(file => Object.freeze({
    name: text(file.name),
    length: Number(file.length),
    sha256: text(file.sha256).toLowerCase()
  }));
  if (!files.length || files.some(file => !file.name || !Number.isSafeInteger(file.length) || file.length < 0 || !/^[a-f0-9]{64}$/.test(file.sha256))) {
    throw new Error("Legacy Spell retirement requires a complete hashed source-store file inventory.");
  }
  for (const [label, digest] of Object.entries({
    manifestBeforeSha256,
    manifestAfterSha256,
    packEntrySha256,
    storeTreeSha256,
    inventorySha256,
    systemTreeSha256,
    worldTreeSha256
  })) {
    if (!/^[a-f0-9]{64}$/.test(text(digest).toLowerCase())) throw new Error(`Legacy Spell retirement requires a valid ${label}.`);
  }
  for (const [label, value] of Object.entries({ systemFiles, systemBytes, worldFiles, worldBytes })) {
    if (!Number.isSafeInteger(Number(value)) || Number(value) < 1) throw new Error(`Legacy Spell retirement requires a positive ${label}.`);
  }
  const expectedRelocation = {
    sourceDefinitions: 54,
    pendingDefinitionCreates: 0,
    appliedDefinitions: 54,
    actorTargets: 2,
    pendingActorUpdates: 0,
    appliedActorTargets: 2
  };
  for (const [key, value] of Object.entries(expectedRelocation)) {
    if (Number(relocationSummary?.[key]) !== value) {
      throw new Error(`Legacy Spell retirement requires relocation ${key}=${value}, found ${relocationSummary?.[key]}.`);
    }
  }
  const remainingPacks = list(worldManifest.packs).filter(entry => entry !== pack);
  return Object.freeze({
    ok: true,
    version: SPELL_RETIREMENT_PLAN_VERSION,
    policy: SPELL_RETIREMENT_POLICY,
    destructiveExecutionApproved: false,
    source: Object.freeze({
      snapshot: text(sourceSnapshot),
      worldId: worldManifest.id,
      systemId: worldManifest.system,
      relocationMapSha256: SPELL_RELOCATION_MAP_SHA256,
      manifestBeforeSha256: text(manifestBeforeSha256).toLowerCase(),
      packEntrySha256: text(packEntrySha256).toLowerCase(),
      storeTreeSha256: text(storeTreeSha256).toLowerCase(),
      inventorySha256: text(inventorySha256).toLowerCase(),
      systemTreeSha256: text(systemTreeSha256).toLowerCase(),
      worldTreeSha256: text(worldTreeSha256).toLowerCase()
    }),
    summary: Object.freeze({
      legacyDefinitions: targets.map.rows.length,
      actorTargets: targets.map.actorTargets.length,
      manifestPacksBefore: list(worldManifest.packs).length,
      manifestPacksAfter: remainingPacks.length,
      storeFiles: files.length,
      storeBytes: files.reduce((sum, file) => sum + file.length, 0),
      systemFiles: Number(systemFiles),
      systemBytes: Number(systemBytes),
      worldFiles: Number(worldFiles),
      worldBytes: Number(worldBytes),
      relocation: Object.freeze({ ...expectedRelocation }),
      activeRuntimeReferences: inventory.summary.activeRuntimeReferences,
      activeDataReferences: inventory.summary.activeDataReferences
    }),
    intendedDelta: Object.freeze({
      manifest: Object.freeze({
        operation: "remove-exact-entry",
        pack: structuredClone(pack),
        afterSha256: text(manifestAfterSha256).toLowerCase(),
        allOtherManifestFields: "deep-equal JSON values"
      }),
      store: Object.freeze({
        operation: "remove-exact-directory-after-verified-external-archive",
        relativePath: "packs/spells",
        files: Object.freeze(files),
        canonicalSystemPack: SPELL_RELOCATION_TARGET_PACK
      })
    }),
    refusalConditions: Object.freeze([
      "explicit user approval is absent",
      "FoundryVTT or Electron is running",
      "fresh external pre-retirement archive is absent or hash verification fails",
      "locked relocation map, manifest entry, manifest source, store tree, or exact-token inventory drifts",
      "any active runtime or decoded-data legacy Spell reference exists",
      "the 54 canonical definitions or two Actor snapshots are not independently revalidated at their locked target digests",
      "the canonical system pack or any unrelated world database differs from the pre-retirement baseline"
    ]),
    proofContract: Object.freeze({
      disposableCloneFirst: true,
      canonicalSystemPacks: "13/13 decoded-identical with unique-abilities remaining at 61 rows",
      actorSnapshots: "both locked Firebolt rows remain at their version-2 target digests",
      unrelatedWorldStores: "all 20 non-spells world stores decoded-identical",
      worldManifest: "only the exact world.spells pack entry is removed",
      rollback: "restore the exact pre-retirement world.json and packs/spells directory from the verified external archive"
    })
  });
}

function bulletsFromCounts(counts) {
  const entries = Object.entries(counts ?? {});
  return entries.length ? entries.map(([key, value]) => `  - ${key}: ${value}`) : ["  - none"];
}

export function renderSpellRetirementPlanMarkdown(plan, inventory) {
  const lines = [
    "# Veilrunner V14 Legacy Spell Retirement Plan",
    "",
    `Status: **${plan.ok ? "PLAN LOCKED; LIVE RETIREMENT NOT APPROVED" : "BLOCKED"}**`,
    "",
    `Planning source: \`${plan.source.snapshot}\``,
    `Policy: \`${plan.policy}\``,
    `Spell relocation map: \`${plan.source.relocationMapSha256}\``,
    "",
    "## Decision",
    "",
    "Archive the complete legacy world manifest and `packs/spells` store outside the live world, verify the archive byte-for-byte, then remove the exact `world.spells` manifest entry and live store in a later explicitly approved retirement run. Do not retain the pack mounted as historical data: mounted data remains discoverable and mutable.",
    "",
    "## Exact-token inventory",
    "",
    `- Locked legacy definitions / Actor targets: ${inventory.summary.lockedDefinitions} / ${inventory.summary.lockedActorTargets}`,
    `- Decoded sources / records / occurrences: ${inventory.summary.decodedSources} / ${inventory.summary.decodedRecords} / ${inventory.summary.decodedOccurrences}`,
    `- Repository files / occurrences: ${inventory.summary.repositoryFiles} / ${inventory.summary.repositoryOccurrences}`,
    `- Active runtime / decoded-data references: ${inventory.summary.activeRuntimeReferences} / ${inventory.summary.activeDataReferences}`,
    `- Unmapped decoded / repository-only fixture tokens: ${inventory.summary.unmappedDecodedTokens} / ${inventory.summary.unmappedRepositoryTokens}`,
    `- Full inventory SHA-256: \`${plan.source.inventorySha256}\``,
    "- Decoded occurrences by role:",
    ...bulletsFromCounts(inventory.summary.decodedByKind),
    "- Repository occurrences by role:",
    ...bulletsFromCounts(inventory.summary.repositoryByKind),
    "",
    "## Locked destructive delta (not executed)",
    "",
    `- World manifest: remove one exact \`world.spells\` entry (${plan.summary.manifestPacksBefore} packs -> ${plan.summary.manifestPacksAfter}).`,
    `- Legacy store: remove \`packs/spells\` only after archive verification (${plan.summary.storeFiles} files, ${plan.summary.storeBytes} bytes).`,
    `- Manifest before / after normalized-JSON SHA-256: \`${plan.source.manifestBeforeSha256}\` / \`${plan.intendedDelta.manifest.afterSha256}\`.`,
    `- Manifest entry normalized-JSON SHA-256: \`${plan.source.packEntrySha256}\`.`,
    `- Store-tree SHA-256: \`${plan.source.storeTreeSha256}\`.`,
    `- Full system/world tree SHA-256: \`${plan.source.systemTreeSha256}\` / \`${plan.source.worldTreeSha256}\`.`,
    `- Full system/world files: ${plan.summary.systemFiles} / ${plan.summary.worldFiles}.`,
    `- Relocation state: ${plan.summary.relocation.appliedDefinitions}/${plan.summary.relocation.sourceDefinitions} canonical definitions and ${plan.summary.relocation.appliedActorTargets}/${plan.summary.relocation.actorTargets} Actor targets applied.`,
    "- Canonical `Veilrunner.unique-abilities`, Actor snapshots, all other system packs, and all unrelated world stores must remain unchanged.",
    "",
    "## Refusal conditions",
    "",
    ...plan.refusalConditions.map(condition => `- Refuse if ${condition}.`),
    "",
    "## Trial, proof, and rollback contract",
    "",
    "1. Recheck closure and create a fresh external pre-retirement archive.",
    "2. Re-run this exact-token inventory and all relocation target-digest checks.",
    "3. Trial only on a hash-verified disposable clone.",
    "4. Prove the only decoded/configuration delta is removal of the legacy manifest entry and store.",
    "5. Obtain explicit approval before applying the same locked operation to the live world.",
    "6. Roll back by restoring the exact archived `world.json` and `packs/spells` directory, then re-run the same comparisons.",
    "",
    "## Approval boundary",
    "",
    "This artifact does not authorize or implement deletion. No retirement executor should be written and no live manifest/store should be changed until the destructive plan is explicitly approved."
  ];
  return `${lines.join("\n")}\n`;
}
