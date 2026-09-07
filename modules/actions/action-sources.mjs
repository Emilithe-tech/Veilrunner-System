import { itemHasCapability } from "../data/definitions/item-capabilities.mjs";

const providers = new Map();

/** Owned executable snapshots; physical Items contribute actions through providers. */
export function isOwnedActionItem(item) {
  return itemHasCapability(item, "actorOwned") && itemHasCapability(item, "actionProvider")
    && !itemHasCapability(item, "inventory");
}

export function selectOwnedActionItems(actor) {
  return Array.from(actor?.items?.contents ?? actor?.items ?? []).filter(isOwnedActionItem);
}

/** Synthetic action discovery belongs to the action layer, independently of UI. */
export function registerActorActionProvider(key, provider) {
  if (typeof provider !== "function") throw new TypeError("Actor action provider must be a function.");
  providers.set(String(key), provider);
  return () => {
    if (providers.get(String(key)) === provider) providers.delete(String(key));
  };
}

export function discoverActorProvidedActions(actor) {
  return [...providers.values()].flatMap(provider => provider(actor) ?? []);
}
