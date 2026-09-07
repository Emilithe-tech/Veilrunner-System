export const TRAIT_TYPE_MIGRATION_VERSION = 1;
export const TRAIT_TYPE_MIGRATION_FLAG_PATH = "flags.Veilrunner.migrations.traitType";

export class TraitTypeMigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "TraitTypeMigrationError";
    this.details = details;
  }
}

function objectContainer(parent, key, path) {
  const value = parent[key];
  if (value === undefined || value === null) return (parent[key] = {});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new TraitTypeMigrationError(`Cannot stamp migration provenance because ${path} is not an object.`, { path, value });
  }
  return value;
}

function requirePassiveTraitShape(source) {
  const system = source.system;
  if (!system || typeof system !== "object" || Array.isArray(system)) {
    throw new TraitTypeMigrationError("Legacy trait candidates require an object-valued system source.");
  }
  if (!Array.isArray(system.traits) || !system.traits.includes("trait")) {
    throw new TraitTypeMigrationError("Legacy trait candidate is missing the explicit trait semantic tag.", { traits: system.traits });
  }
  const expectedScalars = {
    actions: 0,
    damageDice: 0,
    damageType: "",
    featured: false,
    recharge: ""
  };
  for (const [field, expected] of Object.entries(expectedScalars)) {
    if (system[field] !== expected) {
      throw new TraitTypeMigrationError(`Legacy trait candidate has active ability data at system.${field}.`, {
        field,
        expected,
        actual: system[field]
      });
    }
  }
  if (!Array.isArray(system.providedActionIds) || system.providedActionIds.length !== 0) {
    throw new TraitTypeMigrationError("Legacy trait candidate provides actions and cannot be safely retyped.", {
      providedActionIds: system.providedActionIds
    });
  }
}

/** Prepare a complete replacement document for the ability -> trait type migration. */
export function prepareTraitTypeMigration(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Trait type migration requires an Item source object.");
  }
  const sourceType = String(source.type ?? "");
  if (sourceType !== "ability") {
    return { changed: false, sourceType, targetType: sourceType, document: source };
  }
  requirePassiveTraitShape(source);

  const document = structuredClone(source);
  const flags = objectContainer(document, "flags", "flags");
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  if (Object.hasOwn(migrations, "traitType")) {
    throw new TraitTypeMigrationError(
      "Legacy trait candidate already has a traitType migration marker; refusing to overwrite it.",
      { marker: migrations.traitType }
    );
  }

  document.type = "trait";
  migrations.traitType = {
    version: TRAIT_TYPE_MIGRATION_VERSION,
    sourceType
  };
  return { changed: true, sourceType, targetType: "trait", document };
}
