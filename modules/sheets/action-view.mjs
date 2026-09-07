import { isOwnedActionItem, selectOwnedActionItems } from "../actions/action-sources.mjs";
import { normalizeActionTiming } from "../actions/resolved-action.mjs";
import { normalizeHudAction } from "../apps/action-hud/discovery.mjs";
import { resolveHudActionConfiguration } from "../apps/action-hud/resolver.mjs";

const isAbility = item => item.type === "ability" || item.system?.activationKind === "ability";

/** Keep owned snapshots intact while selecting the existing sheet categories. */
export function ownedActionGroups(actor) {
  const owned = selectOwnedActionItems(actor).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const actions = owned.filter(item => !isAbility(item));
  const abilities = owned.filter(isAbility);
  const isReaction = item => normalizeActionTiming(item).type === "reaction"
    || (!item.system?.timing?.type && item.system?.category === "reactions");
  const favoriteActions = actions.filter(item => item.system?.favorite);
  const featuredAbilities = abilities.filter(item => item.system?.favorite || item.system?.featured);
  return {
    actions, abilities, favoriteActions, featuredAbilities,
    favoriteItems: owned.filter(item => item.system?.favorite || (isAbility(item) && item.system?.featured)),
    standardActions: actions.filter(item => (item.system?.category || "actions") === "actions" && !isReaction(item)),
    reactionActions: actions.filter(isReaction),
    magicActions: actions.filter(item => item.system?.category === "magic"),
    techActions: actions.filter(item => ["tech", "digital"].includes(item.system?.category))
  };
}

/** Resolve exclusively from this Actor's owned Item, never from a definition library. */
export function resolveOwnedSheetAction(actor, item, context = {}) {
  if (!isOwnedActionItem(item) || !Array.from(actor?.items?.contents ?? actor?.items ?? []).includes(item)) return null;
  return resolveHudActionConfiguration(actor, normalizeHudAction(item, { actor }), {}, context);
}
