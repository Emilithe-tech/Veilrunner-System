import {
  CANONICAL_ID_PATTERN,
  CANONICAL_ID_PREFIX,
  canonicalIdBuilder,
  normalizeCanonicalSegment
} from "../data/definitions/canonical-id.mjs";

export const CANONICAL_ID_MAP_VERSION = 1;

const profile = (type, legacyRoots, legacyScopeCount, options = {}) => Object.freeze({
  types: Object.freeze(Array.isArray(type) ? [...type] : [type]),
  legacyRoots: Object.freeze([...legacyRoots]),
  legacyScopeCount,
  ...options
});

/**
 * Explicit conversion rules for every production Item pack. Scope counts are
 * deliberately fixed so a malformed legacy ID cannot silently change meaning.
 */
export const CANONICAL_ID_PACK_PROFILES = Object.freeze({
  archetypes: profile("archetype", ["archetype"], 0),
  backgrounds: profile("background", ["background"], 0),
  disciplines: profile("discipline", ["discipline"], 1, {
    legacyScopeChecks: Object.freeze([{ index: 0, field: "profession" }])
  }),
  languages: profile("language", ["language"], 0),
  origins: profile("origin", ["origin"], 0),
  professions: profile("profession", ["profession"], 0),
  "qualities-perks": profile("quality", ["perk", "flaw"], 0, {
    classificationField: "kind",
    scopeFields: Object.freeze(["pillar"])
  }),
  species: profile("species", ["species"], 1),
  "unique-abilities": profile(["ability", "spell"], ["unique-abilities"], 2),
  "unique-actions": profile("action", ["unique-actions"], 2),
  "unique-reactions": profile("action", ["unique-reactions"], 2),
  "unique-traits": profile("trait", ["unique-traits"], 2)
});

const list = value => Array.isArray(value) ? value : [];
const text = value => String(value ?? "").trim();
const rowKey = row => `${row.pack}:${row.documentId}`;
const compareRows = (left, right) => `${left.pack}:${left.name}:${left.documentId}`.localeCompare(`${right.pack}:${right.name}:${right.documentId}`);

function mappingIssue(code, message, details = {}) {
  return Object.freeze({ code, message, ...details });
}

function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!key) continue;
    const entries = groups.get(key) ?? [];
    entries.push(value);
    groups.set(key, entries);
  }
  return groups;
}

function proposedScopeSources(profile, legacyScopes, system, issues, location) {
  if (!profile.scopeFields) {
    return legacyScopes.map((value, index) => Object.freeze({
      value,
      source: `system.definitionId segment ${index + 2}`
    }));
  }

  return profile.scopeFields.map(field => {
    const value = normalizeCanonicalSegment(system[field]);
    if (!value) {
      issues.push(mappingIssue("canonical-scope-required", `A canonical scope could not be derived from system.${field}.`, {
        ...location,
        field,
        value: system[field] ?? null
      }));
    }
    return Object.freeze({ value, source: `system.${field}` });
  });
}

