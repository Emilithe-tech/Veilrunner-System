export const FOUNDRY_PROGRESSION_ADAPTER_VERSION = 1;

const text = value => String(value ?? "").trim();
const clone = value => {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
};

function valuesIn(collection) {
  if (Array.isArray(collection?.contents)) return [...collection.contents];
  if (Array.isArray(collection)) return [...collection];
  if (typeof collection?.values === "function") return Array.from(collection.values());
  try {
    return Array.from(collection ?? []);
  } catch (_error) {
    return [];
  }
}

function compareText(left, right) {
  return text(left).localeCompare(text(right));
}

function stableJson(value) {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sameSnapshot(left, right) {
  return stableJson(left) === stableJson(right);
}

function documentId(document) {
  return text(document?._id ?? document?.id ?? document?._source?._id);
}

function documentType(document) {
  return text(document?.type ?? document?._source?.type);
}

function definitionId(document) {
  return text(document?.system?.definitionId ?? document?._source?.system?.definitionId);
}

function documentSource(document) {
  let source;
  if (typeof document?.toObject === "function") source = document.toObject();
  else if (document?._source && typeof document._source === "object") source = document._source;
  else if (document && typeof document === "object") {
    source = {
      _id: documentId(document),
      name: document.name,
      type: documentType(document),
      img: document.img,
      system: typeof document.system?.toObject === "function" ? document.system.toObject() : document.system,
      flags: document.flags
    };
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Foundry document did not expose object-valued source data.");
  }
  return clone(source);
}

function packCollection(pack) {
  return text(pack?.collection ?? pack?.metadata?.id);
}

function packName(pack) {
  return text(pack?.metadata?.name ?? pack?.name ?? packCollection(pack).split(".").at(-1));
}

function packOwner(pack) {
  return text(pack?.metadata?.packageName ?? pack?.metadata?.system);
}

function isExactSystemItemPack(pack, systemId) {
  if (pack?.documentName !== "Item") return false;
  return packOwner(pack) === systemId;
}

function progressionSource(document) {
  if (!document || typeof document !== "object") {
    throw new FoundryProgressionAdapterError("progression-required", "A Foundry Progression Item is required.");
  }
  if (documentType(document) !== "progression") {
    throw new FoundryProgressionAdapterError("progression-type-invalid", "The Foundry graph adapter only accepts Progression Items.", {
      documentId: documentId(document),
      type: documentType(document)
    });
  }
  return documentSource(document);
}

function graphSnapshot(document) {
  const source = progressionSource(document);
  return {
    nodes: clone(source.system?.nodes),
    edges: clone(source.system?.edges),
    rootNodeId: text(source.system?.layout?.rootNodeId)
  };
}

function requiredExpected(options, field) {
  if (!options || !Object.prototype.hasOwnProperty.call(options, field)) {
    throw new FoundryProgressionAdapterError("optimistic-state-required", `Progression replacement requires ${field}.`, { field });
  }
  return clone(options[field]);
}

function assertMutableDocument(document) {
  if (typeof document?.update !== "function") {
    throw new FoundryProgressionAdapterError("progression-update-unavailable", "The Progression Item does not expose Foundry update().", {
      documentId: documentId(document)
    });
  }
}

export class FoundryProgressionAdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FoundryProgressionAdapterError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Optimistic Foundry document adapter for the source-only progression services.
 * It is inert until explicitly constructed and injected; this module registers no hooks.
 */
export class FoundryProgressionStore {
  constructor({ game = globalThis.game } = {}) {
    this.game = game;
  }

  async currentDocument(document) {
    progressionSource(document);
    const collection = text(document.pack);
    if (!collection) return document;
    const pack = packFrom(this.game, collection);
    if (typeof pack?.getDocument !== "function") {
      throw new FoundryProgressionAdapterError("progression-pack-unavailable", "The Progression Item's current compendium is unavailable.", { collection });
    }
    // getDocuments() can return detached instances in Foundry 14. Updates target
    // the cached collection instance; re-resolve it for reads, writes and rollback.
    const current = await pack.getDocument(documentId(document));
    if (!current || documentId(current) !== documentId(document) || text(current.pack) !== collection
      || documentType(current) !== "progression" || definitionId(current) !== definitionId(document)) {
      throw new FoundryProgressionAdapterError("progression-identity-changed", "The current compendium Progression identity no longer matches.", {
        collection, documentId: documentId(document)
      });
    }
    return current;
  }

  async readNodes(document) {
    document = await this.currentDocument(document);
    const nodes = progressionSource(document).system?.nodes;
    if (!Array.isArray(nodes)) {
      throw new FoundryProgressionAdapterError("progression-nodes-invalid", "Progression source nodes must be an array.", {
        documentId: documentId(document)
      });
    }
    return clone(nodes);
  }

  async readGraph(document) {
    document = await this.currentDocument(document);
    const graph = graphSnapshot(document);
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new FoundryProgressionAdapterError("progression-graph-invalid", "Progression source nodes and edges must be arrays.", {
        documentId: documentId(document)
      });
    }
    return clone(graph);
  }

  async replaceNodes(document, nodes, options = {}) {
    if (!Array.isArray(nodes)) throw new TypeError("Progression replacement nodes must be an array.");
    document = await this.currentDocument(document);
    assertMutableDocument(document);
    const expectedNodes = requiredExpected(options, "expectedNodes");
    const currentNodes = await this.readNodes(document);
    if (sameSnapshot(currentNodes, nodes)) return { status: "already-applied", document };
    if (!sameSnapshot(currentNodes, expectedNodes)) {
      throw new FoundryProgressionAdapterError("optimistic-conflict", "Progression nodes changed after they were read.", {
        documentId: documentId(document),
        operation: text(options.operation),
        field: "system.nodes"
      });
    }

    const payload = { "system.nodes": clone(nodes) };
    await document.update(payload);
    const applied = await this.readNodes(document);
    if (!sameSnapshot(applied, nodes)) {
      throw new FoundryProgressionAdapterError("post-update-mismatch", "Foundry did not persist the requested Progression nodes.", {
        documentId: documentId(document),
        operation: text(options.operation),
        field: "system.nodes"
      });
    }
    return { status: "applied", document };
  }

  async replaceGraph(document, graph, options = {}) {
    if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
      throw new TypeError("Progression replacement graph requires node and edge arrays.");
    }
    document = await this.currentDocument(document);
    assertMutableDocument(document);
    const expectedGraph = requiredExpected(options, "expectedGraph");
    const currentGraph = await this.readGraph(document);
    const nextGraph = {
      nodes: clone(graph.nodes),
      edges: clone(graph.edges),
      rootNodeId: text(graph.rootNodeId)
    };
    if (nextGraph.rootNodeId !== currentGraph.rootNodeId) {
      throw new FoundryProgressionAdapterError("progression-root-change-forbidden", "Graph replacement cannot change the Progression root identity.", {
        documentId: documentId(document),
        currentRootNodeId: currentGraph.rootNodeId,
        nextRootNodeId: nextGraph.rootNodeId
      });
    }
    if (sameSnapshot(currentGraph, nextGraph)) return { status: "already-applied", document };
    if (!sameSnapshot(currentGraph, expectedGraph)) {
      throw new FoundryProgressionAdapterError("optimistic-conflict", "Progression graph changed after it was read.", {
        documentId: documentId(document),
        operation: text(options.operation),
        field: "system.nodes,system.edges"
      });
    }

    const payload = {
      "system.nodes": clone(nextGraph.nodes),
      "system.edges": clone(nextGraph.edges)
    };
    await document.update(payload);
    const applied = await this.readGraph(document);
    if (!sameSnapshot(applied, nextGraph)) {
      throw new FoundryProgressionAdapterError("post-update-mismatch", "Foundry did not persist the requested Progression graph.", {
        documentId: documentId(document),
        operation: text(options.operation),
        field: "system.nodes,system.edges"
      });
    }
    return { status: "applied", document };
  }
}

