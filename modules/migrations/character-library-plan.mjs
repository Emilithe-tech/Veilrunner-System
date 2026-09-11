export const CHARACTER_LIBRARY_PACK = Object.freeze({
  name: "character-library", label: "Character Library", system: "Veilrunner",
  path: "packs/character-library", type: "Item", private: false, flags: {}
});

export const CHARACTER_LIBRARY_FOLDERS = Object.freeze([
  ["archetypes", "Archetypes", "vrCharArchetypes"],
  ["species", "Species", "vrCharSpecies000"],
  ["origins", "Origins", "vrCharOrigins000"],
  ["disciplines", "Disciplines", "vrCharDiscipline"],
  ["qualities-perks", "Qualities", "vrCharQualities0"],
  ["languages", "Languages", "vrCharLanguages0"]
]);

/** Combine raw Foundry rows without changing Item or embedded-document identity. */
export function planCharacterLibrary(manifest, sources) {
  if (manifest.id !== "Veilrunner") throw new Error("Unexpected system identity");
  if (manifest.packs.some(p => p.name === CHARACTER_LIBRARY_PACK.name)) throw new Error("Target already registered");
  const rows = new Map();
  const counts = {};
  const add = (key, value) => {
    if (rows.has(key)) throw new Error(`Duplicate database key: ${key}`);
    rows.set(key, value);
  };
  for (const [index, [name, label, folderId]] of CHARACTER_LIBRARY_FOLDERS.entries()) {
    if (!/^[a-zA-Z0-9]{16}$/.test(folderId)) throw new Error(`Invalid generated folder ID: ${folderId}`);
    const pack = manifest.packs.find(p => p.name === name);
    if (pack?.path !== `packs/${name}` || pack.type !== "Item" || !Array.isArray(sources[name])) throw new Error(`Missing or unexpected source: ${name}`);
    add(`!folders!${folderId}`, {_id:folderId, name:label, type:"Item", folder:null, sorting:"a", sort:(index + 1) * 100000, color:null, flags:{}});
    counts[label] = 0;
    const folderIds = new Set(sources[name].filter(([key])=>key.startsWith("!folders!")).map(([,value])=>value._id));
    for (const [key, source] of sources[name]) {
      const value = structuredClone(source);
      if (key.startsWith("!items!") || key.startsWith("!folders!")) {
        if (value.folder && !folderIds.has(value.folder)) throw new Error(`Missing parent folder: ${key}`);
        value.folder ||= folderId;
      }
      if (key.startsWith("!items!")) counts[label]++;
      add(key, value);
    }
  }
  const names = new Set(CHARACTER_LIBRARY_FOLDERS.map(([name])=>name));
  const next = structuredClone(manifest);
  const first = next.packs.findIndex(p => names.has(p.name));
  next.packs = next.packs.filter(p => !names.has(p.name));
  next.packs.splice(first, 0, structuredClone(CHARACTER_LIBRARY_PACK));
  return {manifest:next, rows:[...rows].sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0), counts};
}