function mapDocument(pack, document, profile) {
  const documentId = text(document?._id ?? document?.id);
  const name = text(document?.name);
  const type = text(document?.type).toLowerCase();
  const oldDefinitionId = text(document?.system?.definitionId);
  const location = { pack: pack.name, documentId, name, type, oldDefinitionId };
  const issues = [];

  if (!documentId) issues.push(mappingIssue("document-id-required", "The source document has no Foundry document ID.", location));
  if (!profile.types.includes(type)) {
    issues.push(mappingIssue("semantic-type-mismatch", `Expected ${profile.types.join(" or ")} but found ${type || "an empty type"}.`, {
      ...location,
      expectedTypes: profile.types
    }));
  }
  if (!CANONICAL_ID_PATTERN.test(oldDefinitionId)) {
    issues.push(mappingIssue("legacy-definition-id-invalid", "The current definition ID does not match the normalized Veilrunner ID syntax.", location));
  }

  const segments = oldDefinitionId.split(".");
  const legacyRoot = segments[1] ?? "";
  const legacyScopes = segments.slice(2, -1);
  const legacySlug = segments.at(-1) ?? "";
  if (segments[0] !== CANONICAL_ID_PREFIX) {
    issues.push(mappingIssue("legacy-prefix-mismatch", `Expected legacy prefix ${CANONICAL_ID_PREFIX}.`, { ...location, actual: segments[0] ?? "" }));
  }
  if (!profile.legacyRoots.includes(legacyRoot)) {
    issues.push(mappingIssue("legacy-root-mismatch", `Legacy root ${legacyRoot || "(empty)"} is not allowed for ${pack.name}.`, {
      ...location,
      expectedRoots: profile.legacyRoots,
      actual: legacyRoot
    }));
  }
  if (legacyScopes.length !== profile.legacyScopeCount) {
    issues.push(mappingIssue("legacy-scope-count-ambiguous", `Expected ${profile.legacyScopeCount} legacy scope segment(s) but found ${legacyScopes.length}.`, {
      ...location,
      expected: profile.legacyScopeCount,
      actual: legacyScopes.length,
      legacyScopes
    }));
  }

  const system = document?.system && typeof document.system === "object" && !Array.isArray(document.system) ? document.system : {};
  for (const check of profile.legacyScopeChecks ?? []) {
    const fieldScope = normalizeCanonicalSegment(system[check.field]);
    const legacyScope = legacyScopes[check.index] ?? "";
    if (!fieldScope || fieldScope !== legacyScope) {
      issues.push(mappingIssue("legacy-scope-field-ambiguous", `Legacy scope does not agree with system.${check.field}.`, {
        ...location,
        field: check.field,
        fieldScope,
        legacyScope,
        scopeIndex: check.index
      }));
    }
  }

  const classification = profile.classificationField
    ? normalizeCanonicalSegment(system[profile.classificationField])
    : "";
  if (profile.classificationField && !classification) {
    issues.push(mappingIssue("canonical-classification-required", `A canonical classification could not be derived from system.${profile.classificationField}.`, {
      ...location,
      field: profile.classificationField,
      value: system[profile.classificationField] ?? null
    }));
  }
  if (profile.classificationField && classification && legacyRoot !== classification) {
    issues.push(mappingIssue("legacy-classification-ambiguous", `Legacy root ${legacyRoot} does not agree with system.${profile.classificationField}.`, {
      ...location,
      classification,
      legacyRoot
    }));
  }

  const scopeSources = proposedScopeSources(profile, legacyScopes, system, issues, location);
  if (issues.length) return { row: null, issues };

  let proposal;
  try {
    proposal = canonicalIdBuilder.propose({
      type,
      name,
      classification,
      scopes: scopeSources.map(scope => scope.value)
    });
  } catch (error) {
    return {
      row: null,
      issues: [mappingIssue("canonical-proposal-invalid", error?.message ?? "Canonical ID proposal failed.", {
        ...location,
        validation: error?.result ?? null
      })]
    };
  }

  const proposedDefinitionId = proposal.definitionId;
  return {
    issues: [],
    row: Object.freeze({
      pack: pack.name,
      documentId,
      name,
      type,
      oldDefinitionId,
      proposedDefinitionId,
      changed: oldDefinitionId !== proposedDefinitionId,
      legacy: Object.freeze({ root: legacyRoot, scopes: Object.freeze(legacyScopes), slug: legacySlug }),
      canonical: Object.freeze({
        domain: proposal.domain,
        type: proposal.type,
        classification: proposal.classification,
        scopes: proposal.scopes,
        slug: proposal.segments.at(-1)
      }),
      explanation: Object.freeze({
        domain: Object.freeze({ value: proposal.domain, source: `semantic type ${type}` }),
        type: Object.freeze({ value: proposal.type, source: "document.type", emitted: proposal.domain !== proposal.type }),
        classification: Object.freeze({
          value: proposal.classification,
          source: profile.classificationField ? `system.${profile.classificationField}` : "not applicable",
          emitted: Boolean(proposal.classification)
        }),
        scopes: Object.freeze(scopeSources),
        slug: Object.freeze({ value: proposal.segments.at(-1), source: "document.name" })
      }),
      slugChanged: legacySlug !== proposal.segments.at(-1)
    })
  };
}

/**
 * Build a deterministic old-to-new identity map from already-loaded snapshot
 * documents. This function never opens or writes a database.
 */
