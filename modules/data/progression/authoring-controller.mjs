export const PROGRESSION_AUTHORING_CONTROLLER_VERSION = 3;

const text = value => String(value ?? "").trim();

function requiredMethod(owner, method, label) {
  if (typeof owner?.[method] !== "function") throw new TypeError(`${label} must implement ${method}().`);
}

function routeCollection(router, type) {
  const route = router.route(type, { strict: true });
  const collection = text(route?.collection);
  if (route?.registered !== true || !collection) throw new Error(`Canonical route for '${type}' is not registered.`);
  return collection;
}

function withSessionResult(result, session) {
  if (result && typeof result === "object" && !Array.isArray(result)) return Object.freeze({ ...result, lockSession: session });
  return Object.freeze({ value: result, lockSession: session });
}

/**
 * Minimal runtime boundary for Phase 4 authoring. Read operations remain
 * lock-free; mutations execute inside one exact pack-lock session.
 */
export class ProgressionAuthoringController {
  constructor({ router, lockCoordinator, contentCreation, definitionPicker, graphEditing, inspection } = {}) {
    requiredMethod(router, "route", "router");
    requiredMethod(lockCoordinator, "run", "lockCoordinator");
    requiredMethod(contentCreation, "createContent", "contentCreation");
    requiredMethod(contentCreation, "placeExisting", "contentCreation");
    requiredMethod(contentCreation, "previewCreateContent", "contentCreation");
    requiredMethod(contentCreation, "previewPlaceExisting", "contentCreation");
    requiredMethod(definitionPicker, "list", "definitionPicker");
    requiredMethod(graphEditing, "previewLayout", "graphEditing");
    requiredMethod(graphEditing, "previewConnections", "graphEditing");
    requiredMethod(graphEditing, "updateLayout", "graphEditing");
    requiredMethod(graphEditing, "replaceConnections", "graphEditing");
    requiredMethod(inspection, "inspectNode", "inspection");
    requiredMethod(inspection, "previewRemoveNode", "inspection");
    requiredMethod(inspection, "removeNode", "inspection");
    requiredMethod(inspection, "assessDefinitionDeletion", "inspection");
    requiredMethod(inspection, "capabilities", "inspection");
    this.router = router;
    this.lockCoordinator = lockCoordinator;
    this.contentCreation = contentCreation;
    this.definitionPicker = definitionPicker;
    this.graphEditing = graphEditing;
    this.inspection = inspection;
  }

  async #mutate({ label, collections, execute }) {
    const session = await this.lockCoordinator.run({ collections: [...new Set(collections)], label, execute });
    return withSessionResult(session.value, session.receipt);
  }

  createContent(request = {}) {
    const type = text(request?.definitionSource?.type).toLowerCase();
    const progressionCollection = routeCollection(this.router, "progression");
    const definitionCollection = routeCollection(this.router, type);
    return this.#mutate({
      label: `create-${type || "content"}`,
      collections: [progressionCollection, definitionCollection],
      execute: () => this.contentCreation.createContent(request)
    });
  }

  placeExisting(request = {}) {
    return this.#mutate({
      label: "place-existing-content",
      collections: [routeCollection(this.router, "progression")],
      execute: () => this.contentCreation.placeExisting(request)
    });
  }

  removeNode(request = {}) {
    return this.#mutate({
      label: "remove-progression-node",
      collections: [routeCollection(this.router, "progression")],
      execute: () => this.inspection.removeNode(request)
    });
  }

  updateLayout(request = {}) {
    return this.#mutate({
      label: "update-progression-layout",
      collections: [routeCollection(this.router, "progression")],
      execute: () => this.graphEditing.updateLayout(request)
    });
  }

  replaceConnections(request = {}) {
    return this.#mutate({
      label: "replace-progression-connections",
      collections: [routeCollection(this.router, "progression")],
      execute: () => this.graphEditing.replaceConnections(request)
    });
  }

  listDefinitions(request = {}) {
    return this.definitionPicker.list(request);
  }

  previewCreateContent(request = {}) {
    return this.contentCreation.previewCreateContent(request);
  }

  previewPlaceExisting(request = {}) {
    return this.contentCreation.previewPlaceExisting(request);
  }

  inspectNode(request = {}) {
    return this.inspection.inspectNode(request);
  }

  previewRemoveNode(request = {}) {
    return this.inspection.previewRemoveNode(request);
  }

  previewLayout(request = {}) {
    return this.graphEditing.previewLayout(request);
  }

  previewConnections(request = {}) {
    return this.graphEditing.previewConnections(request);
  }

  assessDefinitionDeletion(request = {}) {
    return this.inspection.assessDefinitionDeletion(request);
  }

  capabilities() {
    return Object.freeze({
      version: PROGRESSION_AUTHORING_CONTROLLER_VERSION,
      ...this.inspection.capabilities(),
      create: true,
      place: true,
      pick: true,
      previewCreate: true,
      previewPlace: true,
      previewRemove: true,
      previewLayout: true,
      previewConnections: true,
      updateLayout: true,
      replaceConnections: true
    });
  }
}
