import {
  SPELL_RETIREMENT_PLAN_VERSION,
  SPELL_RETIREMENT_POLICY
} from "./spell-retirement-plan.mjs";
import {
  SPELL_RELOCATION_MAP_SHA256,
  SPELL_RELOCATION_SOURCE_PACK,
  SPELL_RELOCATION_TARGET_PACK
} from "./spell-relocation.mjs";

export const SPELL_RETIREMENT_CONTRACT_VERSION = 1;
export const SPELL_RETIREMENT_JOURNAL_VERSION = 1;
export const SPELL_RETIREMENT_LIVE_APPROVAL_VERSION = 1;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const text = value => String(value ?? "").trim();
const list = value => Array.isArray(value) ? value : [];

export class SpellRetirementError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "SpellRetirementError";
    this.details = details;
  }
}

function assertDigestValue(value, label) {
  const normalized = text(value).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new SpellRetirementError(`Spell retirement contract has an invalid ${label}.`);
  return normalized;
}

/** Validate the immutable executor contract without touching any filesystem state. */
export function validateSpellRetirementContract(contract, { digest } = {}) {
  if (typeof digest !== "function") throw new TypeError("Spell retirement contract validation requires a deterministic digest function.");
  if (!contract?.ok || contract.contractVersion !== SPELL_RETIREMENT_CONTRACT_VERSION) {
    throw new SpellRetirementError("Spell retirement requires a passing version-1 executor contract.");
  }
  if (contract.policy !== SPELL_RETIREMENT_POLICY || contract.plan?.version !== SPELL_RETIREMENT_PLAN_VERSION
    || contract.plan?.policy !== SPELL_RETIREMENT_POLICY || contract.plan?.ok !== true) {
    throw new SpellRetirementError("Spell retirement contract does not match the locked retirement policy and plan version.");
  }
  if (contract.approvals?.executorTrial !== true || contract.approvals?.liveRetirement !== false
    || contract.plan?.destructiveExecutionApproved !== false) {
    throw new SpellRetirementError("Spell retirement contract must approve only the disposable-clone executor trial.");
  }
  const plan = contract.plan;
  if (plan.source?.worldId !== "veilrunner" || plan.source?.systemId !== "Veilrunner"
    || plan.source?.relocationMapSha256 !== SPELL_RELOCATION_MAP_SHA256) {
    throw new SpellRetirementError("Spell retirement contract is not locked to the Veilrunner world and relocation map.");
  }
  for (const key of [
    "manifestBeforeSha256", "packEntrySha256", "storeTreeSha256", "inventorySha256",
    "systemTreeSha256", "worldTreeSha256"
  ]) assertDigestValue(plan.source?.[key], key);
  assertDigestValue(plan.intendedDelta?.manifest?.afterSha256, "manifest after digest");

  const expectedSummary = {
    legacyDefinitions: 54,
    actorTargets: 2,
    manifestPacksBefore: 6,
    manifestPacksAfter: 5,
    activeRuntimeReferences: 0,
    activeDataReferences: 0
  };
  for (const [key, expected] of Object.entries(expectedSummary)) {
    if (Number(plan.summary?.[key]) !== expected) {
      throw new SpellRetirementError(`Spell retirement contract requires ${key}=${expected}, found ${plan.summary?.[key]}.`);
    }
  }
  const relocation = plan.summary?.relocation;
  if (relocation?.sourceDefinitions !== 54 || relocation?.appliedDefinitions !== 54 || relocation?.pendingDefinitionCreates !== 0
    || relocation?.actorTargets !== 2 || relocation?.appliedActorTargets !== 2 || relocation?.pendingActorUpdates !== 0) {
    throw new SpellRetirementError("Spell retirement contract does not prove the complete version-2 relocation state.");
  }
  if (plan.intendedDelta?.manifest?.operation !== "remove-exact-entry"
    || plan.intendedDelta?.store?.operation !== "remove-exact-directory-after-verified-external-archive"
    || plan.intendedDelta?.store?.relativePath !== "packs/spells"
    || plan.intendedDelta?.store?.canonicalSystemPack !== SPELL_RELOCATION_TARGET_PACK) {
    throw new SpellRetirementError("Spell retirement contract contains an unexpected manifest or store operation.");
  }
  const pack = plan.intendedDelta.manifest.pack;
  if (pack?.id !== SPELL_RELOCATION_SOURCE_PACK || pack?.name !== "spells" || pack?.path !== "packs/spells"
    || pack?.type !== "Item" || pack?.system !== "Veilrunner" || pack?.package !== "world") {
    throw new SpellRetirementError("Spell retirement contract contains an unexpected legacy pack entry.");
  }
  if (digest(pack) !== plan.source.packEntrySha256) throw new SpellRetirementError("Spell retirement pack-entry digest drifted inside the contract.");
  const files = list(plan.intendedDelta.store.files);
  if (files.length !== Number(plan.summary?.storeFiles)
    || files.reduce((sum, file) => sum + Number(file?.length ?? 0), 0) !== Number(plan.summary?.storeBytes)
    || digest(files) !== plan.source.storeTreeSha256) {
    throw new SpellRetirementError("Spell retirement source-store inventory drifted inside the contract.");
  }
  for (const file of files) {
    if (!text(file?.name) || !Number.isSafeInteger(Number(file?.length)) || Number(file.length) < 0) {
      throw new SpellRetirementError("Spell retirement contract contains an invalid source-store file entry.", { file });
    }
    assertDigestValue(file.sha256, `source-store file digest for ${file.name}`);
  }
  for (const key of ["systemFiles", "systemBytes", "worldFiles", "worldBytes"]) {
    if (!Number.isSafeInteger(Number(plan.summary?.[key])) || Number(plan.summary[key]) < 1) {
      throw new SpellRetirementError(`Spell retirement contract has an invalid ${key}.`);
    }
  }
  return contract;
}

