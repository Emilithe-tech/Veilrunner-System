import { CompendiumRouter } from "../definitions/compendium-router.mjs";
import { DefinitionIndex } from "../definitions/definition-index.mjs";
import { ProgressionAuthoringController } from "./authoring-controller.mjs";
import { ProgressionCatalogProvider } from "./catalog-provider.mjs";
import { ContentCreationService } from "./content-creation-service.mjs";
import { DefinitionReferenceDiscovery } from "./definition-reference-discovery.mjs";
import { ProgressionDefinitionPickerService } from "./definition-picker-service.mjs";
import { ProgressionGraphEditingService } from "./graph-editing-service.mjs";
import {
  FoundryCanonicalDefinitionStore,
  FoundryDefinitionReferenceReaders,
  FoundryProgressionStore
} from "./foundry-adapters.mjs";
import { ProgressionInspectionService } from "./progression-inspection-service.mjs";
import { ProgressionPackLockCoordinator } from "./pack-lock-coordinator.mjs";

export const PROGRESSION_AUTHORING_SERVICES_VERSION = 3;

const text = value => String(value ?? "").trim();
const valuesIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection?.values?.() ?? collection ?? []);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function packCollection(pack) {
  return text(pack?.collection ?? pack?.metadata?.id);
}

function packOwner(pack) {
  return text(pack?.metadata?.packageName ?? pack?.metadata?.system);
}

export class ProgressionAuthoringUnavailableError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "ProgressionAuthoringUnavailableError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

/** Read-only metadata preflight; it never unlocks a pack or registers a hook. */
export function progressionAuthoringReadiness({ game = globalThis.game, router = null, systemId = game?.system?.id ?? "Veilrunner" } = {}) {
  const stableSystemId = text(systemId);
  const issues = [];
  if (stableSystemId !== "Veilrunner") issues.push({ code: "system-identity-mismatch", expected: "Veilrunner", actual: stableSystemId });
  if (game?.user?.isGM !== true) issues.push({ code: "gm-required" });
  const packs = valuesIn(game?.packs);
  const canonicalRouter = router ?? new CompendiumRouter({ systemId: stableSystemId, packs });
  const collections = new Set();
  for (const type of ["progression", "practice", "spell", "skill"]) {
    let route;
    try {
      route = canonicalRouter.route(type, { strict: true });
    } catch (error) {
      issues.push({ code: "canonical-route-unavailable", type, message: text(error?.message) });
      continue;
    }
    const collection = text(route?.collection);
    if (!collection || collections.has(collection)) continue;
    collections.add(collection);
    const pack = game?.packs?.get?.(collection) ?? packs.find(candidate => packCollection(candidate) === collection);
    if (!pack) {
      issues.push({ code: "canonical-pack-missing", collection });
      continue;
    }
    if (packCollection(pack) !== collection || packOwner(pack) !== stableSystemId || pack.documentName !== "Item") {
      issues.push({ code: "canonical-pack-identity-mismatch", collection });
    }
    if (pack.visible === false) issues.push({ code: "canonical-pack-hidden", collection });
    if (typeof pack.configure !== "function") issues.push({ code: "canonical-pack-configuration-unavailable", collection });
    if (pack.locked === true) issues.push({ code: "canonical-pack-locked", collection });
  }
  const blockers = issues.filter(issue => issue.code !== "canonical-pack-locked");
  const lockedCollections = issues.filter(issue => issue.code === "canonical-pack-locked").map(issue => issue.collection).sort();
  return deepFreeze({
    version: PROGRESSION_AUTHORING_SERVICES_VERSION,
    operation: "progression-authoring-readiness",
    ready: issues.length === 0,
    sessionReady: blockers.length === 0,
    systemId: stableSystemId,
    collections: [...collections].sort(),
    lockedCollections,
    issues
  });
}

/**
 * Assemble all Phase 4 authoring services without loading data, registering
 * hooks, unlocking packs, or mutating documents. Startup does not import this
 * module; a future activation boundary must call readiness and obtain approval.
 */
export function createProgressionAuthoringServices({
  game = globalThis.game,
  systemId = game?.system?.id ?? "Veilrunner",
  router = null,
  index = null,
  catalogProvider = null,
  progressionStore = null,
  definitionStore = null,
  lockCoordinator = null,
  referenceReaders = null,
  referenceDiscovery = null
} = {}) {
  const stableSystemId = text(systemId);
  if (stableSystemId !== "Veilrunner") {
    throw new ProgressionAuthoringUnavailableError("system-identity-mismatch", "Progression authoring services require the case-sensitive Veilrunner system identity.", { systemId: stableSystemId });
  }
  if (game?.user?.isGM !== true) {
    throw new ProgressionAuthoringUnavailableError("gm-required", "Progression authoring services are available only to a GM.");
  }
  const canonicalRouter = router ?? new CompendiumRouter({ systemId: stableSystemId, packs: valuesIn(game?.packs) });
  const definitionIndex = index ?? new DefinitionIndex({ game, systemId: stableSystemId, router: canonicalRouter });
  const structuralCatalog = catalogProvider ?? new ProgressionCatalogProvider({
    game,
    systemId: stableSystemId,
    expected: null,
    progressionPackLocked: null
  });
  const graphStore = progressionStore ?? new FoundryProgressionStore({ game });
  const canonicalDefinitionStore = definitionStore ?? new FoundryCanonicalDefinitionStore({ game, systemId: stableSystemId });
  const canonicalPackLocks = lockCoordinator ?? new ProgressionPackLockCoordinator({ game, systemId: stableSystemId });
  const foundryReaders = referenceReaders ?? new FoundryDefinitionReferenceReaders({ game, router: canonicalRouter, systemId: stableSystemId });
  const discovery = referenceDiscovery ?? new DefinitionReferenceDiscovery({ readers: foundryReaders.readers() });
  const contentCreation = new ContentCreationService({
    router: canonicalRouter,
    index: definitionIndex,
    definitionStore: canonicalDefinitionStore,
    progressionStore: graphStore,
    catalogValidator: structuralCatalog
  });
  const definitionPicker = new ProgressionDefinitionPickerService({ index: definitionIndex, progressionStore: graphStore });
  const graphEditing = new ProgressionGraphEditingService({ progressionStore: graphStore, catalogValidator: structuralCatalog });
  const inspection = new ProgressionInspectionService({
    index: definitionIndex,
    progressionStore: graphStore,
    referenceDiscovery: discovery,
    catalogValidator: structuralCatalog
  });
  const controller = new ProgressionAuthoringController({
    router: canonicalRouter,
    lockCoordinator: canonicalPackLocks,
    contentCreation,
    definitionPicker,
    graphEditing,
    inspection
  });
  return Object.freeze({
    version: PROGRESSION_AUTHORING_SERVICES_VERSION,
    router: canonicalRouter,
    index: definitionIndex,
    catalogProvider: structuralCatalog,
    progressionStore: graphStore,
    definitionStore: canonicalDefinitionStore,
    lockCoordinator: canonicalPackLocks,
    referenceReaders: foundryReaders,
    referenceDiscovery: discovery,
    contentCreation,
    definitionPicker,
    graphEditing,
    inspection,
    controller,
    readiness: () => progressionAuthoringReadiness({ game, router: canonicalRouter, systemId: stableSystemId })
  });
}
