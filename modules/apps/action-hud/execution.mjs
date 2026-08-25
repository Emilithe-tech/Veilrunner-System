import { discoverHudActions } from "./discovery.mjs";
import { evaluateActionAvailability } from "./availability.mjs";
import { currentMapPenalty, recordSuccessfulAttack, spendActionEconomy } from "./economy.mjs";
import { getTargetIntelPresentation } from "./target-intel.mjs";
import { effectMatches } from "./visibility.mjs";
import { recordRecentAction } from "./preferences.mjs";
import { executeFirearmAction } from "../../items/firearms.mjs";
import { systemId } from "./constants.mjs";
import { resolveHudActionConfiguration } from "./resolver.mjs";
import { captureHudUndoState, storeHudUndoState } from "./undo.mjs";

function findAction(actor, actionOrId) {
  if (actionOrId && typeof actionOrId === "object") return actionOrId;
  return discoverHudActions(actor, { user: globalThis.game?.user }).find(action => action.id === actionOrId) ?? null;
}

async function consumeEffects(actor, target, consumes = []) {
  for (const consumption of consumes ?? []) {
    const subject = consumption.scope === "target" ? target : actor;
    const effect = effectMatches(subject, consumption.effect);
    if (!effect) continue;
    const stacks = Math.max(1, Number(effect.flags?.[systemId()]?.stacks ?? 1) || 1);
    const spend = Math.max(1, Number(consumption.stacks) || 1);
    if (stacks > spend) await effect.update({ [`flags.${systemId()}.stacks`]: stacks - spend });
    else await effect.delete();
  }
}

async function executeSource(actor, action, { selections, mapPenalty }) {
  if (action.generated && action.weaponId) return executeFirearmAction(actor, action.weaponId, action.operation, { mapPenalty, selections, resolvedAction: action, sharedExecution: true });
  if (action.sourceType === "macro" || action.id.startsWith("macro:")) {
    const macro = globalThis.game?.macros?.get?.(action.source?.macroId ?? action.id.slice(6));
    if (!macro) return false;
    return { macroResult: await macro.execute({ actor, token: actor.getActiveTokens?.()[0] ?? null }) };
  }
  const item = action.source?.documentName === "Item" ? action.source : actor.items?.get?.(action.id);
  if (item?.system?.roll) return item.system.roll(actor, { composer: selections, resolvedAction: action, mapPenalty, skipHudExecution: true, skipResourceCommit: true, skipAvailability: true });
  if (typeof action.source?.execute === "function") return action.source.execute({ actor, selections, mapPenalty });
  globalThis.ui?.notifications?.warn?.(`${action.name} has no executable rule definition.`);
  return false;
}

/** The authoritative entry point for every Veilrunner system action. */
export async function executeHudAction(actor, actionOrId, { selections = null, targetToken = [...(globalThis.game?.user?.targets ?? [])][0] ?? null } = {}) {
  const discovered = findAction(actor, actionOrId);
  if (!actor || !discovered) return { success: false, reason: "Action is no longer available." };
  const action = resolveHudActionConfiguration(actor, discovered, selections ?? discovered.composerSelections ?? {});
  if (!action.valid) {
    const reason = action.errors[0] ?? "Action configuration is invalid.";
    globalThis.ui?.notifications?.warn?.(reason);
    return { success: false, reason, action };
  }
  const target = targetToken?.actor ?? null;
  const targetPresentation = getTargetIntelPresentation(targetToken, { viewerActor: actor });
  const resolvedSelections = action.resolvedSelections ?? selections ?? {};
  const availability = evaluateActionAvailability({ actor, action: { ...action, composerSelections: resolvedSelections }, target, targetPresentation, selections: resolvedSelections });
  if (!availability.available) {
    globalThis.ui?.notifications?.warn?.(availability.reason);
    return { success: false, reason: availability.reason, availability };
  }
  const mapPenalty = action.attack ? currentMapPenalty(actor, action.traits) : 0;
  const undoSnapshot = captureHudUndoState(actor, action);
  let output;
  try {
    output = await executeSource(actor, action, { selections: resolvedSelections, mapPenalty });
  } catch (error) {
    console.error(`Veilrunner | ${action.name} execution failed`, error);
    globalThis.ui?.notifications?.error?.(`${action.name} could not be completed.`);
    return { success: false, reason: error.message, error };
  }
  if (output === false || output == null) return { success: false, reason: "Action was cancelled or did not complete." };
  const resourceUpdate = {};
  for (const [key, cost] of Object.entries(action.costs ?? {})) if (Number(cost) > 0) resourceUpdate[`system.resources.${key}.value`] = Math.max(0, Number(actor.system?.resources?.[key]?.value ?? 0) - Number(cost));
  if (Object.keys(resourceUpdate).length) await actor.update(resourceUpdate);
  await consumeEffects(actor, target, action.source?.system?.consumes ?? action.consumes ?? []);
  if (!await spendActionEconomy(actor, action)) {
    globalThis.ui?.notifications?.error?.("The action completed, but its combat economy state could not be updated.");
    return { success: false, reason: "Combat economy update failed after action execution.", output };
  }
  if (action.attack) await recordSuccessfulAttack(actor);
  await recordRecentAction(actor, action.id, action.resolvedSelections);
  try {
    await storeHudUndoState(actor, undoSnapshot);
  } catch (error) {
    console.warn("Veilrunner | The action completed, but its undo state could not be recorded", error);
  }
  globalThis.game?.veilrunner?.refreshActionHud?.(["self", "workspace", "economy", "target"]);
  return { success: true, output, mapPenalty, action };
}