function packFrom(game, collection) {
  const direct = game?.packs?.get?.(collection);
  if (direct) return direct;
  return valuesIn(game?.packs).find(pack => packCollection(pack) === collection) ?? null;
}

function exactRoutePack({ game, systemId, route, requireWritable = false }) {
  const collection = text(route?.collection);
  const name = text(route?.packName);
  if (route?.registered !== true || !collection || !name || collection !== `${systemId}.${name}`) {
    throw new FoundryProgressionAdapterError("canonical-route-invalid", "Canonical definition writes require an exact registered system-pack route.", {
      collection,
      packName: name,
      systemId
    });
  }
  const pack = packFrom(game, collection);
  if (!pack) throw new FoundryProgressionAdapterError("canonical-pack-missing", `Canonical pack is unavailable: ${collection}`, { collection });
  if (!isExactSystemItemPack(pack, systemId) || packCollection(pack) !== collection || packName(pack) !== name) {
    throw new FoundryProgressionAdapterError("canonical-pack-identity-mismatch", `Canonical pack identity does not match its registered route: ${collection}`, {
      collection,
      actualCollection: packCollection(pack),
      packageName: packOwner(pack)
    });
  }
  if (requireWritable && pack.locked === true) {
    throw new FoundryProgressionAdapterError("canonical-pack-locked", `Canonical pack is locked: ${collection}`, { collection });
  }
  return pack;
}

