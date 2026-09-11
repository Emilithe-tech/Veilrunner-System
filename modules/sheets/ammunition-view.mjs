import { contractField, projectContractField } from "./contract-editor.mjs";
import { isAmmoCompatible, isMagazineCompatible, firearmLoadingInCombat } from "../items/firearms.mjs";

export function projectItemLoading(item) {
  const firearm = item.type === "weapon" && item.system?.weaponKind === "firearm" && item.system?.firearm?.magazineMode === "detachable";
  if (!firearm && !["ammunition", "magazine"].includes(item.type)) return null;
  const actor = item.actor;
  if (!actor) return { unowned: true };
  const items = Array.from(actor.items?.contents ?? actor.items ?? []);
  const firearms = items.filter(entry => entry.type === "weapon" && entry.system?.weaponKind === "firearm" && entry.system?.firearm?.magazineMode === "detachable");
  const installedIn = magazine => firearms.find(entry => entry.system.firearm.loadedMagazineId === magazine.id);
  const rows = [];
  const ammoRow = (ammo, magazine, name) => {
    const installed = installedIn(magazine);
    const reason = installed ? `Remove from ${installed.name} first` : !isAmmoCompatible(magazine, ammo) ? "Incompatible ammo"
      : Number(magazine.system.rounds) >= Number(magazine.system.capacity) ? "Magazine is full"
        : Number(ammo.system.quantity) <= 0 ? "No rounds available"
          : magazine.system.rounds > 0 && magazine.system.ammoId !== ammo.id ? "Unload the current ammo first" : "";
    rows.push({ name, status: `${ammo.system.quantity ?? 0} rounds available · ${magazine.system.rounds ?? 0}/${magazine.system.capacity ?? 0} loaded`,
      operation: "rounds", ammoId: ammo.id, magazineId: magazine.id, label: "Load rounds", reason });
  };
  const magazineRow = (magazine, weapon, name) => {
    const installed = installedIn(magazine);
    const current = weapon.system.firearm.loadedMagazineId;
    const removing = current === magazine.id;
    const reason = firearmLoadingInCombat(actor) ? "Use firearm Loadout / Action HUD during combat"
      : removing ? "" : installed ? `Already in ${installed.name}` : current ? "Remove the current magazine first"
        : !isMagazineCompatible(weapon, magazine) ? "Incompatible magazine or ammo" : "";
    rows.push({ name, status: `${magazine.system.rounds ?? 0}/${magazine.system.capacity ?? 0} rounds${removing ? " · Inserted" : ""}`,
      operation: removing ? "remove" : "insert", magazineId: magazine.id, weaponId: weapon.id, label: removing ? "Remove magazine" : "Insert magazine", reason });
  };
  if (item.type === "ammunition") for (const magazine of items.filter(entry => entry.type === "magazine")) ammoRow(item, magazine, magazine.name);
  if (item.type === "magazine") {
    for (const ammo of items.filter(entry => entry.type === "ammunition")) ammoRow(ammo, item, ammo.name);
    if (item.system.rounds > 0) rows.push({ name: "Return loaded rounds to inventory", status: item.system.ammoName || "Loaded ammunition", operation: "unload", magazineId: item.id, label: "Unload rounds", reason: installedIn(item) ? "Remove the magazine from its firearm first" : "" });
    for (const weapon of firearms) magazineRow(item, weapon, weapon.name);
  }
  if (firearm) for (const magazine of items.filter(entry => entry.type === "magazine")) magazineRow(magazine, item, magazine.name);
  return { title: item.type === "ammunition" ? "Load this ammo into a magazine" : firearm ? "Insert a magazine" : "Load rounds, then insert magazine", rows,
    stackedMagazine: item.type === "magazine" && Number(item.system.quantity) > 1, magazineId: item.id, quantity: item.system.quantity };
}

export function projectAmmunitionRelations(item, catalogs = {}) {
  const firearm = item.type === "weapon" && item.system?.weaponKind === "firearm";
  if (!firearm && !["ammunition", "magazine"].includes(item.type)) return null;
  const system = item.system?.toObject?.() ?? item.system;
  const schema = item.system.schema ?? item.system.constructor.schema;
  const ammunition = item.type === "ammunition";
  const magazine = item.type === "magazine";
  const prefix = firearm ? "firearm.compatibility" : "compatibility";
  const specifications = ammunition ? [["ammoType", "Ammo family (ballistic, thermal, laser, etc.)"], ["caliber", "Caliber / round format"], ["roundsPerPack", "Rounds per purchased pack"], ["damage.base", "Base damage per round"], ["damage.type", "Damage type"]]
    : magazine ? [["magazineType", "Magazine type / fit"], ["capacity", "Round capacity"]]
      : [["firearm.magazineMode", "Magazine system"], ["damage.max", "Maximum damage before stats"], ...(system.firearm?.magazineMode === "internal" ? [["firearm.capacity", "Internal round capacity"]] : [])];
  if (!ammunition) specifications.push([`${prefix}.ammoTypes`, "Accepted ammo families"], [`${prefix}.caliber`, "Required caliber / round format"],
    ...(firearm ? [[`${prefix}.magazineTypes`, "Accepted magazine types"]] : []),
    [`${prefix}.flexible`, "Allow any family, caliber and magazine fit"],
    [`${prefix}.allowDefinitionIds`, "Explicitly allowed definitions"], [`${prefix}.blockDefinitionIds`, "Blocked definitions (always rejected)"]);
  const fields = specifications.flatMap(([path, label]) => {
    const field = contractField(schema, path);
    const value = path.split(".").reduce((current, key) => current?.[key], system);
    return field ? [projectContractField(field, value, { path, label, catalogs })] : [];
  });
  const owned = Array.from(item.actor?.items?.contents ?? item.actor?.items ?? []);
  const inserted = magazine && owned.some(entry => entry.type === "weapon" && entry.system?.firearm?.loadedMagazineId === item.id);
  const candidates = owned.filter(entry => ammunition ? entry.type === "magazine" : magazine ? entry.type === "ammunition" : entry.type === "magazine");
  const matches = candidates.map(entry => ({ name: entry.name,
    compatible: ammunition ? isAmmoCompatible(entry, item) : magazine ? isAmmoCompatible(item, entry) : isMagazineCompatible(item, entry) }));
  return { ammunition, magazine, firearm, fields, matches, owned: Boolean(item.actor), inserted,
    title: ammunition ? "Round & pack definition" : magazine ? "Magazine & ammunition" : "Firearm compatibility",
    hint: ammunition ? "Quantity is loose rounds, not packs. Price is per pack; weight is per round. Pack size defines the rounds provided by one purchase. Damage accepts a number or additive dice formula (for example 6 or 1d6 + 2); the firearm caps it before stat bonuses."
      : "Family and fit names must match exactly. Empty accepted lists reject loading unless an explicit exception is configured. An allowed magazine never bypasses the firearm's ammunition checks.",
    rounds: magazine ? system.rounds : system.quantity, capacity: system.capacity,
    ammoName: system.rounds > 0 ? system.ammoName : "Empty",
    canLoad: magazine && !inserted && system.rounds < system.capacity && owned.some(entry => entry.type === "ammunition" && entry.system?.quantity > 0 && isAmmoCompatible(item, entry) && (!system.rounds || entry.id === system.ammoId)),
    canUnload: magazine && !inserted && system.rounds > 0 };
}
