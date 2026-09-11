import { progressionCatalogProvider } from "./catalog-provider.mjs";
import {
  createProgressionAuthoringServices,
  ProgressionAuthoringUnavailableError
} from "./authoring-services.mjs";

export const PROGRESSION_AUTHORING_RUNTIME_VERSION = 3;
export const PROGRESSION_AUTHORING_COLLECTION = "Veilrunner.character-library";
export const PROGRESSION_AUTHORING_MUTATION_OPERATION = "live-progression-authoring-mutation";

const PAGE_DEFINITION_IDS = Object.freeze({
  magic: "veilrunner.progression.magic",
  skills: "veilrunner.progression.skills"
});

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

function definitionId(document) {
  return text(document?.system?.definitionId ?? document?._source?.system?.definitionId);
}

export class ProgressionAuthoringRuntimeError extends Error {
  constructor(code, message, details = {}, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProgressionAuthoringRuntimeError";
    this.code = code;
    this.details = deepFreeze({ ...details });
  }
}

/**
 * Stable page-oriented boundary between the canvas and the canonical services.
 * Construction is inert. Reads load only the exact Progression document, and
 * mutations defer shared-catalog invalidation until the lock-scoped transaction
 * and any rollback have settled.
 */
export class ProgressionAuthoringRuntime {
  constructor({
    game = globalThis.game,
    services = null,
    catalogProvider = progressionCatalogProvider(),
    mutationAuthorization = null
  } = {}) {
    if (game?.system?.id !== "Veilrunner") {
      throw new ProgressionAuthoringRuntimeError("system-identity-mismatch", "Progression authoring runtime requires the case-sensitive Veilrunner system identity.", { systemId: text(game?.system?.id) });
    }
    if (game?.user?.isGM !== true) {
      throw new ProgressionAuthoringRuntimeError("gm-required", "Progression authoring runtime is available only to a GM.");
    }
    if (catalogProvider?.expected !== null || catalogProvider?.progressionPackLocked !== null) {
      throw new ProgressionAuthoringRuntimeError("structural-provider-required", "Progression authoring requires the shared runtime provider in structural mode.");
    }
    if (typeof catalogProvider?.runInvalidationBatch !== "function") {
      throw new TypeError("Shared progression catalog provider must implement runInvalidationBatch().");
    }
    this.game = game;
    this.services = services ?? createProgressionAuthoringServices({ game });
    this.catalogProvider = catalogProvider;
    this.mutationAuthorization = mutationAuthorization?.approved === true
      && mutationAuthorization?.operation === PROGRESSION_AUTHORING_MUTATION_OPERATION
      ? deepFreeze({ ...mutationAuthorization })
      : null;
  }

  readiness() {
    return this.services.readiness();
  }

  capabilities() {
    return deepFreeze({
      version: PROGRESSION_AUTHORING_RUNTIME_VERSION,
      ...this.services.controller.capabilities(),
      pages: Object.keys(PAGE_DEFINITION_IDS),
      liveMutationApproved: Boolean(this.mutationAuthorization)
    });
  }

  async #progression(page) {
    const stablePage = text(page).toLowerCase();
    const expectedDefinitionId = PAGE_DEFINITION_IDS[stablePage];
    if (!expectedDefinitionId) {
      throw new ProgressionAuthoringRuntimeError("progression-page-invalid", "Progression authoring requires the magic or skills page.", { page: stablePage });
    }
    const packs = valuesIn(this.game?.packs);
    const pack = this.game?.packs?.get?.(PROGRESSION_AUTHORING_COLLECTION)
      ?? packs.find(candidate => packCollection(candidate) === PROGRESSION_AUTHORING_COLLECTION)
      ?? null;
    if (!pack || packCollection(pack) !== PROGRESSION_AUTHORING_COLLECTION || packOwner(pack) !== "Veilrunner" || pack.documentName !== "Item") {
      throw new ProgressionAuthoringRuntimeError("progression-pack-identity-mismatch", "The exact Veilrunner Progression Item pack is unavailable.", {
        collection: packCollection(pack),
        owner: packOwner(pack),
        documentName: text(pack?.documentName)
      });
    }
    if (pack.visible === false) {
      throw new ProgressionAuthoringRuntimeError("progression-pack-hidden", "The canonical Progression pack is not visible to the current GM.");
    }
    let documents;
    try {
      documents = valuesIn(await pack.getDocuments());
    } catch (cause) {
      throw new ProgressionAuthoringRuntimeError("progression-pack-unreadable", "The canonical Progression pack could not be read.", {}, cause);
    }
    const matches = documents.filter(document => document?.type === "progression" && definitionId(document) === expectedDefinitionId);
    if (matches.length !== 1) {
      throw new ProgressionAuthoringRuntimeError("progression-document-mismatch", `Expected one ${stablePage} Progression document, found ${matches.length}.`, {
        page: stablePage,
        definitionId: expectedDefinitionId,
        matches: matches.length
      });
    }
    return matches[0];
  }

  async listDefinitions({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.listDefinitions({ ...request, progression });
  }

  async inspectNode({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.inspectNode({ ...request, progression });
  }

  assessDefinitionDeletion(request = {}) {
    return this.services.controller.assessDefinitionDeletion(request);
  }

  async previewMutation({ page, graph, definitionSource = null } = {}) {
    const progression = await this.#progression(page);
    return this.services.catalogProvider.previewMutation({ progression, graph, definitionSource });
  }

  async previewCreateContent({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.previewCreateContent({ ...request, progression });
  }

  async previewPlaceExisting({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.previewPlaceExisting({ ...request, progression });
  }

  async previewRemoveNode({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.previewRemoveNode({ ...request, progression });
  }

  async previewLayout({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.previewLayout({ ...request, progression });
  }

  async previewConnections({ page, ...request } = {}) {
    const progression = await this.#progression(page);
    return this.services.controller.previewConnections({ ...request, progression });
  }

  async #mutate(method, { page, ...request } = {}) {
    if (!this.mutationAuthorization) {
      throw new ProgressionAuthoringRuntimeError(
        "live-mutation-not-authorized",
        "Live Progression authoring mutation requires a distinct approved runtime authorization."
      );
    }
    const progression = await this.#progression(page);
    return this.catalogProvider.runInvalidationBatch(
      () => this.services.controller[method]({ ...request, progression }),
      { refresh: true }
    );
  }

  createContent(request = {}) {
    return this.#mutate("createContent", request);
  }

  placeExisting(request = {}) {
    return this.#mutate("placeExisting", request);
  }

  removeNode(request = {}) {
    return this.#mutate("removeNode", request);
  }

  updateLayout(request = {}) {
    return this.#mutate("updateLayout", request);
  }

  replaceConnections(request = {}) {
    return this.#mutate("replaceConnections", request);
  }
}

let runtime = null;

/** Register the inert GM-only runtime. No pack is read, unlocked, or written. */
export function registerProgressionAuthoringRuntime(options = {}) {
  if (runtime) return runtime;
  runtime = new ProgressionAuthoringRuntime(options);
  return runtime;
}

export function progressionAuthoringRuntime() {
  if (!runtime) {
    throw new ProgressionAuthoringUnavailableError("runtime-unregistered", "Canonical Progression authoring services are not registered.");
  }
  return runtime;
}

export function resetProgressionAuthoringRuntimeForTests() {
  runtime = null;
}