/** Validate a separately recorded live authorization without rewriting the clone-tested base contract. */
export function validateSpellRetirementLiveApproval(approval, { contract, contractSha256 } = {}) {
  if (!approval?.approved || approval.approvalVersion !== SPELL_RETIREMENT_LIVE_APPROVAL_VERSION
    || approval.scope !== "live-spell-retirement") {
    throw new SpellRetirementError("Live Spell retirement requires a passing version-1 live approval.");
  }
  if (!text(approval.approvedBy) || approval.authorization !== "Approve the live Spell retirement.") {
    throw new SpellRetirementError("Live Spell retirement approval does not contain the explicit user authorization.");
  }
  const lockedContractSha256 = assertDigestValue(contractSha256, "base contract file digest");
  if (assertDigestValue(approval.baseContract?.fileSha256, "approved base contract digest") !== lockedContractSha256) {
    throw new SpellRetirementError("Live Spell retirement approval is not bound to the loaded base contract.");
  }
  if (contract?.approvals?.executorTrial !== true || contract?.approvals?.liveRetirement !== false
    || contract?.plan?.destructiveExecutionApproved !== false) {
    throw new SpellRetirementError("Live approval requires the immutable clone-tested base contract.");
  }
  assertDigestValue(approval.inventory?.sha256, "live preflight inventory digest");
  const expectedInventory = {
    lockedDefinitions: 54,
    lockedActorTargets: 2,
    decodedSources: 35,
    decodedRecords: 1005,
    decodedOccurrences: 169,
    activeDataReferences: 0,
    activeRuntimeReferences: 0,
    unmappedDecodedTokens: 0,
    unmappedRepositoryTokens: 13
  };
  for (const [key, expected] of Object.entries(expectedInventory)) {
    if (Number(approval.inventory?.summary?.[key]) !== expected) {
      throw new SpellRetirementError(`Live preflight inventory requires ${key}=${expected}, found ${approval.inventory?.summary?.[key]}.`);
    }
  }
  const relocation = approval.relocation;
  if (relocation?.sourceDefinitions !== 54 || relocation?.appliedDefinitions !== 54 || relocation?.pendingDefinitionCreates !== 0
    || relocation?.actorTargets !== 2 || relocation?.appliedActorTargets !== 2 || relocation?.pendingActorUpdates !== 0) {
    throw new SpellRetirementError("Live approval does not prove the complete version-2 relocation state.");
  }
  if (approval.archive?.systemTreeSha256 !== contract.plan.source.systemTreeSha256
    || approval.archive?.worldTreeSha256 !== contract.plan.source.worldTreeSha256
    || approval.archive?.storeTreeSha256 !== contract.plan.source.storeTreeSha256) {
    throw new SpellRetirementError("Live approval archive digests do not match the clone-tested contract.");
  }
  return approval;
}

