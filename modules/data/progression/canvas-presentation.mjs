export const PROGRESSION_CANVAS_PRESENTATION_VERSION = 2;

const COLLECTIONS = Object.freeze({
  practice: ["Veilrunner.character-library"],
  spell: ["Veilrunner.character-library"],
  skill: ["Veilrunner.character-library"]
});
const OUTCOME_COPY = Object.freeze({
  previewed: { tone: "success", heading: "Canonical candidate validated" },
  committed: { tone: "success", heading: "Canonical write committed" },
  blocked: { tone: "warning", heading: "Canonical write blocked" },
  refused: { tone: "danger", heading: "Canonical write refused" },
  "rolled-back": { tone: "warning", heading: "Canonical write rolled back" },
  partial: { tone: "danger", heading: "Canonical write partially recovered" },
  unknown: { tone: "danger", heading: "Canonical write outcome unknown" }
});

const clone = value => {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
};
const text = value => String(value ?? "").trim();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function identities(outcome) {
  return [
    ["Definition ID", outcome?.definitionId],
    ["Definition document", outcome?.definitionDocumentId],
    ["Progression", outcome?.progressionId],
    ["Graph node", outcome?.nodeId]
  ].filter(([, value]) => text(value)).map(([label, value]) => ({ label, value: text(value) }));
}

function normalizedEntries(entries = []) {
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => typeof entry === "string"
    ? { step: text(entry), status: "recorded", message: "" }
    : { step: text(entry?.step), status: text(entry?.status), message: text(entry?.message) }
  ).filter(entry => entry.step || entry.status || entry.message);
}

/** Project every adapter outcome into one accessible, presentation-only model. */
export function progressionCanvasOutcomeView(outcome = {}) {
  const state = Object.hasOwn(OUTCOME_COPY, text(outcome?.state)) ? text(outcome.state) : "unknown";
  const copy = OUTCOME_COPY[state];
  const message = text(outcome?.message) || (state === "previewed"
    ? "No persistent write was attempted."
    : state === "committed"
      ? "The canonical transaction completed."
      : "The canonical transaction did not complete.");
  return deepFreeze({
    version: PROGRESSION_CANVAS_PRESENTATION_VERSION,
    state,
    tone: copy.tone,
    heading: copy.heading,
    message,
    code: text(outcome?.code),
    stage: text(outcome?.stage),
    issues: Array.isArray(outcome?.issues) ? clone(outcome.issues) : [],
    operation: text(outcome?.operation),
    page: text(outcome?.page),
    identities: identities(outcome),
    nodeIds: Array.isArray(outcome?.nodeIds) ? clone(outcome.nodeIds) : [],
    edgeIds: Array.isArray(outcome?.edgeIds) ? clone(outcome.edgeIds) : [],
    steps: normalizedEntries(outcome?.steps),
    rollback: normalizedEntries(outcome?.rollback),
    receipt: clone(outcome?.receipt ?? null),
    lockSession: clone(outcome?.lockSession ?? null),
    causes: Array.isArray(outcome?.causes) ? clone(outcome.causes) : [],
    announce: `${copy.heading}. ${message}`
  });
}

/** Build the exact review/acknowledgment state without authorizing or dispatching a write. */
export function progressionCanvasConfirmationView({ draft, preview, capabilities, reviewing = false, acknowledged = false } = {}) {
  const operation = text(draft?.intent?.operation);
  const page = text(draft?.intent?.page);
  const type = text(draft?.type);
  const request = draft?.prepared?.request ?? {};
  const matches = Boolean(draft?.prepared && preview?.prepared) && JSON.stringify(draft.prepared) === JSON.stringify(preview.prepared);
  const valid = preview?.state === "previewed" && ["validated", "unchanged"].includes(preview.status)
    && matches && ["create-content", "place-existing", "remove-node", "update-layout", "replace-connections"].includes(operation);
  const authorized = capabilities?.liveMutationApproved === true && capabilities?.commit === true;
  const edgeCount = Array.isArray(request?.edges) ? request.edges.length : 0;
  const definitionId = text(draft?.definitionId ?? request?.definitionId);
  const nodeId = text(draft?.nodeId ?? request?.nodeId);
  const changes = !valid ? [] : operation === "create-content" || operation === "place-existing" ? [
    operation === "create-content" ? `Create canonical ${type} definition ${definitionId}.` : `Link existing canonical definition ${definitionId}; do not create or edit its content.`,
    `Add graph node ${nodeId} to the ${page} Progression.`,
    `Add ${edgeCount} incoming graph edge${edgeCount === 1 ? "" : "s"}.`
  ] : operation === "remove-node" ? [
    `Remove graph node ${nodeId} and its incident edges from the ${page} Progression.`,
    "Preserve the canonical definition and every Actor Item; this is not definition deletion."
  ] : operation === "update-layout" ? (request.positions ?? []).map(entry =>
    `Move ${entry.nodeId} to (${entry.position.x}, ${entry.position.y}) in the ${page} Progression.`
  ) : [
    `Replace the complete ${page} Progression connection set with ${edgeCount} edge${edgeCount === 1 ? "" : "s"}.`,
    ...(preview.preview?.beforeGraph?.edges ?? []).filter(edge => !request.edges.some(next => next.id === edge.id)).map(edge => `Remove connection ${edge.id}.`),
    ...(request.edges ?? []).filter(edge => !(preview.preview?.beforeGraph?.edges ?? []).some(before => before.id === edge.id)).map(edge => `Add connection ${edge.id}.`),
    "Preserve all graph nodes and canonical content definitions."
  ];
  let blockingReason = "Preview a valid canonical candidate before review.";
  if (valid && !reviewing) blockingReason = "Review the exact persistent changes before acknowledgment.";
  else if (valid && reviewing && !acknowledged) blockingReason = "Acknowledge the persistent canonical write before commit.";
  else if (valid && reviewing && acknowledged && !authorized) blockingReason = "Live mutation authorization is not present; no pack lock can open.";
  else if (valid && reviewing && acknowledged && authorized) blockingReason = "";
  if (valid && preview.status === "unchanged") blockingReason = "This preview contains no persistent change.";
  return deepFreeze({
    version: PROGRESSION_CANVAS_PRESENTATION_VERSION,
    stage: !valid ? "preview" : reviewing ? "confirmation" : "review",
    valid,
    authorized,
    acknowledged: acknowledged === true,
    commitEnabled: valid && preview.status !== "unchanged" && reviewing && acknowledged === true && authorized,
    operation,
    page,
    type,
    definitionId,
    nodeId,
    collections: clone(operation === "create-content" ? COLLECTIONS[type] ?? [] : ["Veilrunner.character-library"]),
    changes,
    blockingReason
  });
}
