import { CompendiumRouter } from "../definitions/compendium-router.mjs";
import { canonicalIdBuilder } from "../definitions/canonical-id.mjs";
import { DefinitionIndex } from "../definitions/definition-index.mjs";
import {
  CANONICAL_PROGRESSION_EXPECTATIONS,
  materializeTalentTreeCatalog
} from "./catalog-materializer.mjs";

export const PROGRESSION_CATALOG_COLLECTION = "Veilrunner.character-library";
export const PROGRESSION_CATALOG_CHANGED_HOOK = "veilrunnerTalentTreeCatalogChanged";

const documentsIn = collection => Array.isArray(collection?.contents) ? collection.contents : Array.from(collection?.values?.() ?? collection ?? []);
const text = value => String(value ?? "").trim();
const clone = value => globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));

export class ProgressionCatalogUnavailableError extends Error {
  constructor(code, message, details = {}, cause = null) {
    super(message, cause ? { cause } : undefined);
    this.name = "ProgressionCatalogUnavailableError";
    this.code = code;
    this.details = details;
  }
}

function unavailable(code, message, details = {}, cause = null) {
  return new ProgressionCatalogUnavailableError(code, message, details, cause);
}

function sourceOf(document) {
  const source = document?.toObject?.() ?? document?._source ?? document;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw unavailable("document-unreadable", "A canonical progression document could not be decoded.");
  const result = clone(source);
  if (!result.uuid && document?.uuid) result.uuid = document.uuid;
  return result;
}

function packageOwner(pack) {
  return text(pack?.metadata?.packageName ?? pack?.metadata?.system);
}

function packCollection(pack) {
  return text(pack?.collection ?? pack?.metadata?.id);
}

function itemTypeForDefinitionId(definitionId) {
  const match = /^veilrunner\.ability\.(spell|skill)\./.exec(text(definitionId));
  if (!match) throw unavailable("content-reference-invalid", `Progression graph references unsupported canonical content: ${definitionId}.`, { definitionId });
  return match[1];
}

function assertReadable(pack, game) {
  if (pack?.visible === false) throw unavailable("pack-permission-denied", `Canonical pack ${packCollection(pack)} is not visible to the current user.`);
  if (typeof pack?.testUserPermission === "function" && pack.testUserPermission(game?.user, "OBSERVER") === false) {
    throw unavailable("pack-permission-denied", `Canonical pack ${packCollection(pack)} is not readable by the current user.`);
  }
}

function assertExactPack(pack, collection, game, { locked = null } = {}) {
  if (!pack) throw unavailable("pack-missing", `Canonical pack ${collection} is unavailable.`, { collection });
  if (packCollection(pack) !== collection || packageOwner(pack) !== "Veilrunner" || pack.documentName !== "Item") {
    throw unavailable("pack-identity-mismatch", `Canonical pack ${collection} has an unexpected identity.`, {
      expected: { collection, owner: "Veilrunner", documentName: "Item" },
      actual: { collection: packCollection(pack), owner: packageOwner(pack), documentName: pack.documentName }
    });
  }
  if (locked !== null && Boolean(pack.locked) !== locked) throw unavailable("pack-lock-mismatch", `Canonical pack ${collection} has an unexpected lock state.`, { expected: locked, actual: Boolean(pack.locked) });
  assertReadable(pack, game);
  return pack;
}

/**
 * Read-only, fail-closed loader for canonical Progression graphs. Runtime uses
 * the sealed defaults; authoring may opt into structural inventory validation
 * without weakening package identity, type, reference, or graph validation.
 */