function exactPackCandidates(worldManifest) {
  return list(worldManifest?.packs).filter(pack => pack?.id === SPELL_RELOCATION_SOURCE_PACK
    || pack?.name === "spells" || pack?.path === "packs/spells");
}

/** Prepare the exact manifest-only retirement delta while preserving every unrelated JSON value. */
export function prepareRetiredWorldManifest(worldManifest, contract, { digest } = {}) {
  validateSpellRetirementContract(contract, { digest });
  if (worldManifest?.id !== contract.plan.source.worldId || worldManifest?.system !== contract.plan.source.systemId) {
    throw new SpellRetirementError("World manifest does not match the locked retirement world and system.");
  }
  if (digest(worldManifest) !== contract.plan.source.manifestBeforeSha256) {
    throw new SpellRetirementError("World manifest drifted from the locked pre-retirement digest.");
  }
  const candidates = exactPackCandidates(worldManifest);
  if (candidates.length !== 1 || digest(candidates[0]) !== contract.plan.source.packEntrySha256) {
    throw new SpellRetirementError(`Expected one exact legacy Spell pack entry, found ${candidates.length}.`);
  }
  const manifest = structuredClone(worldManifest);
  manifest.packs = manifest.packs.filter(pack => pack.id !== SPELL_RELOCATION_SOURCE_PACK);
  if (manifest.packs.length !== contract.plan.summary.manifestPacksAfter
    || digest(manifest) !== contract.plan.intendedDelta.manifest.afterSha256) {
    throw new SpellRetirementError("Prepared world manifest does not match the locked post-retirement digest.");
  }
  return Object.freeze({ manifest, removedPack: structuredClone(candidates[0]) });
}

/** Classify retryable source, partially-applied, applied, and rollback-partial states. */
export function classifySpellRetirementState({
  worldManifest,
  storeTreeSha256 = null,
  stagedStoreTreeSha256 = null,
  contract,
  digest
} = {}) {
  validateSpellRetirementContract(contract, { digest });
  const manifestSha256 = digest(worldManifest);
  const before = manifestSha256 === contract.plan.source.manifestBeforeSha256;
  const after = manifestSha256 === contract.plan.intendedDelta.manifest.afterSha256;
  const store = storeTreeSha256 === contract.plan.source.storeTreeSha256;
  const staged = stagedStoreTreeSha256 === contract.plan.source.storeTreeSha256;
  const storeAbsent = storeTreeSha256 === null;
  const stagedAbsent = stagedStoreTreeSha256 === null;
  if (before && store && stagedAbsent) return "source";
  if (before && storeAbsent && staged) return "store-moved";
  if (after && storeAbsent && staged) return "applied";
  if (after && store && stagedAbsent) return "rollback-store-restored";
  throw new SpellRetirementError("Retirement state is neither a locked source, retryable partial, applied, nor rollback-partial state.", {
    manifestSha256,
    storeTreeSha256,
    stagedStoreTreeSha256
  });
}