export function buildCanonicalIdMap(packs = [], { expectedDocuments = null } = {}) {
  const rows = [];
  const rejected = [];
  const issues = [];
  let productionDocuments = 0;
  let fixtureDocuments = 0;

  for (const pack of list(packs)) {
    const documents = list(pack.documents);
    if (pack.role && pack.role !== "content") {
      fixtureDocuments += documents.length;
      continue;
    }
    productionDocuments += documents.length;
    const profile = CANONICAL_ID_PACK_PROFILES[pack.name];
    if (!profile) {
      issues.push(mappingIssue("pack-profile-required", `No canonical ID mapping profile exists for production pack ${pack.name}.`, {
        pack: pack.name,
        documents: documents.length
      }));
      continue;
    }
    for (const document of documents) {
      const result = mapDocument(pack, document, profile);
      if (result.row) rows.push(result.row);
      else rejected.push(Object.freeze({
        pack: pack.name,
        documentId: text(document?._id ?? document?.id),
        name: text(document?.name),
        oldDefinitionId: text(document?.system?.definitionId),
        issues: Object.freeze(result.issues)
      }));
    }
  }

  if (expectedDocuments !== null && productionDocuments !== Number(expectedDocuments)) {
    issues.push(mappingIssue("production-document-count-mismatch", `Expected ${expectedDocuments} production documents but found ${productionDocuments}.`, {
      expected: Number(expectedDocuments),
      actual: productionDocuments
    }));
  }

  rows.sort(compareRows);
  rejected.sort(compareRows);
  const collisions = [];
  const sourceGroups = groupBy(rows, row => row.oldDefinitionId);
  const proposedGroups = groupBy(rows, row => row.proposedDefinitionId);
  for (const [definitionId, matches] of sourceGroups) {
    if (matches.length > 1) collisions.push(mappingIssue("source-definition-id-collision", `Current definition ID appears on ${matches.length} documents.`, {
      definitionId,
      documents: matches.map(rowKey).sort()
    }));
  }
  for (const [definitionId, matches] of proposedGroups) {
    if (matches.length > 1) collisions.push(mappingIssue("proposed-definition-id-collision", `Proposed definition ID would identify ${matches.length} documents.`, {
      definitionId,
      documents: matches.map(rowKey).sort()
    }));
  }
  for (const row of rows) {
    const sourceMatches = sourceGroups.get(row.proposedDefinitionId) ?? [];
    const otherMatches = sourceMatches.filter(match => rowKey(match) !== rowKey(row));
    if (otherMatches.length) collisions.push(mappingIssue("proposed-id-overlaps-current-id", "A proposed ID is still used as another document's current ID.", {
      definitionId: row.proposedDefinitionId,
      proposedBy: rowKey(row),
      currentDocuments: otherMatches.map(rowKey).sort()
    }));
  }
  collisions.sort((left, right) => `${left.code}:${left.definitionId ?? ""}`.localeCompare(`${right.code}:${right.definitionId ?? ""}`));

  const allIssues = Object.freeze([...issues, ...rejected.flatMap(entry => entry.issues), ...collisions]);
  const summary = Object.freeze({
    productionDocuments,
    fixtureDocuments,
    mappedDocuments: rows.length,
    rejectedDocuments: rejected.length,
    changedIds: rows.filter(row => row.changed).length,
    changedSlugs: rows.filter(row => row.slugChanged).length,
    sourceIds: sourceGroups.size,
    proposedIds: proposedGroups.size,
    collisions: collisions.length,
    issues: allIssues.length
  });

  return Object.freeze({
    version: CANONICAL_ID_MAP_VERSION,
    ok: allIssues.length === 0 && rows.length === productionDocuments,
    expectedDocuments,
    summary,
    rows: Object.freeze(rows),
    rejected: Object.freeze(rejected),
    collisions: Object.freeze(collisions),
    issues: allIssues
  });
}

function markdownCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function renderCanonicalIdMapMarkdown(report) {
  const summary = report.summary;
  const lines = [
    "# Veilrunner V14 Canonical ID Map",
    "",
    `Source: \`${report.source || "loaded snapshot documents"}\``,
    "",
    `Status: **${report.ok ? "PASS" : "FAIL"}**`,
    "",
    "## Summary",
    "",
    `- Production / fixture documents: ${summary.productionDocuments} / ${summary.fixtureDocuments}`,
    `- Mapped / rejected documents: ${summary.mappedDocuments} / ${summary.rejectedDocuments}`,
    `- Changed IDs / changed name slugs: ${summary.changedIds} / ${summary.changedSlugs}`,
    `- Unique current / proposed IDs: ${summary.sourceIds} / ${summary.proposedIds}`,
    `- Collisions / total issues: ${summary.collisions} / ${summary.issues}`,
    "",
    "## Findings",
    ""
  ];
  if (!report.issues.length) lines.push("No collisions, ambiguous mappings, rejected documents, or unexplained count changes were found.");
  else for (const issue of report.issues) lines.push(`- **${markdownCell(issue.code)}:** ${markdownCell(issue.message)}`);

  lines.push(
    "",
    "## Explicit old-to-new mapping",
    "",
    "| Pack | Document | Type | Current ID | Proposed ID | Scope evidence | Name slug changed |",
    "|---|---|---|---|---|---|---|"
  );
  for (const row of report.rows) {
    const scopes = row.explanation.scopes.length
      ? row.explanation.scopes.map(scope => `${scope.value} (${scope.source})`).join(", ")
      : "none";
    lines.push(`| ${markdownCell(row.pack)} | ${markdownCell(row.name)} (${markdownCell(row.documentId)}) | ${markdownCell(row.type)} | \`${markdownCell(row.oldDefinitionId)}\` | \`${markdownCell(row.proposedDefinitionId)}\` | ${markdownCell(scopes)} | ${row.slugChanged ? `yes (${markdownCell(row.legacy.slug)} -> ${markdownCell(row.canonical.slug)})` : "no"} |`);
  }
  return `${lines.join("\n")}\n`;
}