/** Creates canonical Items in one exact routed pack and remembers their rollback handles. */
export class FoundryCanonicalDefinitionStore {
  constructor({ game = globalThis.game, systemId = game?.system?.id ?? "Veilrunner" } = {}) {
    this.game = game;
    this.systemId = text(systemId);
    this.createdHandles = new WeakMap();
    if (!this.systemId) throw new TypeError("FoundryCanonicalDefinitionStore requires a system ID.");
  }

  async create({ route, source, definitionId: requestedDefinitionId } = {}) {
    const pack = exactRoutePack({ game: this.game, systemId: this.systemId, route, requireWritable: true });
    if (this.game?.user?.isGM !== true) {
      throw new FoundryProgressionAdapterError("canonical-pack-permission-denied", "Canonical definition creation requires a GM user.");
    }
    if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError("Canonical definition source must be an object.");
    const canonicalId = text(requestedDefinitionId);
    if (!canonicalId || text(source.system?.definitionId) !== canonicalId) {
      throw new FoundryProgressionAdapterError("canonical-definition-identity-mismatch", "Canonical definition source and request identities differ.", {
        requestedDefinitionId: canonicalId,
        sourceDefinitionId: text(source.system?.definitionId)
      });
    }
    const createDocuments = pack.documentClass?.createDocuments;
    if (typeof createDocuments !== "function") {
      throw new FoundryProgressionAdapterError("canonical-pack-create-unavailable", `Canonical pack does not expose Foundry createDocuments(): ${route.collection}`, {
        collection: route.collection
      });
    }

    const payload = clone(source);
    const created = await createDocuments.call(pack.documentClass, [payload], { pack: route.collection });
    if (!Array.isArray(created) || created.length !== 1) {
      throw new FoundryProgressionAdapterError("canonical-create-result-invalid", "Foundry did not return exactly one created canonical document.", {
        collection: route.collection,
        count: Array.isArray(created) ? created.length : null
      });
    }
    const document = created[0];
    const id = documentId(document);
    if (!document || !id || definitionId(document) !== canonicalId || documentType(document) !== text(source.type)) {
      throw new FoundryProgressionAdapterError("canonical-create-handle-invalid", "Foundry returned a canonical document with an unexpected identity.", {
        collection: route.collection,
        documentId: id,
        definitionId: definitionId(document),
        type: documentType(document)
      });
    }
    const documentPack = text(document.pack ?? document.compendium?.collection);
    if (documentPack && documentPack !== route.collection) {
      throw new FoundryProgressionAdapterError("canonical-create-pack-mismatch", "Created canonical document belongs to a different pack.", {
        expected: route.collection,
        actual: documentPack
      });
    }
    this.createdHandles.set(document, Object.freeze({
      collection: route.collection,
      documentId: id,
      definitionId: canonicalId,
      pack
    }));
    return document;
  }

