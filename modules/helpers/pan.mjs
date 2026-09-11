export const PAN_MODES = Object.freeze(["off", "silent", "on"]);

export function panModeFor(system) {
  return !system?.networkLinked ? "off" : system.panSilent ? "silent" : "on";
}

export function sharesPanInformation(system) {
  return panModeFor(system) === "on";
}

export function panModeUpdate(mode) {
  if (!PAN_MODES.includes(mode)) return null;
  return { "system.networkLinked": mode !== "off", "system.panSilent": mode === "silent" };
}
