import { normalizeSemanticItemType } from "./item-capabilities.mjs";

const REACTION_ROUTE = Object.freeze({ routeKey: "reactions", packNames: Object.freeze(["character-library"]) });

export const DEFAULT_COMPENDIUM_ROUTES = Object.freeze({
  action: Object.freeze({ routeKey: "actions", packNames: Object.freeze(["character-library"]) }),
  ability: Object.freeze({ routeKey: "abilities", packNames: Object.freeze(["character-library"]) }),
  spell: Object.freeze({ routeKey: "abilities", packNames: Object.freeze(["character-library"]) }),
  talent: Object.freeze({ routeKey: "talents-skills", packNames: Object.freeze(["character-library"]) }),
  skill: Object.freeze({ routeKey: "talents-skills", packNames: Object.freeze(["character-library"]) }),
  quality: Object.freeze({ routeKey: "qualities", packNames: Object.freeze(["character-library"]) }),
  practice: Object.freeze({ routeKey: "progression", packNames: Object.freeze(["character-library"]) }),
  progression: Object.freeze({ routeKey: "progression", packNames: Object.freeze(["character-library"]) }),
  trait: Object.freeze({ routeKey: "traits", packNames: Object.freeze(["character-library"]) }),
  weapon: Object.freeze({ routeKey: "weapons", packNames: Object.freeze(["equipment"]) }),
  armor: Object.freeze({ routeKey: "armor", packNames: Object.freeze(["equipment"]) }),
  shield: Object.freeze({ routeKey: "armor", packNames: Object.freeze(["equipment"]) }),
  ammunition: Object.freeze({ routeKey: "ammunition", packNames: Object.freeze(["equipment"]) }),
  magazine: Object.freeze({ routeKey: "ammunition", packNames: Object.freeze(["equipment"]) }),
  accessory: Object.freeze({ routeKey: "equipment", packNames: Object.freeze(["equipment"]) }),
  consumable: Object.freeze({ routeKey: "equipment", packNames: Object.freeze(["equipment"]) }),
  container: Object.freeze({ routeKey: "equipment", packNames: Object.freeze(["equipment"]) }),
  equipment: Object.freeze({ routeKey: "equipment", packNames: Object.freeze(["equipment"]) }),
  treasure: Object.freeze({ routeKey: "equipment", packNames: Object.freeze(["equipment"]) }),
  species: Object.freeze({ routeKey: "character-origins", packNames: Object.freeze(["character-library"]) }),
  origin: Object.freeze({ routeKey: "character-origins", packNames: Object.freeze(["character-library"]) }),
  background: Object.freeze({ routeKey: "character-origins", packNames: Object.freeze(["character-library"]) }),
  archetype: Object.freeze({ routeKey: "character-paths", packNames: Object.freeze(["character-library"]) }),
  profession: Object.freeze({ routeKey: "character-paths", packNames: Object.freeze(["character-library"]) }),
  discipline: Object.freeze({ routeKey: "character-paths", packNames: Object.freeze(["character-library"]) }),
  language: Object.freeze({ routeKey: "languages", packNames: Object.freeze(["character-library"]) })
});

function packName(pack) {
  // Manifest entries expose `name`; live CompendiumCollection instances expose
  // the stable identifier through metadata/collection and may use `name` for a
  // human-readable label. Prefer canonical runtime identity when available.
  return String(pack?.metadata?.name ?? pack?.collection ?? pack?.name ?? "").split(".").at(-1);
}

export class CompendiumRouteError extends Error {
  constructor(code, message, route = null) {
    super(message);
    this.name = "CompendiumRouteError";
    this.code = code;
    this.route = route;
  }
}

export class CompendiumRouter {
  constructor({ systemId = "Veilrunner", packs = [], routes = DEFAULT_COMPENDIUM_ROUTES } = {}) {
    this.systemId = String(systemId);
    this.routes = routes;
    this.setManifestPacks(packs);
  }

  setManifestPacks(packs = []) {
    this.packs = new Map(Array.from(packs ?? [], pack => [packName(pack), pack]));
    return this;
  }

  route(itemOrType, { strict = false } = {}) {
    const requestedType = String(typeof itemOrType === "string" ? itemOrType : itemOrType?.type ?? "").trim().toLowerCase();
    const type = normalizeSemanticItemType(requestedType);
    const timing = itemOrType?.system?.timing?.type ?? itemOrType?.timing;
    const definition = type === "action" && timing === "reaction" ? REACTION_ROUTE : this.routes[type];
    if (!definition) {
      if (strict) throw new CompendiumRouteError("unknown-item-type", `No canonical compendium route exists for Item type: ${requestedType || "(blank)"}`);
      return null;
    }

    const registeredPackName = definition.packNames.find(name => this.packs.has(name)) ?? null;
    const desiredPackName = registeredPackName ?? definition.packNames[0];
    const manifestPack = registeredPackName ? this.packs.get(registeredPackName) : null;
    const route = Object.freeze({
      requestedType,
      type,
      routeKey: definition.routeKey,
      packName: desiredPackName,
      collection: registeredPackName ? `${this.systemId}.${registeredPackName}` : null,
      path: manifestPack?.path ?? null,
      registered: Boolean(registeredPackName),
      status: registeredPackName ? "ready" : "missing-pack"
    });
    if (strict && !route.registered) {
      throw new CompendiumRouteError("missing-pack", `Canonical route '${route.routeKey}' has no registered pack for Item type '${type}'.`, route);
    }
    return route;
  }

  routesForType(type, options = {}) {
    const routes = [this.route(type, options)];
    if (type === "action") routes.push(this.route({ type, system: { timing: { type: "reaction" } } }, options));
    return routes.filter(Boolean);
  }

  canonicalPackNames() {
    return new Set([...Object.values(this.routes), REACTION_ROUTE].flatMap(route => route.packNames).filter(name => this.packs.has(name)));
  }

  isCanonicalPack(pack) {
    return this.canonicalPackNames().has(packName(pack));
  }
}