export class ProgressionCatalogProvider {
  constructor({
    game = globalThis.game,
    systemId = game?.system?.id ?? "Veilrunner",
    expected = CANONICAL_PROGRESSION_EXPECTATIONS,
    progressionPackLocked = true,
    routerFactory = options => new CompendiumRouter(options),
    indexFactory = options => new DefinitionIndex(options),
    materialize = materializeTalentTreeCatalog
  } = {}) {
    if (![true, false, null].includes(progressionPackLocked)) {
      throw new TypeError("progressionPackLocked must be true, false, or null.");
    }
    this.game = game;
    this.systemId = text(systemId);
    this.expected = expected;
    this.progressionPackLocked = progressionPackLocked;
    this.routerFactory = routerFactory;
    this.indexFactory = indexFactory;
    this.materialize = materialize;
    this.state = "idle";
    this.snapshot = null;
    this.error = null;
    this.loading = null;
    this.revision = 0;
    this.definitionIndex = null;
    this.dependencyCollections = new Set([PROGRESSION_CATALOG_COLLECTION]);
    this.unregisterHooks = null;
    this.invalidationBatchDepth = 0;
    this.invalidationPending = false;
    this.invalidationReloadQueued = false;
    this.invalidationCallbacks = null;
  }

  catalog() {
    if (this.state !== "ready" || !this.snapshot) {
      throw this.error instanceof ProgressionCatalogUnavailableError
        ? this.error
        : unavailable("catalog-not-ready", "The canonical progression catalog is not ready.", { state: this.state });
    }
    return this.snapshot;
  }

