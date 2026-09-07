import { resolveActionConfiguration } from "../../actions/action-configuration.mjs";
import { resolveHudActionContract } from "./action-contract.mjs";

export { projectedResourceCosts } from "../../actions/action-configuration.mjs";

/** HUD supplies its player-knowledge adapter to the shared mechanics service. */
export function resolveHudActionConfiguration(actor, action, selections = {}, context = {}) {
  return resolveActionConfiguration(actor, action, selections, { ...context, resolveContract: resolveHudActionContract });
}
