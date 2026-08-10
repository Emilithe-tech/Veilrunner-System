function canObserve(actor, user = game.user) {
  return actor?.testUserPermission(user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER);
}

function sameActorFolder(a, b) {
  return Boolean(a?.folder?.id && b?.folder?.id && a.folder.id === b.folder.id);
}

function actorFolderId(actor) {
  return actor?.folder?.id ?? actor?.folder ?? "";
}

function folderId(folder) {
  return folder?.id ?? folder ?? "";
}

function findFolderById(id) {
  return game.folders?.get(id)
    ?? game.folders?.find(folder => folder.id === id)
    ?? null;
}

function sortedActors(actors) {
  return actors.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
}

function sortedItems(items) {
  return items.sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
}

/** Hidden party storage actor for an Actor directory folder. */
export function findPartyActorForFolder(folder, { user = game.user, requirePermission = true } = {}) {
  const id = folderId(folder);
  if (!id) return null;

  return game.actors.find(actor => actor.type === "party"
    && actorFolderId(actor) === id
    && (!requirePermission || canObserve(actor, user))) ?? null;
}

/** Heroes belonging to a party folder. */
export function getPartyFolderMembers(folder, { user = game.user } = {}) {
  const id = folderId(folder);
  if (!id) return [];

  return sortedActors(game.actors
    .filter(actor => actor.type === "hero" && actorFolderId(actor) === id && canObserve(actor, user)));
}

/** Heroes belonging to a party. Folder membership is the source of truth. */
export function getPartyMembers(party, { user = game.user } = {}) {
  if (!party) return [];
  if (party.type === "Actor") return getPartyFolderMembers(party, { user });
  if (party.type !== "party") return [];

  const folderMembers = getPartyFolderMembers(actorFolderId(party), { user });
  if (folderMembers.length || actorFolderId(party)) return folderMembers;

  const explicitIds = Array.isArray(party.system?.members) ? party.system.members.filter(Boolean) : [];
  const explicitMembers = explicitIds
    .map(id => game.actors.get(id))
    .filter(actor => actor?.type === "hero" && canObserve(actor, user));
  if (explicitMembers.length) return sortedActors(explicitMembers);

  return sortedActors(game.actors
    .filter(actor => actor.type === "hero" && sameActorFolder(actor, party) && canObserve(actor, user)));
}

/** Party storage actor for a hero's Actor folder. */
export function findPartyForHero(hero, { user = game.user } = {}) {
  if (!hero || hero.type !== "hero") return null;
  const folder = findFolderById(actorFolderId(hero));
  const folderParty = findPartyActorForFolder(folder, { user });
  if (folderParty) return folderParty;
  if (folder?.type === "Actor") return folder;

  const parties = game.actors
    .filter(actor => actor.type === "party" && canObserve(actor, user));
  return parties.find(party => Array.isArray(party.system?.members) && party.system.members.includes(hero.id)) ?? null;
}

/** Normalized currency rows for display and editing. */
export function partyCurrencies(party) {
  if (party?.type === "Actor") return [];
  const currencies = Array.isArray(party?.system?.currencies) ? party.system.currencies : [];
  return currencies.map((currency, index) => ({
    index,
    name: String(currency.name ?? ""),
    value: Number(currency.value ?? 0)
  }));
}

/** Treasure items stored on the party actor as the shared stash. */
export function partyInventory(party) {
  if (!party || party.type === "Actor") return [];

  return sortedItems([...party.items.contents]).map(item => {
    const quantity = Number(item.system?.quantity ?? 1);
    const price = Number(item.system?.price ?? 0);
    const category = item.type === "treasure" ? item.system?.category || "junk" : item.type;
    return {
      id: item.id,
      name: item.name,
      img: item.img,
      quantity,
      price,
      totalPrice: quantity * price,
      category,
      typeLabel: item.type === "treasure"
        ? game.i18n.localize(`VEILRUNNER.InventoryCategory.${category}`)
        : game.i18n.localize(`TYPES.Item.${item.type}`)
    };
  });
}

/** Shared party overview used by party sheets and hero drawers. */
export function buildPartyOverview(party, { currentHero = null, user = game.user } = {}) {
  const members = getPartyMembers(party, { user });
  const inventory = partyInventory(party);
  const currencies = partyCurrencies(party);
  const totalInventoryValue = inventory.reduce((total, item) => total + item.totalPrice, 0);
  const totalCurrencyValue = currencies.reduce((total, currency) => total + currency.value, 0);
  const folder = party?.type === "Actor" ? party : party?.folder;
  const backingActor = party?.type === "party" ? party : findPartyActorForFolder(folder, { user, requirePermission: false });

  return {
    party: backingActor ?? null,
    id: backingActor?.id ?? "",
    folderId: folder?.id ?? "",
    available: Boolean(party),
    name: backingActor?.name ?? folder?.name ?? game.i18n.localize("VEILRUNNER.NoPartyAssigned"),
    img: backingActor?.img ?? "icons/svg/group.svg",
    folderName: folder?.name ?? "",
    members: members.map(member => ({
      id: member.id,
      name: member.name,
      img: member.system?.appearanceImage || member.img,
      discipline: String(member.system?.discipline ?? ""),
      level: Number(member.system?.level ?? 0),
      current: member.id === currentHero?.id
    })),
    currencies,
    inventory,
    totalInventoryValue,
    totalCurrencyValue,
    totalWealth: totalCurrencyValue + totalInventoryValue,
    memberCount: members.length,
    itemCount: inventory.length
  };
}
