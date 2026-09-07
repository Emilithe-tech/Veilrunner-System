export const QUALITY_ALIAS_MIGRATION_VERSION = 1;
export const QUALITY_ALIAS_MIGRATION_FLAG_PATH = "flags.Veilrunner.migrations.qualityAlias";

const LEGACY_QUALITY_TYPES = new Set(["perk", "flaw"]);

export class QualityAliasMigrationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "QualityAliasMigrationError";
    this.details = details;
  }
}

function objectContainer(parent, key, path) {
  const value = parent[key];
  if (value === undefined || value === null) return (parent[key] = {});
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new QualityAliasMigrationError(`Cannot stamp migration provenance because ${path} is not an object.`, { path, value });
  }
  return value;
}

/** Prepare a complete replacement document for the perk/flaw -> quality alias migration. */
export function prepareQualityAliasMigration(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new TypeError("Quality alias migration requires an Item source object.");
  }
  const sourceType = String(source.type ?? "");
  if (!LEGACY_QUALITY_TYPES.has(sourceType)) {
    return { changed: false, sourceType, targetType: sourceType, document: source };
  }
  if (!source.system || typeof source.system !== "object" || Array.isArray(source.system)) {
    throw new QualityAliasMigrationError("Legacy quality aliases require an object-valued system source.", { sourceType });
  }
  if (source.system.kind !== sourceType) {
    throw new QualityAliasMigrationError(
      `Legacy ${sourceType} Item has conflicting system.kind ${JSON.stringify(source.system.kind)}.`,
      { sourceType, kind: source.system.kind }
    );
  }

  const document = structuredClone(source);
  const flags = objectContainer(document, "flags", "flags");
  const veilrunner = objectContainer(flags, "Veilrunner", "flags.Veilrunner");
  const migrations = objectContainer(veilrunner, "migrations", "flags.Veilrunner.migrations");
  if (Object.hasOwn(migrations, "qualityAlias")) {
    throw new QualityAliasMigrationError(
      "Legacy quality alias already has a qualityAlias migration marker; refusing to overwrite it.",
      { sourceType, marker: migrations.qualityAlias }
    );
  }

  document.type = "quality";
  migrations.qualityAlias = {
    version: QUALITY_ALIAS_MIGRATION_VERSION,
    sourceType
  };
  return { changed: true, sourceType, targetType: "quality", document };
}
