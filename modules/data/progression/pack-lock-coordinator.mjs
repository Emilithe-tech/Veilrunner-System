export const PROGRESSION_PACK_LOCK_SESSION_VERSION = 1;

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

function messageOf(error) {
  return error instanceof Error ? error.message : String(error ?? "Unknown error");
}

function sessionError(code, message, options = {}) {
  return new ProgressionPackLockSessionError(code, message, options);
}

export class ProgressionPackLockSessionError extends Error {
  constructor(code, message, {
    phase = "preflight",
    status = "failed",
    cause,
    collections = [],
    transitions = [],
    operationResult
  } = {}) {
    super(message, cause === undefined ? {} : { cause });
    this.name = "ProgressionPackLockSessionError";
    this.code = code;
    this.phase = phase;
    this.status = status;
    this.collections = deepFreeze([...collections]);
    this.transitions = deepFreeze(transitions.map(entry => ({ ...entry })));
    if (operationResult !== undefined) this.operationResult = operationResult;
  }
}

/**
 * Coordinates one GM authoring transaction against exact system Item packs.
 * Foundry V14 CompendiumCollection.configure({locked}) persists core pack
 * configuration, so this class is inert until run() is explicitly invoked.
 */
export class ProgressionPackLockCoordinator {
  constructor({ game = globalThis.game, systemId = game?.system?.id ?? "Veilrunner" } = {}) {
    this.game = game;
    this.systemId = text(systemId);
    this.active = false;
  }

  #pack(collection) {
    return this.game?.packs?.get?.(collection)
      ?? valuesIn(this.game?.packs).find(pack => packCollection(pack) === collection)
      ?? null;
  }

  #preflight(collections) {
    if (this.systemId !== "Veilrunner") {
      throw sessionError("system-identity-mismatch", "Progression pack lock sessions require the case-sensitive Veilrunner system identity.", {
        collections,
        status: "refused"
      });
    }
    if (this.game?.user?.isGM !== true) {
      throw sessionError("gm-required", "Progression pack lock sessions require a GM user.", { collections, status: "refused" });
    }
    if (!Array.isArray(collections) || !collections.length) {
      throw sessionError("collections-required", "Progression pack lock sessions require at least one exact collection.", { status: "refused" });
    }
    const normalized = collections.map(text);
    if (normalized.some(collection => !collection.startsWith("Veilrunner."))) {
      throw sessionError("collection-identity-invalid", "Progression pack lock sessions accept only exact Veilrunner collections.", { collections: normalized, status: "refused" });
    }
    if (new Set(normalized).size !== normalized.length) {
      throw sessionError("collection-duplicate", "Progression pack lock sessions refuse duplicate collections.", { collections: normalized, status: "refused" });
    }
    return normalized.map(collection => {
      const pack = this.#pack(collection);
      if (!pack) throw sessionError("canonical-pack-missing", `Canonical pack is unavailable: ${collection}`, { collections: normalized, status: "refused" });
      if (packCollection(pack) !== collection || packOwner(pack) !== this.systemId || pack.documentName !== "Item") {
        throw sessionError("canonical-pack-identity-mismatch", `Canonical pack has an unexpected identity: ${collection}`, {
          collections: normalized,
          status: "refused"
        });
      }
      if (pack.visible === false) throw sessionError("canonical-pack-hidden", `Canonical pack is not visible: ${collection}`, { collections: normalized, status: "refused" });
      if (typeof pack.configure !== "function") {
        throw sessionError("pack-configuration-unavailable", `Canonical pack does not expose configure(): ${collection}`, { collections: normalized, status: "refused" });
      }
      return { collection, pack, originalLocked: pack.locked === true, unlockAttempted: false };
    });
  }

  async #restore(entries, transitions) {
    const failures = [];
    for (const entry of [...entries].reverse()) {
      if (!entry.originalLocked || !entry.unlockAttempted) continue;
      try {
        await entry.pack.configure({ locked: true });
        if (entry.pack.locked !== true) throw new Error("Foundry did not report the pack as locked after configuration.");
        transitions.push({ collection: entry.collection, action: "relock", status: "succeeded" });
      } catch (error) {
        const failure = { collection: entry.collection, action: "relock", status: "failed", message: messageOf(error), locked: entry.pack.locked === true };
        transitions.push(failure);
        failures.push(failure);
      }
    }
    return failures;
  }

  async run({ collections, label = "progression-authoring", execute } = {}) {
    if (this.active) {
      throw sessionError("lock-session-active", "Another progression pack lock session is already active.", {
        collections: Array.isArray(collections) ? collections.map(text) : [],
        status: "refused"
      });
    }
    if (typeof execute !== "function") throw new TypeError("Progression pack lock sessions require execute().");
    this.active = true;
    let entries = [];
    const transitions = [];
    try {
      entries = this.#preflight(collections);
      try {
        for (const entry of entries) {
          if (!entry.originalLocked) {
            transitions.push({ collection: entry.collection, action: "unlock", status: "not-needed" });
            continue;
          }
          entry.unlockAttempted = true;
          await entry.pack.configure({ locked: false });
          if (entry.pack.locked !== false) throw new Error("Foundry did not report the pack as unlocked after configuration.");
          transitions.push({ collection: entry.collection, action: "unlock", status: "succeeded" });
        }
      } catch (cause) {
        const restorationFailures = await this.#restore(entries, transitions);
        throw sessionError("pack-unlock-failed", `Canonical pack unlock failed: ${messageOf(cause)}`, {
          phase: "unlock",
          status: restorationFailures.length ? "partial" : "refused",
          cause,
          collections: entries.map(entry => entry.collection),
          transitions
        });
      }

      let operationResult;
      let operationError = null;
      try {
        operationResult = await execute({
          label: text(label) || "progression-authoring",
          packs: new Map(entries.map(entry => [entry.collection, entry.pack]))
        });
      } catch (error) {
        operationError = error;
      }

      const restorationFailures = await this.#restore(entries, transitions);
      if (restorationFailures.length) {
        throw sessionError("pack-relock-failed", "Progression authoring finished with one or more canonical packs not verifiably restored to their original lock state.", {
          phase: "relock",
          status: "partial",
          cause: operationError ?? restorationFailures[0],
          collections: entries.map(entry => entry.collection),
          transitions,
          operationResult
        });
      }
      if (operationError) {
        throw sessionError("authoring-operation-failed", `Progression authoring operation failed: ${messageOf(operationError)}`, {
          phase: "operation",
          status: "failed",
          cause: operationError,
          collections: entries.map(entry => entry.collection),
          transitions
        });
      }
      const receipt = deepFreeze({
        version: PROGRESSION_PACK_LOCK_SESSION_VERSION,
        operation: text(label) || "progression-authoring",
        status: "completed",
        collections: entries.map(entry => entry.collection),
        transitions
      });
      return Object.freeze({ value: operationResult, receipt });
    } finally {
      this.active = false;
    }
  }
}
