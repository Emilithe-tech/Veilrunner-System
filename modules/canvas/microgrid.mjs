export const MICROGRID_DISTANCE = 0.25;
export const MICROGRID_VERSION = 1;

/** Keep the authored map calibration; only subdivide square grids measured in metres. */
export function microgridScale(grid) {
  if (grid?.type !== 1 || !["m", "meter", "meters", "metre", "metres"].includes(grid.units?.trim().toLowerCase())) return null;
  const factor = grid.distance / MICROGRID_DISTANCE;
  if (!Number.isFinite(factor) || factor < 1 || !Number.isFinite(grid.size) || grid.size <= 0) return null;
  return { factor, size: grid.size / factor, distance: MICROGRID_DISTANCE };
}

/** Source dimensions must agree with V14 movement geometry, not just rendered artwork. */
export function microgridTokenUpdate(token, actorType, grid, { fromPrototype = false } = {}) {
  const scale = microgridScale(grid);
  if (!scale || token.flags?.Veilrunner?.microgrid === MICROGRID_VERSION) return null;
  const standardHumanoid = ["hero", "npc"].includes(actorType) && token.width === 1 && token.height === 1;
  // Prototype dimensions use the system's 1 m base cell. Existing placed
  // tokens use their scene's authored cell size, which may be 2 m, 5 m, etc.
  const factor = fromPrototype || standardHumanoid ? 1 / MICROGRID_DISTANCE : scale.factor;
  const update = {
    width: token.width * factor,
    height: token.height * factor,
    "flags.Veilrunner.microgrid": MICROGRID_VERSION
  };
  if (Number.isFinite(token.depth)) update.depth = token.depth * factor;
  if (!fromPrototype) {
    update["flags.Veilrunner.microgridOriginal"] = {
      width: token.width, height: token.height, depth: token.depth, x: token.x, y: token.y
    };
    // Pixel positions are integer fields in V14. Preserve centres to the nearest
    // pixel when the standard humanoid footprint becomes smaller or larger.
    if (factor !== scale.factor) {
      if (Number.isFinite(token.x)) update.x = Math.round(token.x + (token.width * grid.size - update.width * scale.size) / 2);
      if (Number.isFinite(token.y)) update.y = Math.round(token.y + (token.height * grid.size - update.height * scale.size) / 2);
    }
  }
  return update;
}

/** Convert a scene atomically, then finish V14 movement/region bookkeeping. */
export async function migrateSceneMicrogrid(scene) {
  if (!microgridScale(scene._source.grid) || scene.flags.Veilrunner?.microgridMigration === MICROGRID_VERSION) return;
  try {
    // Old movement waypoints carry the old grid dimensions. Clear them via
    // the public V14 API before activating the new coordinate units.
    await scene.clearMovementHistories();
    if (scene.flags.Veilrunner?.microgrid !== MICROGRID_VERSION) {
      const tokens = scene.tokens.map(token => {
        const update = microgridTokenUpdate(token._source, token.actor?.type, scene._source.grid);
        return update ? { _id: token.id, ...update } : { _id: token.id };
      });
      // Activate the grid and convert footprints in the same scene update.
      await scene.update({
        "flags.Veilrunner.microgrid": MICROGRID_VERSION,
        "flags.Veilrunner.microgridOriginalGrid": { ...scene._source.grid },
        "grid.style": "diamondPoints",
        ...(tokens.length ? { tokens } : {})
      });
    }
    scene.updateRegionShapeConstraints();
    await scene.updateTokenRegions();
    // A failed finalization remains retryable without resizing tokens again.
    await scene.setFlag("Veilrunner", "microgridMigration", MICROGRID_VERSION);
  } catch (error) {
    console.error(`Veilrunner | Grid conversion failed for ${scene.name}`, error);
    ui.notifications.error(`Could not adjust the grid for ${scene.name}. See the console for details.`);
  }
}

/** One elected GM upgrades existing scenes through the normal document API. */
export function registerMicrogridMigration() {
  Hooks.once("ready", async () => {
    if (game.users.activeGM?.id !== game.user.id) return;
    for (const scene of game.scenes) await migrateSceneMicrogrid(scene);
  });
  Hooks.on("createScene", async (scene, options, userId) => {
    if (userId === game.user.id && game.user.isGM) await migrateSceneMicrogrid(scene);
  });
}
