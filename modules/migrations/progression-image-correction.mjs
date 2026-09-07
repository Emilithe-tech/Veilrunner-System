export const PROGRESSION_IMAGE_CORRECTION_VERSION = 1;
export const PROGRESSION_IMAGE_CORRECTION_COLLECTION = "Veilrunner.progression";
export const PROGRESSION_IMAGE_SOURCE = "icons/svg/tree.svg";
export const PROGRESSION_IMAGE_TARGET = "icons/svg/levels.svg";

export const PROGRESSION_IMAGE_CORRECTION_DOCUMENTS = Object.freeze([
  Object.freeze({
    key: "!items!dd361179422ac054",
    documentId: "dd361179422ac054",
    definitionId: "veilrunner.progression.magic",
    name: "Magic Progression",
    type: "progression",
    sourceSha256: "c4d7b0bfc19a9ff41734753a3e6720648560c8844baa637fe0eb50d6393d5201"
  }),
  Object.freeze({
    key: "!items!6bed8e80c76f980d",
    documentId: "6bed8e80c76f980d",
    definitionId: "veilrunner.progression.skills",
    name: "Skills Progression",
    type: "progression",
    sourceSha256: "64509d03211cffc5f4fa5880f6c421a1aba75a769270fc8aa2bfac91fe7284f0"
  })
]);

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const compare = (left, right) => left.localeCompare(right);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function sha256(digest, value, label) {
  if (typeof digest !== "function") throw new TypeError("Progression image correction requires a SHA-256 digest function.");
  const result = String(digest(value) ?? "").trim().toLowerCase();
  if (!SHA256_PATTERN.test(result)) {
    throw new ProgressionImageCorrectionError(`Invalid SHA-256 digest for ${label}.`, { digest: result });
  }
  return result;
}

function sortedRows(rows) {
  if (!Array.isArray(rows)) throw new ProgressionImageCorrectionError("Progression image correction requires decoded LevelDB rows.");
  const normalized = rows.map(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string" || !entry[1] || typeof entry[1] !== "object") {
      throw new ProgressionImageCorrectionError("Progression image correction received an invalid decoded row.");
    }
    return [entry[0], structuredClone(entry[1])];
  }).sort(([left], [right]) => compare(left, right));
  const keys = normalized.map(([key]) => key);
  if (new Set(keys).size !== keys.length) throw new ProgressionImageCorrectionError("Progression image correction received duplicate LevelDB keys.");
  return normalized;
}

function validatePackShape(rows) {
  if (rows.length !== 53) {
    throw new ProgressionImageCorrectionError(`Canonical Progression pack row count drifted: expected 53, found ${rows.length}.`);
  }
  const items = rows.filter(([key]) => key.startsWith("!items!"));
  const practices = items.filter(([, value]) => value.type === "practice");
  const progressions = items.filter(([, value]) => value.type === "progression");
  if (items.length !== 53 || practices.length !== 51 || progressions.length !== 2) {
    throw new ProgressionImageCorrectionError("Canonical Progression pack type inventory drifted.", {
      rows: rows.length,
      items: items.length,
      practices: practices.length,
      progressions: progressions.length
    });
  }
}

function assertIdentity(document, contract) {
  const actual = {
    documentId: document?._id,
    definitionId: document?.system?.definitionId,
    name: document?.name,
    type: document?.type
  };
  for (const key of Object.keys(actual)) {
    if (actual[key] !== contract[key]) {
      throw new ProgressionImageCorrectionError(`Progression image correction identity drifted for ${contract.key}.`, {
        key,
        expected: contract[key],
        actual: actual[key]
      });
    }
  }
}

export class ProgressionImageCorrectionError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ProgressionImageCorrectionError";
    this.details = details;
  }
}

/**
 * Build a non-mutating, fail-closed correction plan over already decoded rows.
 * `contracts` is injectable only so the pure planner can be tested with small fixtures;
 * production callers use the sealed two-document contract above.
 */
export function createLockedProgressionImageCorrectionPlan({
  rows,
  digest,
  contracts = PROGRESSION_IMAGE_CORRECTION_DOCUMENTS,
  validateShape = contracts === PROGRESSION_IMAGE_CORRECTION_DOCUMENTS
} = {}) {
  const sourceRows = sortedRows(rows);
  if (validateShape) validatePackShape(sourceRows);
  if (!Array.isArray(contracts) || contracts.length !== 2) {
    throw new ProgressionImageCorrectionError("Progression image correction requires exactly two locked document contracts.");
  }
  const byKey = new Map(sourceRows);
  const corrections = contracts.map(contract => {
    const document = byKey.get(contract.key);
    if (!document) throw new ProgressionImageCorrectionError(`Progression image correction target is missing: ${contract.key}.`);
    assertIdentity(document, contract);

    const sourceDocument = structuredClone(document);
    sourceDocument.img = PROGRESSION_IMAGE_SOURCE;
    const sourceSha256 = sha256(digest, sourceDocument, `${contract.key} source`);
    if (sourceSha256 !== contract.sourceSha256) {
      throw new ProgressionImageCorrectionError(`Progression image correction source hash drifted for ${contract.key}.`, {
        expected: contract.sourceSha256,
        actual: sourceSha256
      });
    }

    const targetDocument = structuredClone(sourceDocument);
    targetDocument.img = PROGRESSION_IMAGE_TARGET;
    const targetSha256 = sha256(digest, targetDocument, `${contract.key} target`);
    const currentSha256 = sha256(digest, document, `${contract.key} current`);
    const state = currentSha256 === sourceSha256 && document.img === PROGRESSION_IMAGE_SOURCE
      ? "source"
      : currentSha256 === targetSha256 && document.img === PROGRESSION_IMAGE_TARGET
        ? "applied"
        : "conflict";
    if (state === "conflict") {
      throw new ProgressionImageCorrectionError(`Progression image correction target has an unrecognized value: ${contract.key}.`, {
        currentImage: document.img,
        currentSha256,
        sourceSha256,
        targetSha256
      });
    }
    return {
      ...structuredClone(contract),
      state,
      sourceSha256,
      targetSha256,
      sourceDocument,
      targetDocument
    };
  });

  const states = new Set(corrections.map(entry => entry.state));
  if (states.size !== 1) {
    throw new ProgressionImageCorrectionError("Progression image correction found a partial two-document state.", {
      states: corrections.map(entry => ({ key: entry.key, state: entry.state }))
    });
  }
  const state = corrections[0].state;
  const targetByKey = new Map(corrections.map(entry => [entry.key, entry.targetDocument]));
  const targetRows = sourceRows.map(([key, value]) => [key, structuredClone(targetByKey.get(key) ?? value)]);
  return deepFreeze({
    planVersion: PROGRESSION_IMAGE_CORRECTION_VERSION,
    collection: PROGRESSION_IMAGE_CORRECTION_COLLECTION,
    state,
    sourceImage: PROGRESSION_IMAGE_SOURCE,
    targetImage: PROGRESSION_IMAGE_TARGET,
    sourceRowsSha256: sha256(digest, sourceRows, "source pack rows"),
    targetRowsSha256: sha256(digest, targetRows, "target pack rows"),
    corrections,
    operations: state === "source"
      ? corrections.map(entry => ({ type: "put", key: entry.key, value: structuredClone(entry.targetDocument) }))
      : [],
    targetRows
  });
}

export function createProgressionImageCorrectionPlan(options = {}) {
  return createLockedProgressionImageCorrectionPlan({
    ...options,
    contracts: PROGRESSION_IMAGE_CORRECTION_DOCUMENTS,
    validateShape: true
  });
}