  async delete({ route, document, definitionId: requestedDefinitionId } = {}) {
    const pack = exactRoutePack({ game: this.game, systemId: this.systemId, route, requireWritable: true });
    const handle = document && typeof document === "object" ? this.createdHandles.get(document) : null;
    if (!handle || handle.pack !== pack || handle.collection !== route.collection) {
      throw new FoundryProgressionAdapterError("canonical-delete-handle-unknown", "Rollback may delete only the exact document handle returned by this store.", {
        collection: text(route?.collection),
        documentId: documentId(document)
      });
    }
    if (
      documentId(document) !== handle.documentId
      || definitionId(document) !== handle.definitionId
      || text(requestedDefinitionId) !== handle.definitionId
    ) {
      throw new FoundryProgressionAdapterError("canonical-delete-handle-drift", "Created canonical document identity changed before rollback.", {
        collection: handle.collection,
        documentId: documentId(document),
        definitionId: definitionId(document)
      });
    }
    if (typeof document.delete !== "function") {
      throw new FoundryProgressionAdapterError("canonical-delete-unavailable", "Created canonical document does not expose Foundry delete().", {
        collection: handle.collection,
        documentId: handle.documentId
      });
    }
    await document.delete();
    this.createdHandles.delete(document);
  }
}

function failure(scope, code, message, details = {}) {
  return { scope, code, message, ...details };
}

function unresolved(code, message, details = {}) {
  return { code, message, ...details };
}

function result(records, { complete = true, unresolved: unresolvedEntries = [], failures = [] } = {}) {
  return {
    complete: complete === true && failures.length === 0,
    records,
    unresolved: unresolvedEntries,
    failures
  };
}

function referenceRecord(document, value, options = {}) {
  return {
    recordId: documentId(document),
    recordName: text(document?.name ?? value?.name),
    value,
    ...options
  };
}

function readDocumentRecord(document, options = {}) {
  try {
    return { record: referenceRecord(document, documentSource(document), options), unresolved: null };
  } catch (error) {
    return {
      record: null,
      unresolved: unresolved("document-source-unreadable", error instanceof Error ? error.message : String(error), {
        recordId: documentId(document),
        recordName: text(document?.name),
        ...options
      })
    };
  }
}

/** Supplies the six explicit decoded-snapshot readers required by reference discovery. */
export class FoundryDefinitionReferenceReaders {
  constructor({ game = globalThis.game, router, systemId = game?.system?.id ?? "Veilrunner", decodeSetting = setting => setting?.value } = {}) {
    if (typeof router?.isCanonicalPack !== "function") throw new TypeError("FoundryDefinitionReferenceReaders requires a canonical CompendiumRouter.");
    if (typeof decodeSetting !== "function") throw new TypeError("decodeSetting must be a function.");
    this.game = game;
    this.router = router;
    this.systemId = text(systemId);
    this.decodeSetting = decodeSetting;
  }

  readers() {
    return Object.freeze({
      "progression-nodes": Object.freeze({ read: () => this.readProgressionNodes() }),
      "canonical-definitions": Object.freeze({ read: () => this.readCanonicalDefinitions() }),
      "world-items": Object.freeze({ read: () => this.readWorldItems() }),
      "actor-items": Object.freeze({ read: () => this.readActorItems() }),
      "semantic-links": Object.freeze({ read: () => this.readSemanticLinks() }),
      "world-settings": Object.freeze({ read: () => this.readWorldSettings() })
    });
  }

