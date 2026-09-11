import {
  ArchitectureValidationError
} from "./validation.mjs";
import { canonicalIdBuilder } from "./canonical-id.mjs";
import { ammunitionAcquisitionQuantity } from "../../items/ammunition-quantity.mjs";

export const DEFINITION_PROVENANCE_FLAG_PATH = "flags.Veilrunner.provenance";
export const DEFINITION_SNAPSHOT_VERSION = 1;

function sourceObject(source) {
  const data = typeof source?.toObject === "function" ? source.toObject() : source;
  return globalThis.structuredClone ? structuredClone(data ?? {}) : JSON.parse(JSON.stringify(data ?? {}));
}

export function definitionProvenance(source, {
  sourceVersion = "",
  snapshotVersion = DEFINITION_SNAPSHOT_VERSION
} = {}) {
  const definitionId = String(source?.system?.definitionId ?? source?._source?.system?.definitionId ?? "");
  const validation = canonicalIdBuilder.validate(definitionId);
  if (!validation.ok) throw new ArchitectureValidationError("Cannot snapshot a definition without a valid canonical ID.", validation);
  const sourceUuid = String(source?.uuid ?? source?._source?.uuid ?? "");
  if (!sourceUuid) throw new TypeError("Cannot snapshot a definition without a Foundry source UUID.");
  return Object.freeze({
    definitionId,
    sourceUuid,
    sourceVersion: String(sourceVersion ?? ""),
    snapshotVersion: Math.max(1, Math.trunc(Number(snapshotVersion) || 1))
  });
}

/** Prepare, but do not persist, a complete Actor-owned Item snapshot. */
export function prepareActorOwnedSnapshot(source, {
  sourceVersion = "",
  snapshotVersion = DEFINITION_SNAPSHOT_VERSION,
  currentLevel = undefined
} = {}) {
  const data = sourceObject(source);
  const provenance = definitionProvenance(source, { sourceVersion, snapshotVersion });
  delete data._id;
  data.flags ??= {};
  data.flags.core ??= {};
  data.flags.core.sourceId = provenance.sourceUuid;
  data.flags.Veilrunner ??= {};
  data.flags.Veilrunner.provenance = { ...provenance };
  data.system ??= {};
  data.system.definitionId = provenance.definitionId;
  const ammunitionQuantity = ammunitionAcquisitionQuantity(source);
  if (ammunitionQuantity !== null) data.system.quantity = ammunitionQuantity;
  if (currentLevel !== undefined) {
    data.system.owned ??= {};
    data.system.owned.currentLevel = Math.max(0, Math.trunc(Number(currentLevel) || 0));
  }
  return data;
}
