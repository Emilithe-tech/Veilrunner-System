import {
  executeProgressionCanvasIntent,
  prepareProgressionCanvasIntent,
  projectProgressionCanvasFailure
} from "./canvas-intent-adapter.mjs";

export const PROGRESSION_CANVAS_SESSION_VERSION = 2;

const PREVIEW_METHODS = Object.freeze({
  "create-content": "previewCreateContent",
  "place-existing": "previewPlaceExisting",
  "remove-node": "previewRemoveNode",
  "update-layout": "previewLayout",
  "replace-connections": "previewConnections"
});

const clone = value => {
  if (value === undefined) return undefined;
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
};
const text = value => String(value ?? "").trim();

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function preparedIdentity(intent) {
  return {
    operation: text(intent?.operation).toLowerCase(),
    page: text(intent?.page).toLowerCase()
  };
}

export function projectProgressionCanvasPreview(prepared, result) {
  return deepFreeze({
    version: PROGRESSION_CANVAS_SESSION_VERSION,
    operation: prepared.operation,
    page: prepared.page,
    state: "previewed",
    status: text(result?.status) || "validated",
    prepared: clone(prepared),
    preview: clone(result)
  });
}

/**
 * One presentation-safe boundary for canonical canvas previews and commits.
 * Preview dispatch is always read-only; commit dispatch still requires the
 * runtime's distinct live-mutation authorization.
 */
export class ProgressionCanvasSession {
  #previews = new WeakSet();
  #committing = false;

  constructor({ runtime } = {}) {
    if (typeof runtime?.capabilities !== "function") throw new TypeError("Progression canvas session requires a runtime with capabilities().");
    this.runtime = runtime;
  }

  capabilities() {
    const runtime = this.runtime.capabilities();
    return deepFreeze({
      version: PROGRESSION_CANVAS_SESSION_VERSION,
      operations: Object.keys(PREVIEW_METHODS),
      preview: true,
      commit: runtime?.liveMutationApproved === true,
      liveMutationApproved: runtime?.liveMutationApproved === true
    });
  }

  async preview(intent) {
    let prepared;
    try {
      prepared = prepareProgressionCanvasIntent(intent);
    } catch (error) {
      return projectProgressionCanvasFailure(preparedIdentity(intent), error);
    }
    const method = PREVIEW_METHODS[prepared.operation];
    const preview = this.runtime?.[method];
    if (typeof preview !== "function") {
      return projectProgressionCanvasFailure(prepared, {
        code: "runtime-preview-unavailable",
        status: "failed",
        stage: "preview-dispatch",
        message: `Progression runtime preview method '${method}' is unavailable.`
      });
    }
    try {
      const result = projectProgressionCanvasPreview(prepared, await preview.call(this.runtime, prepared.request));
      this.#previews.add(result);
      return result;
    } catch (error) {
      return projectProgressionCanvasFailure(prepared, error);
    }
  }

  async commit(intent, { expectedGraph } = {}) {
    if (this.#committing) return projectProgressionCanvasFailure(preparedIdentity(intent), {
      code: "canvas-commit-in-progress", status: "failed", stage: "dispatch",
      message: "A canonical transaction is already in progress. Wait for its receipt."
    });
    this.#committing = true;
    try {
      return await executeProgressionCanvasIntent({ runtime: this.runtime, intent, expectedGraph });
    } finally {
      this.#committing = false;
    }
  }

  /** Consume one exact, session-issued preview; acknowledgment lives in the review workflow. */
  commitReviewed(intent, preview) {
    let prepared;
    try {
      prepared = prepareProgressionCanvasIntent(intent);
    } catch (error) {
      return Promise.resolve(projectProgressionCanvasFailure(preparedIdentity(intent), error));
    }
    if (!preview || !this.#previews.has(preview) || JSON.stringify(prepared) !== JSON.stringify(preview.prepared)) {
      return Promise.resolve(projectProgressionCanvasFailure(prepared, {
        code: "canvas-preview-mismatch", status: "failed", stage: "confirmation",
        message: "This draft requires a fresh preview from the current canonical session."
      }));
    }
    const expectedGraph = preview.preview?.beforeGraph;
    if (!expectedGraph || typeof expectedGraph !== "object" || Array.isArray(expectedGraph)) {
      return Promise.resolve(projectProgressionCanvasFailure(prepared, {
        code: "canvas-preview-precondition-missing", status: "failed", stage: "confirmation",
        message: "The preview did not include the original canonical graph. A safe reviewed write is unavailable."
      }));
    }
    this.#previews.delete(preview);
    return this.commit(intent, { expectedGraph });
  }
}