  #packByCollection(collection) {
    return this.game?.packs?.get?.(collection) ?? documentsIn(this.game?.packs).find(pack => packCollection(pack) === collection) ?? null;
  }

  async #read({ mutation = null } = {}) {
    if (mutation && this.expected !== null) {
      throw unavailable("authoring-preview-disabled", "Progression mutation preview requires structural inventory mode.");
    }
    if (this.systemId !== "Veilrunner") throw unavailable("system-identity-mismatch", `Canonical progression requires system Veilrunner, found ${this.systemId || "(blank)"}.`);
    const packs = documentsIn(this.game?.packs);
    const manifestRouter = this.routerFactory({ systemId: this.systemId, packs });
    let progressionRoute;
    try {
      progressionRoute = manifestRouter.route("progression", { strict: true });
    } catch (cause) {
      const causeMessage = text(cause?.message) || "unknown routing error";
      throw unavailable(
        "progression-route-unavailable",
        `The canonical Progression route is unavailable: ${causeMessage}`,
        { causeCode: text(cause?.code), availableCollections: packs.map(packCollection).filter(Boolean).sort() },
        cause
      );
    }
    if (progressionRoute.collection !== PROGRESSION_CATALOG_COLLECTION) {
      throw unavailable("progression-route-mismatch", "The canonical Progression route did not resolve the exact Veilrunner collection.", { route: progressionRoute });
    }
    const progressionPack = assertExactPack(this.#packByCollection(progressionRoute.collection), progressionRoute.collection, this.game, { locked: this.progressionPackLocked });
    let documents;
    try {
      documents = await progressionPack.getDocuments();
    } catch (cause) {
      throw unavailable("progression-pack-unreadable", "The canonical Progression pack could not be read.", { collection: progressionRoute.collection }, cause);
    }
    if (!Array.isArray(documents)) documents = documentsIn(documents);
    documents = documents.filter(document => ["practice", "progression"].includes(document.type));
    if (this.expected !== null && documents.length !== this.expected.practices + this.expected.progressions) {
      throw unavailable("progression-pack-count-mismatch", `Canonical Progression pack expected ${this.expected.practices + this.expected.progressions} Items, found ${documents.length}.`);
    }
    const decoded = documents.map(sourceOf);
    let proposedDefinition = null;
    if (mutation) {
      const target = sourceOf(mutation.progression);
      const definitionId = text(target.system?.definitionId);
      const matches = decoded.map((source, index) => ({ source, index }))
        .filter(entry => text(entry.source.system?.definitionId) === definitionId && entry.source.type === "progression");
      if (matches.length !== 1) throw unavailable("progression-mutation-target-mismatch", "Progression mutation preview did not resolve one exact target document.", { definitionId, matches: matches.length });
      const targetDocumentId = text(target._id ?? target.id);
      const storedDocumentId = text(matches[0].source._id ?? matches[0].source.id);
      if (targetDocumentId && storedDocumentId && targetDocumentId !== storedDocumentId) {
        throw unavailable("progression-mutation-target-mismatch", "Progression mutation preview target has an unexpected physical document ID.", { definitionId, expected: storedDocumentId, actual: targetDocumentId });
      }
      const graph = mutation.graph;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !text(graph.rootNodeId)) {
        throw unavailable("progression-mutation-graph-invalid", "Progression mutation preview requires node and edge arrays plus a stable root identity.");
      }
      const stored = matches[0].source;
      decoded[matches[0].index] = {
        ...stored,
        system: {
          ...(stored.system ?? {}),
          nodes: clone(graph.nodes),
          edges: clone(graph.edges),
          layout: { ...(stored.system?.layout ?? {}), rootNodeId: text(graph.rootNodeId) }
        }
      };
      if (mutation.definitionSource) {
        proposedDefinition = sourceOf(mutation.definitionSource);
        const proposedId = text(proposedDefinition.system?.definitionId);
        if (!proposedId) throw unavailable("proposed-definition-identity-missing", "Progression mutation preview requires a canonical definition ID.");
        const identity = canonicalIdBuilder.validate(proposedId);
        if (!identity.ok) throw unavailable("proposed-definition-identity-invalid", `Proposed canonical definition ID is invalid: ${proposedId}.`, { definitionId: proposedId, issues: identity.issues });
        if (proposedDefinition.type === "practice") {
          if (decoded.some(source => text(source.system?.definitionId) === proposedId)) {
            throw unavailable("proposed-definition-collision", `Proposed Practice already exists: ${proposedId}.`, { definitionId: proposedId });
          }
          decoded.push(proposedDefinition);
        } else if (itemTypeForDefinitionId(proposedId) !== proposedDefinition.type) {
          throw unavailable("proposed-definition-type-mismatch", `Proposed canonical content has an unexpected type: ${proposedId}.`, { definitionId: proposedId, type: proposedDefinition.type });
        }
      }
    }
    const practices = decoded.filter(document => document.type === "practice");
    const progressions = decoded.filter(document => document.type === "progression");
    const typeInventoryInvalid = decoded.some(document => !["practice", "progression"].includes(document.type))
      || progressions.length !== 2
      || (this.expected !== null && practices.length !== this.expected.practices);
    if (typeInventoryInvalid) {
      throw unavailable("progression-pack-type-mismatch", "Canonical Progression pack does not match the required Practice/Progression inventory.", {
        practices: practices.length,
        progressions: progressions.length,
        total: decoded.length
      });
    }

    const referencedIds = [...new Set(progressions.flatMap(document => (document.system?.nodes ?? [])
      .filter(node => node?.kind === "content")
      .map(node => text(node.definitionId))
      .filter(Boolean)))];
    const proposedDefinitionId = text(proposedDefinition?.system?.definitionId);
    if (proposedDefinition && proposedDefinition.type !== "practice" && !referencedIds.includes(proposedDefinitionId)) {
      throw unavailable("proposed-definition-unreferenced", `Proposed canonical content is not referenced by the candidate graph: ${proposedDefinitionId}.`, { definitionId: proposedDefinitionId });
    }
    if (this.expected !== null && referencedIds.length !== this.expected.definitions) {
      throw unavailable("content-reference-count-mismatch", `Canonical Progression graphs expected ${this.expected.definitions} unique content references, found ${referencedIds.length}.`);
    }

    const routedPacks = new Map();
    for (const definitionId of referencedIds) {
      const type = itemTypeForDefinitionId(definitionId);
      let route;
      try {
        route = manifestRouter.route(type, { strict: true });
      } catch (cause) {
        throw unavailable("content-route-unavailable", `Canonical route for ${definitionId} is unavailable.`, { definitionId, type }, cause);
      }
      const pack = assertExactPack(this.#packByCollection(route.collection), route.collection, this.game);
      routedPacks.set(route.collection, pack);
    }
    const scopedPacks = [...routedPacks.values()];
    const scopedRouter = this.routerFactory({ systemId: this.systemId, packs: scopedPacks });
    const definitionIndex = this.indexFactory({
      game: { system: this.game?.system, user: this.game?.user, packs: scopedPacks },
      systemId: this.systemId,
      router: scopedRouter
    });
    let audit;
    try {
      audit = await definitionIndex.auditReferences(referencedIds.filter(definitionId => definitionId !== proposedDefinitionId));
    } catch (cause) {
      throw unavailable("content-index-unreadable", "Referenced canonical definitions could not be indexed.", {}, cause);
    }
    if (audit.invalid.length || audit.missing.length || audit.duplicated.length) {
      throw unavailable("content-reference-unresolved", "Canonical Progression content references are invalid, missing, or duplicated.", audit);
    }
    if (proposedDefinition && proposedDefinition.type !== "practice") {
      let existing;
      try {
        existing = await definitionIndex.metadata(proposedDefinitionId);
      } catch (cause) {
        throw unavailable("proposed-definition-collision", `Proposed canonical content identity is duplicated: ${proposedDefinitionId}.`, { definitionId: proposedDefinitionId }, cause);
      }
      if (existing) throw unavailable("proposed-definition-collision", `Proposed canonical content already exists: ${proposedDefinitionId}.`, { definitionId: proposedDefinitionId, existing });
    }
    let definitions;
    try {
      definitions = await Promise.all(referencedIds.map(async definitionId => {
        if (definitionId === proposedDefinitionId && proposedDefinition?.type !== "practice") return clone(proposedDefinition);
        const document = await definitionIndex.resolve(definitionId);
        if (!document) throw unavailable("content-document-missing", `Canonical content document is unavailable: ${definitionId}.`, { definitionId });
        const source = sourceOf(document);
        if (source.system?.definitionId !== definitionId) throw unavailable("content-document-identity-mismatch", `Canonical content document changed identity while loading: ${definitionId}.`, { definitionId, actual: source.system?.definitionId });
        return source;
      }));
    } catch (cause) {
      if (cause instanceof ProgressionCatalogUnavailableError) throw cause;
      throw unavailable("content-document-unreadable", "Referenced canonical content could not be loaded.", {}, cause);
    }
    let snapshot;
    try {
      snapshot = this.materialize({ practices, progressions, definitions }, { expected: this.expected });
    } catch (cause) {
      const causeMessage = text(cause?.message) || "unknown materialization error";
      throw unavailable(
        "catalog-materialization-failed",
        `Canonical progression data could not be materialized for consumers: ${causeMessage}`,
        { materializerCode: text(cause?.code), materializerDetails: cause?.details ?? {} },
        cause
      );
    }
    return {
      snapshot,
      definitionIndex,
      dependencyCollections: new Set([progressionRoute.collection, ...routedPacks.keys()])
    };
  }

  /** Validate a prospective whole-graph mutation without publishing or writing it. */
  async previewMutation({ progression, graph, definitionSource = null } = {}) {
    const result = await this.#read({ mutation: { progression, graph, definitionSource } });
    return result.snapshot;
  }

  load() {
    if (this.state === "ready" && this.snapshot) return Promise.resolve(this.snapshot);
    if (this.state === "loading" && this.loading) return this.loading;
    const revision = this.revision;
    this.state = "loading";
    this.snapshot = null;
    this.error = null;
    const loading = this.#read().then(result => {
      if (revision !== this.revision) return this.load();
      this.snapshot = result.snapshot;
      this.definitionIndex = result.definitionIndex;
      this.dependencyCollections = result.dependencyCollections;
      this.state = "ready";
      this.error = null;
      return this.snapshot;
    }).catch(cause => {
      if (revision !== this.revision) return this.load();
      const error = cause instanceof ProgressionCatalogUnavailableError
        ? cause
        : unavailable("catalog-load-failed", "The canonical progression catalog failed to load.", {}, cause);
      this.snapshot = null;
      this.state = "failed";
      this.error = error;
      throw error;
    }).finally(() => {
      if (this.loading === loading) this.loading = null;
    });
    this.loading = loading;
    return loading;
  }

  dependsOn(documentOrCollection) {
    const collection = typeof documentOrCollection === "string"
      ? documentOrCollection
      : text(documentOrCollection?.pack ?? documentOrCollection?.collection);
    return this.dependencyCollections.has(collection);
  }

  invalidate({ reload = false } = {}) {
    this.revision += 1;
    this.snapshot = null;
    this.error = null;
    this.state = "idle";
    this.loading = null;
    this.definitionIndex?.invalidate?.();
    this.definitionIndex = null;
    if (!reload) return null;
    return this.load();
  }

  async #reloadAfterInvalidation() {
    try {
      const catalog = await this.load();
      this.invalidationCallbacks?.onReload?.(catalog);
      return catalog;
    } catch (error) {
      this.invalidationCallbacks?.onError?.(error);
      throw error;
    }
  }

  #queueInvalidationReload() {
    if (this.invalidationReloadQueued) return;
    this.invalidationReloadQueued = true;
    queueMicrotask(async () => {
      this.invalidationReloadQueued = false;
      if (this.invalidationBatchDepth > 0) {
        this.invalidationPending = true;
        return;
      }
      this.invalidationPending = false;
      try {
        await this.#reloadAfterInvalidation();
      } catch (_error) {
        // The registered error callback owns user-facing diagnostics.
      }
    });
  }

  /**
   * Defer hook-driven reloads until a complete authoring transaction settles.
   * The optional refresh also covers adapters whose test doubles do not emit
   * Foundry document hooks.
   */
  async runInvalidationBatch(execute, { refresh = false } = {}) {
    if (typeof execute !== "function") throw new TypeError("Progression invalidation batches require an execute function.");
    this.invalidationBatchDepth += 1;
    let value;
    let primaryError = null;
    try {
      value = await execute();
    } catch (error) {
      primaryError = error;
    } finally {
      this.invalidationBatchDepth -= 1;
    }

    if (this.invalidationBatchDepth === 0 && refresh) {
      this.invalidate();
      this.invalidationPending = true;
    }
    if (this.invalidationBatchDepth === 0 && this.invalidationPending) {
      this.invalidationPending = false;
      try {
        await this.#reloadAfterInvalidation();
      } catch (reloadError) {
        if (!primaryError) throw reloadError;
      }
    }
    if (primaryError) throw primaryError;
    return value;
  }

  registerInvalidation({ hooks = globalThis.Hooks, onReload = null, onError = null } = {}) {
    if (this.unregisterHooks || typeof hooks?.on !== "function") return this.unregisterHooks ?? (() => {});
    this.invalidationCallbacks = { onReload, onError };
    const handle = document => {
      if (!this.dependsOn(document)) return;
      this.invalidate();
      if (this.invalidationBatchDepth > 0) {
        this.invalidationPending = true;
        return;
      }
      this.#queueInvalidationReload();
    };
    const registrations = ["createItem", "updateItem", "deleteItem"].map(hook => [hook, hooks.on(hook, handle)]);
    this.unregisterHooks = () => {
      for (const [hook, id] of registrations) hooks.off?.(hook, id);
      this.unregisterHooks = null;
      this.invalidationCallbacks = null;
    };
    return this.unregisterHooks;
  }
}

let runtimeProvider = null;

export function progressionCatalogProvider() {
  runtimeProvider ??= new ProgressionCatalogProvider({ expected: null, progressionPackLocked: null });
  return runtimeProvider;
}

export function resetProgressionCatalogProviderForTests() {
  runtimeProvider?.unregisterHooks?.();
  runtimeProvider = null;
}

export async function initializeProgressionCatalog() {
  const provider = progressionCatalogProvider();
  provider.registerInvalidation({
    onReload: catalog => globalThis.Hooks?.callAll?.(PROGRESSION_CATALOG_CHANGED_HOOK, catalog),
    onError: error => {
      console.error("Veilrunner | Canonical progression reload failed", error);
      globalThis.ui?.notifications?.error?.("Progression data became unavailable. Character Generation is disabled until it reloads successfully.");
    }
  });
  return provider.load();
}

export async function ensureProgressionCatalogReady() {
  return progressionCatalogProvider().load();
}

export function currentProgressionCatalog() {
  return progressionCatalogProvider().catalog();
}
