import { buildProgressionLayoutDraft, buildProgressionConnectionChangeDraft } from "./canvas-draft-builder.mjs";

const freeze = value => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

/** One pointer's transient draft, bound to the graph visible when the gesture began. */
export class ProgressionCanvasGesture {
  #state = null;

  get state() { return this.#state; }

  begin({ mode, page, graph, nodeId, pointerId, point, sourceAnchor = "auto" } = {}) {
    if (this.#state) return false;
    const node = graph?.nodes?.find(entry => entry.id === nodeId);
    if (!["move", "connect"].includes(mode) || !["magic", "skills"].includes(page)
      || !Array.isArray(graph?.edges) || !graph?.rootNodeId || !node || !finitePoint(node.position)
      || !Number.isInteger(pointerId) || !finitePoint(point)) {
      throw new Error("Select a node and refresh canonical graph evidence before dragging.");
    }
    this.#state = freeze(structuredClone({ mode, page, graph, nodeId, pointerId, point, start: point, origin: node.position, sourceAnchor, moved: false }));
    return true;
  }

  move({ pointerId, point } = {}) {
    const state = this.#state;
    if (!state || state.pointerId !== pointerId || !finitePoint(point)) return null;
    const dx = point.x - state.start.x;
    const dy = point.y - state.start.y;
    this.#state = freeze({ ...state, point: { ...point }, moved: state.moved || Math.hypot(dx, dy) > 3 });
    return freeze({ x: state.origin.x + dx, y: state.origin.y + dy });
  }

  finish({ pointerId, point, position, targetId = "", targetAnchor = "auto" } = {}) {
    if (!this.#state || this.#state.pointerId !== pointerId) return null;
    const sampledPosition = this.move({ pointerId, point });
    const state = this.#state;
    this.cancel();
    if (!sampledPosition || !state.moved) return null;
    if (state.mode === "connect") {
      if (!targetId) return null;
      return buildProgressionConnectionChangeDraft({ page: state.page, graph: state.graph,
        sourceId: state.nodeId, targetId, sourceAnchor: state.sourceAnchor, targetAnchor });
    }
    return freeze({ ...buildProgressionLayoutDraft({ page: state.page,
      positions: [{ nodeId: state.nodeId, position: position ?? sampledPosition }] }), sourceGraph: state.graph });
  }

  cancel() {
    const active = Boolean(this.#state);
    this.#state = null;
    return active;
  }
}
