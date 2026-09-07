import { canonicalIdBuilder } from "./canonical-id.mjs";
import { CompendiumRouter } from "./compendium-router.mjs";
import { DefinitionIndex } from "./definition-index.mjs";
import { itemHasCapability } from "./item-capabilities.mjs";

const documentsIn = collection => Array.isArray(collection?.contents)
  ? collection.contents : Array.from(collection?.values?.() ?? collection ?? []);

export class CanonicalReadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CanonicalReadError";
    this.code = code;
  }
}

/** Read only the semantic routes needed by one consumer. Never substitutes a World Item. */
export class CanonicalDefinitionReader {
  constructor(types, { game = globalThis.game, capability = null } = {}) {
    this.types = new Set(types);
    this.game = game;
    this.capability = capability;
    this.systemId = game?.system?.id ?? "Veilrunner";
    const packs = documentsIn(game?.packs);
    this.router = new CompendiumRouter({ systemId: this.systemId, packs });
    this.collections = new Set([...this.types].flatMap(type => this.router.routesForType(type, { strict: true }).map(route => route.collection)));
    this.packs = [...this.collections].map(collection => packs.find(pack => pack.collection === collection));
    this.assertReadable();
    this.index = new DefinitionIndex({ game: { system: game?.system, packs: this.packs }, systemId: this.systemId, router: this.router });
  }

  assertReadable() {
    for (const collection of this.collections) {
      const pack = documentsIn(this.game?.packs).find(pack => pack.collection === collection);
      if (!pack || !this.packs.includes(pack) || pack.documentName !== "Item"
        || (pack.metadata?.packageName ?? pack.metadata?.system) !== this.systemId) {
        throw new CanonicalReadError("pack-identity-mismatch", `Canonical pack ${collection} is unavailable or has changed. Refresh the catalog.`);
      }
      if (pack.visible === false || pack.testUserPermission?.(this.game?.user, "OBSERVER") === false) {
        throw new CanonicalReadError("pack-unreadable", `Canonical pack ${collection} is not readable.`);
      }
    }
  }

  async records() {
    this.assertReadable();
    const records = await this.index.records();
    const audit = this.index.audit();
    if ([...audit.invalid, ...audit.unassigned].some(record => this.types.has(record.type))) {
      throw new CanonicalReadError("invalid-canonical-identities", "Canonical definitions contain missing or invalid identities.");
    }
    const selected = records.filter(record => this.types.has(record.type));
    for (const record of selected) {
      await this.index.metadata(record.definitionId); // Duplicate identities are never resolved by order.
      this.assertRecord(record);
    }
    return selected;
  }

  assertRecord(record) {
    const expected = this.router.route(record, { strict: true });
    if (!this.types.has(record.type) || expected.collection !== record.packCollection
      || (this.capability && !itemHasCapability(record.type, this.capability))) {
      throw new CanonicalReadError("definition-route-mismatch", `Definition ${record.definitionId} is not available from the required canonical route.`);
    }
  }

  async resolve(definitionId) {
    this.assertReadable();
    if (!canonicalIdBuilder.isValid(definitionId)) {
      throw new CanonicalReadError("invalid-definition-id", "A saved canonical definition identity is required.");
    }
    const record = await this.index.metadata(definitionId);
    if (!record) throw new CanonicalReadError("missing-definition", `Canonical definition ${definitionId} is unavailable.`);
    this.assertRecord(record);
    const document = await this.index.resolve(definitionId);
    this.assertReadable();
    if (document && this.router.route(document, { strict: true }).collection !== record.packCollection) {
      throw new CanonicalReadError("definition-route-mismatch", "Canonical definition timing no longer matches its indexed route.");
    }
    if (document?.documentName !== "Item" || document.type !== record.type
      || document.system?.definitionId !== definitionId || (document.id ?? document._id) !== record.documentId
      || document.uuid !== `Compendium.${record.packCollection}.Item.${record.documentId}`) {
      throw new CanonicalReadError("definition-identity-mismatch", `Canonical definition ${definitionId} no longer matches its index.`);
    }
    return document;
  }

  async documents() {
    const documents = [];
    for (const record of await this.records()) documents.push(await this.resolve(record.definitionId));
    return documents;
  }
}
