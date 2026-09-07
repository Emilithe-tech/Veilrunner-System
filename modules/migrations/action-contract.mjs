import {
  migrateActionRequirements,
  migrateActionSystemData,
  normalizeActionMode
} from "../data/item/action-formula.mjs";

export const ACTION_CONTRACT_MIGRATION_VERSION = 1;
export const ACTION_CONTRACT_MIGRATION_FLAG_PATH = "flags.Veilrunner.migrations.actionContract";
export const ACTION_CONTRACT_FIELDS = Object.freeze([
  "timing", "economy", "targeting", "requirements", "progression", "owned"
]);

export function hasCanonicalActionContractField(system, field) {
  if (!system || typeof system !== "object" || !Object.hasOwn(system, field)) return false;
  if (field !== "requirements") return true;
  const requirements = system.requirements;
  return Boolean(requirements && typeof requirements === "object" && !Array.isArray(requirements)
    && ["all", "any", "none"].every(key => Array.isArray(requirements[key])));
}

const LEGACY_REQUIREMENT_FIELDS = Object.freeze([
  "requiredDefinitionIds", "requiredEffects", "requiredItemIntents",
  "requiredItemTraits", "requiredItemTypes", "requiredTargetEffects"
]);

export class ActionContractMigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ActionContractMigrationError";
    this.details = details;
  }
}

function objectContainer(parent, key, path) {
  const value = parent[key];
  if (value === undefined || value === null) return (parent[key] = {});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ActionContractMigrationError(`Cannot stamp migration provenance because ${path} is not an object.`, { path, value });
  }
  return value;
}

function requireUnambiguousLegacyShape(system, expectedMode, itemType) {
  const explicitMode = Object.hasOwn(system, "actionMode")
    ? String(system.actionMode ?? "").trim().toLowerCase()
    : "";
  if (explicitMode && explicitMode !== expectedMode) {
    throw new ActionContractMigrationError(`Expected ${expectedMode} semantics but legacy fields resolve to ${explicitMode}.`, {
      expectedMode,
      actualMode: explicitMode,
      source: "system.actionMode"
    });
  }
  const actualMode = normalizeActionMode(system, itemType);
  if (actualMode !== expectedMode) {
    throw new ActionContractMigrationError(`Expected ${expectedMode} semantics but legacy fields resolve to ${actualMode}.`, {
      expectedMode,
      actualMode
    });
  }
  if (String(system.cost ?? "").trim()) {
    throw new ActionContractMigrationError("Legacy free-text cost requires a separate resource mapping.", { cost: system.cost });
  }
  for (const field of LEGACY_REQUIREMENT_FIELDS) {
    const value = system[field];
    if (value !== undefined && (!Array.isArray(value) || value.length !== 0)) {
      throw new ActionContractMigrationError(`Legacy ${field} requires a separate requirement mapping.`, { field, value });
    }
  }
}

function canonicalProjection(system, { itemType, includeOwnedLevel }) {
  const migrated = migrateActionSystemData(structuredClone(system), { itemType, complete: true });
  return {
    timing: structuredClone(migrated.timing),
    economy: structuredClone(migrated.economy),
    targeting: structuredClone(migrated.targeting),
    requirements: migrateActionRequirements(system.requirements),
    progression: {
      maxLevel: migrated.progression.maxLevel,
      purchase: {
        resource: "skillPoints",
        customResource: "",
        base: 1,
        perRank: 0
      },
      scaling: structuredClone(migrated.progression.scaling ?? [])
    },
    owned: {
      currentLevel: includeOwnedLevel ? migrated.owned?.currentLevel ?? null : null,
      selections: structuredClone(migrated.owned?.selections ?? [])
    }
  };
}

/** Persist canonical ActionData structures without deleting or rewriting legacy fields. */
export function prepareActionContractMigration(source, { expectedMode, includeOwnedLevel = undefined } = {}) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Action contract migration requires an Item source object.");
  }
  if (!expectedMode || !["action", "reaction", "ability", "spell"].includes(expectedMode)) {
    throw new TypeError("Action contract migration requires expectedMode action, reaction, ability, or spell.");
  }
  const sourceType = String(source.type ?? "");
  const expectedSourceType = ["ability", "spell"].includes(expectedMode) ? expectedMode : "action";
  if (sourceType !== expectedSourceType) {
    return { changed: false, sourceType, targetType: sourceType, document: source };
  }
  if (!source.system || typeof source.system !== "object" || Array.isArray(source.system)) {
    throw new ActionContractMigrationError("Legacy Action candidate requires an object-valued system source.");
  }

  const present = ACTION_CONTRACT_FIELDS.filter(field => hasCanonicalActionContractField(source.system, field));
  const marker = source.flags?.Veilrunner?.migrations?.actionContract;
  if (
    present.length === ACTION_CONTRACT_FIELDS.length
    && marker?.version === ACTION_CONTRACT_MIGRATION_VERSION
    && marker?.sourceType === sourceType
    && marker?.mode === expectedMode
  ) {
    return { changed: false, sourceType, targetType: sourceType, document: source };
  }
  if (present.length || marker !== undefined) {
    throw new ActionContractMigrationError("Item has partial canonical data or conflicting migration provenance.", {
      present,
      marker
    });
  }
  requireUnambiguousLegacyShape(source.system, expectedMode, expectedSourceType);

  const document = structuredClone(source);
  Object.assign(document.system, canonicalProjection(source.system, {
    itemType: expectedSourceType,
    includeOwnedLevel: includeOwnedLevel ?? expectedSourceType === "action"
  }));
  const flags = objectContainer(document, "flags", "flags");
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  migrations.actionContract = {
    version: ACTION_CONTRACT_MIGRATION_VERSION,
    sourceType,
    mode: expectedMode
  };
  return { changed: true, sourceType, targetType: sourceType, document };
}
