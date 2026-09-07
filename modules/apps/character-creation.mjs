/**
 * Lightweight character-creation entrypoint.
 *
 * The full overlay (including its talent-tree editor) is deliberately loaded
 * only when a player or GM opens it. Keep startup hooks in this module so the
 * rest of the system never needs to import the large UI implementation.
 */
import { ensureProgressionCatalogReady } from "../data/progression/catalog-provider.mjs";

let overlayModule;
let characterCreationStyles;

function loadOverlay() {
  overlayModule ??= import("./chargen/character-creation-overlay.mjs");
  return overlayModule;
}

function loadCharacterCreationStyles() {
  if (characterCreationStyles) return characterCreationStyles;
  const href = new URL("../../css/chargen/character-creation.css", import.meta.url).href;
  const existing = document.querySelector(`link[data-veilrunner-chargen-styles="${href}"]`);
  if (existing) return characterCreationStyles = Promise.resolve();
  characterCreationStyles = new Promise((resolve, reject) => {
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    stylesheet.dataset.veilrunnerChargenStyles = href;
    stylesheet.addEventListener("load", () => resolve(), { once: true });
    stylesheet.addEventListener("error", () => reject(new Error("Unable to load Character Creation styles.")), { once: true });
    document.head.append(stylesheet);
  });
  return characterCreationStyles;
}

export function registerCharacterCreation() {
  Hooks.on("createActor", (actor, options, userId) => {
    if (actor.type !== "hero" || userId !== game.user?.id) return;
    window.setTimeout(() => {
      void openCharacterCreation(actor).catch(error => console.error("Veilrunner | Character Generation could not open", error));
    }, 100);
  });
}

export async function openCharacterCreation(actor, options = {}) {
  try {
    await ensureProgressionCatalogReady();
  } catch (error) {
    console.error("Veilrunner | Canonical progression is unavailable", error);
    globalThis.ui?.notifications?.error?.("Character Generation cannot open because canonical Progression data is unavailable.");
    throw error;
  }
  const [{ openCharacterCreation: open }] = await Promise.all([loadOverlay(), loadCharacterCreationStyles()]);
  return open(actor, options);
}

export async function openTalentTreeEditor(options = {}) {
  if (globalThis.game?.user?.isGM !== true) {
    globalThis.ui?.notifications?.warn?.("Only a GM can open Progression authoring.");
    return null;
  }
  try {
    await ensureProgressionCatalogReady();
    const { progressionAuthoringRuntime } = await import("../data/progression/runtime-authoring.mjs");
    const runtime = progressionAuthoringRuntime();
    const readiness = runtime.readiness();
    if (!readiness.sessionReady) {
      globalThis.ui?.notifications?.error?.("Canonical Progression authoring preflight failed. See the console for details.");
      console.error("Veilrunner | Canonical progression authoring preflight failed", readiness);
      return null;
    }
    const [{ openTalentTreeEditor: open }] = await Promise.all([loadOverlay(), loadCharacterCreationStyles()]);
    return open({ ...options, authoringRuntime: runtime });
  } catch (error) {
    console.error("Veilrunner | Canonical progression authoring entry is unavailable", error);
    globalThis.ui?.notifications?.error?.("Canonical Progression authoring is unavailable. See the console for details.");
    return null;
  }
}

export class TalentTreeEditorMenu extends foundry.applications.api.ApplicationV2 {
  render() {
    void openTalentTreeEditor();
    return this;
  }
}