  #canonicalPacks() {
    return valuesIn(this.game?.packs)
      .filter(pack => isExactSystemItemPack(pack, this.systemId))
      .filter(pack => this.router.isCanonicalPack(pack))
      .sort((left, right) => compareText(packCollection(left), packCollection(right)));
  }

  async #canonicalDocuments(scope) {
    const documents = [];
    const failures = [];
    if (!this.game?.packs) {
      failures.push(failure(scope, "foundry-pack-collection-unavailable", "Foundry pack collection is unavailable."));
      return { documents, failures };
    }
    for (const pack of this.#canonicalPacks()) {
      const collection = packCollection(pack);
      if (typeof pack.getDocuments !== "function") {
        failures.push(failure(scope, "canonical-pack-unreadable", `Canonical pack does not expose getDocuments(): ${collection}`, { collection }));
        continue;
      }
      try {
        const packDocuments = await pack.getDocuments();
        if (!Array.isArray(packDocuments) && typeof packDocuments?.[Symbol.iterator] !== "function") {
          throw new TypeError("getDocuments() did not return an iterable collection.");
        }
        for (const document of valuesIn(packDocuments)) documents.push({ document, collection });
      } catch (error) {
        failures.push(failure(scope, "canonical-pack-read-failed", error instanceof Error ? error.message : String(error), { collection }));
      }
    }
    documents.sort((left, right) => compareText(left.collection, right.collection) || compareText(documentId(left.document), documentId(right.document)));
    return { documents, failures };
  }

  async readProgressionNodes() {
    const scope = "progression-nodes";
    const { documents, failures } = await this.#canonicalDocuments(scope);
    const records = [];
    const unresolvedEntries = [];
    for (const { document, collection } of documents.filter(entry => documentType(entry.document) === "progression")) {
      let source;
      try {
        source = documentSource(document);
      } catch (error) {
        unresolvedEntries.push(unresolved("document-source-unreadable", error instanceof Error ? error.message : String(error), {
          collection,
          recordId: documentId(document),
          recordName: text(document?.name)
        }));
        continue;
      }
      const nodes = source.system?.nodes;
      if (!Array.isArray(nodes)) {
        unresolvedEntries.push(unresolved("progression-nodes-unreadable", "Progression source nodes are not an array.", {
          collection,
          ownerId: documentId(document),
          ownerName: text(document?.name),
          ownerType: "progression",
          recordId: documentId(document),
          path: "system.nodes"
        }));
        continue;
      }
      for (const [index, node] of nodes.entries()) records.push({
        recordId: text(node?.id),
        recordName: text(node?.presentation?.label),
        value: clone(node),
        ownerId: documentId(document),
        ownerName: text(document?.name),
        ownerType: "progression",
        collection,
        pathPrefix: `system.nodes.${index}`
      });
    }
    return result(records, { complete: failures.length === 0, unresolved: unresolvedEntries, failures });
  }

  async readCanonicalDefinitions() {
    const scope = "canonical-definitions";
    const { documents, failures } = await this.#canonicalDocuments(scope);
    const records = [];
    const unresolvedEntries = [];
    for (const { document, collection } of documents) {
      const read = readDocumentRecord(document, { collection });
      if (read.unresolved) {
        unresolvedEntries.push(read.unresolved);
        continue;
      }
      if (documentType(document) === "progression") {
        if (read.record.value.system && typeof read.record.value.system === "object") {
          delete read.record.value.system.nodes;
          delete read.record.value.system.edges;
        }
      }
      records.push(read.record);
    }
    return result(records, { complete: failures.length === 0, unresolved: unresolvedEntries, failures });
  }

  async readWorldItems() {
    const records = [];
    const unresolvedEntries = [];
    if (!this.game?.items) {
      return result(records, {
        complete: false,
        failures: [failure("world-items", "world-item-collection-unavailable", "Foundry World Item collection is unavailable.")]
      });
    }
    for (const document of valuesIn(this.game?.items).sort((left, right) => compareText(documentId(left), documentId(right)))) {
      const read = readDocumentRecord(document, { collection: "world.items" });
      if (read.unresolved) unresolvedEntries.push(read.unresolved);
      else records.push(read.record);
    }
    return result(records, { unresolved: unresolvedEntries });
  }

  async readActorItems() {
    const records = [];
    const unresolvedEntries = [];
    if (!this.game?.actors) {
      return result(records, {
        complete: false,
        failures: [failure("actor-items", "actor-collection-unavailable", "Foundry Actor collection is unavailable.")]
      });
    }
    const actors = valuesIn(this.game?.actors).sort((left, right) => compareText(documentId(left), documentId(right)));
    for (const actor of actors) {
      const items = valuesIn(actor?.items).sort((left, right) => compareText(documentId(left), documentId(right)));
      for (const [index, document] of items.entries()) {
        const read = readDocumentRecord(document, {
          ownerId: documentId(actor),
          ownerName: text(actor?.name),
          ownerType: "Actor",
          collection: "world.actors",
          pathPrefix: `items.${index}`
        });
        if (read.unresolved) unresolvedEntries.push(read.unresolved);
        else records.push(read.record);
      }
    }
    return result(records, { unresolved: unresolvedEntries });
  }

  async readSemanticLinks() {
    const records = [];
    const unresolvedEntries = [];
    if (!this.game?.actors) {
      return result(records, {
        complete: false,
        failures: [failure("semantic-links", "actor-collection-unavailable", "Foundry Actor collection is unavailable for semantic-link discovery.")]
      });
    }
    const actors = valuesIn(this.game?.actors).sort((left, right) => compareText(documentId(left), documentId(right)));
    for (const actor of actors) {
      const read = readDocumentRecord(actor, {
        ownerId: documentId(actor),
        ownerName: text(actor?.name),
        ownerType: "Actor",
        collection: "world.actors"
      });
      if (read.unresolved) {
        unresolvedEntries.push(read.unresolved);
        continue;
      }
      delete read.record.value.items;
      records.push(read.record);
    }
    return result(records, { unresolved: unresolvedEntries });
  }

  async readWorldSettings() {
    const storage = this.game?.settings?.storage?.get?.("world");
    if (!storage) {
      return result([], {
        complete: false,
        failures: [failure("world-settings", "world-setting-storage-unavailable", "Foundry world-setting storage is unavailable.")]
      });
    }
    const records = [];
    const unresolvedEntries = [];
    const settings = valuesIn(storage).sort((left, right) => compareText(left?.key ?? left?._source?.key, right?.key ?? right?._source?.key));
    for (const setting of settings) {
      const key = text(setting?.key ?? setting?._source?.key);
      if (!key) {
        unresolvedEntries.push(unresolved("world-setting-key-missing", "World setting requires a stable key."));
        continue;
      }
      try {
        const value = clone(this.decodeSetting(setting));
        if (value === undefined) throw new TypeError("World setting did not expose a decoded value.");
        records.push({
          recordId: key,
          recordName: key,
          value,
          collection: "world.settings"
        });
      } catch (error) {
        unresolvedEntries.push(unresolved("world-setting-value-unreadable", error instanceof Error ? error.message : String(error), {
          collection: "world.settings",
          recordId: key,
          recordName: key
        }));
      }
    }
    return result(records, { unresolved: unresolvedEntries });
  }
}

export function createFoundryDefinitionReferenceReaders(options = {}) {
  return new FoundryDefinitionReferenceReaders(options).readers();
}
