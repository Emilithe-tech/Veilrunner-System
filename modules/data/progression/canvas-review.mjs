import { progressionCanvasConfirmationView } from "./canvas-presentation.mjs";
import { assertReviewedProgressionGraph } from "./reviewed-graph.mjs";

const empty = () => ({ built: null, preview: null, outcome: null, confirmationOpen: false, acknowledged: false, busy: false });

/** Transient review state. Never authorizes writes or changes the canonical catalog. */
export class ProgressionCanvasReview {
  #revision = 0;
  #state = Object.freeze(empty());

  constructor({ session } = {}) {
    this.session = session;
  }

  get state() { return this.#state; }

  #set(patch) { this.#state = Object.freeze({ ...this.#state, ...patch }); }

  invalidate() {
    if (this.#state.busy) return false;
    this.#revision += 1;
    this.#state = Object.freeze(empty());
    return true;
  }

  async preview(built) {
    if (!this.invalidate()) return false;
    const revision = this.#revision;
    // Builders own immutable snapshots; the session independently normalizes them.
    this.#set({ built });
    const preview = await this.session.preview(built.intent);
    if (revision !== this.#revision) return false;
    if (preview.state === "previewed" && built.sourceGraph) {
      try {
        assertReviewedProgressionGraph(built.sourceGraph, preview.preview?.beforeGraph);
      } catch (error) {
        this.refuse(error);
        return true;
      }
    }
    this.#set({ preview });
    return true;
  }

  refuse(error) {
    if (!this.invalidate()) return;
    this.#set({ preview: Object.freeze({
      state: "refused", status: String(error?.status ?? "failed"),
      code: String(error?.code ?? "canonical-draft-invalid"),
      message: String(error?.message ?? error),
      issues: Array.isArray(error?.issues) ? error.issues : []
    }) });
  }

  confirmation() {
    const view = progressionCanvasConfirmationView({
      draft: this.#state.built, preview: this.#state.preview,
      capabilities: this.session?.capabilities?.(),
      reviewing: this.#state.confirmationOpen, acknowledged: this.#state.acknowledged
    });
    return Object.freeze({ ...view, commitEnabled: view.commitEnabled && !this.#state.busy && !this.#state.outcome });
  }

  review() {
    if (!this.#state.busy && !this.#state.outcome && this.confirmation().valid) this.#set({ confirmationOpen: true, acknowledged: false });
  }

  acknowledge(value) {
    if (!this.#state.busy && this.#state.confirmationOpen) this.#set({ acknowledged: value === true });
  }

  back() {
    if (!this.#state.busy) this.#set({ confirmationOpen: false, acknowledged: false });
  }

  async commit() {
    if (this.#state.busy || this.#state.outcome) return false;
    const confirmation = this.confirmation();
    if (!confirmation.commitEnabled) {
      this.#set({ outcome: Object.freeze({ state: "blocked", status: "blocked", code: "canonical-confirmation-incomplete", message: confirmation.blockingReason }) });
      return false;
    }
    const { built, preview } = this.#state;
    this.#set({ busy: true });
    try {
      this.#set({ outcome: await this.session.commitReviewed(built.intent, preview) });
    } catch (error) {
      // An unexpected transport error is not evidence that the write was rolled back.
      this.#set({ outcome: Object.freeze({ state: "unknown", code: "canvas-dispatch-unknown", message: String(error?.message ?? error) }) });
    } finally {
      this.#set({ busy: false, acknowledged: false });
    }
    return true;
  }
}
