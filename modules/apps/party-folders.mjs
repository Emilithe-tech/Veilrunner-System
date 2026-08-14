import { findPartyActorForFolder } from "../helpers/party.mjs";

const SYSTEM_FLAG_SCOPE = "veilrunner";
const PARTY_FOLDER_FLAG = "partyFolder";

function asElement(html) {
  if (html instanceof HTMLElement) return html;
  if (html?.[0] instanceof HTMLElement) return html[0];
  return null;
}

function actorFolderId(actor) {
  return actor?.folder?.id ?? actor?.folder ?? "";
}

function findFolderById(folderId) {
  return game.folders?.get(folderId)
    ?? game.folders?.find(folder => folder.id === folderId)
    ?? null;
}

function findFolderElement(root, folderId) {
  return root.querySelector(`[data-folder-id="${folderId}"]`)
    ?? root.querySelector(`[data-folder-id='${folderId}']`);
}

function folderHeaderElement(folderElement) {
  return folderElement?.querySelector(".folder-header")
    ?? folderElement?.querySelector("header")
    ?? folderElement?.firstElementChild
    ?? null;
}

function folderNameElement(header) {
  return header?.querySelector(".folder-name")
    ?? header?.querySelector("h3")
    ?? header?.querySelector("h4")
    ?? header;
}

function hidePartyActors(root) {
  for (const actor of game.actors.filter(actor => actor.type === "party")) {
    const selector = `[data-document-id="${actor.id}"], [data-entry-id="${actor.id}"], [data-actor-id="${actor.id}"]`;
    for (const element of root.querySelectorAll(selector)) element.classList.add("vr-hidden-party-actor");
  }
}

function partyFolders() {
  const actorFolders = game.folders?.filter(folder => folder.type === "Actor") ?? [];
  return actorFolders.filter(folder => {
    if (findPartyActorForFolder(folder, { requirePermission: false })) return true;
    return game.user.isGM && game.actors.some(actor => actor.type === "hero" && actorFolderId(actor) === folder.id);
  });
}

async function ensurePartyActor(folder) {
  let party = findPartyActorForFolder(folder, { requirePermission: false });
  if (party) return party;

  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("VEILRUNNER.PartyFolderGMOnly"));
    return null;
  }

  party = await Actor.create({
    name: folder.name,
    type: "party",
    img: "icons/svg/mystery-man.svg",
    folder: folder.id,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
    flags: {
      [SYSTEM_FLAG_SCOPE]: {
        [PARTY_FOLDER_FLAG]: folder.id
      }
    }
  });
  return party;
}

async function openPartyForFolder(folderId) {
  const folder = findFolderById(folderId);
  if (!folder || folder.type !== "Actor") return;

  const party = await ensurePartyActor(folder);
  party?.sheet?.render(true);
}

function injectPartyFolderButtons(root) {
  for (const folder of partyFolders()) {
    const folderElement = findFolderElement(root, folder.id);
    const header = folderHeaderElement(folderElement);
    if (!header || header.querySelector(".vr-party-folder-btn")) continue;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "vr-party-folder-btn";
    button.dataset.folderId = folder.id;
    button.title = game.i18n.localize("VEILRUNNER.OpenPartyFolder");
    button.setAttribute("aria-label", game.i18n.localize("VEILRUNNER.OpenPartyFolder"));
    button.innerHTML = '<i class="fa-solid fa-users"></i>';
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      openPartyForFolder(folder.id);
    });

    const name = folderNameElement(header);
    name?.insertAdjacentElement("afterend", button);
  }
}

function refreshPartyFolderButtons(app) {
  app?.render?.(false);
  ui.sidebar?.tabs?.actors?.render?.(false);
}

/** Register party-folder sidebar behavior. */
export function registerPartyFolders() {
  Hooks.on("renderActorDirectory", (app, html) => {
    const root = asElement(html);
    if (!root) return;
    hidePartyActors(root);
    injectPartyFolderButtons(root);
  });

  Hooks.on("createActor", actor => {
    if (actor.type === "party") refreshPartyFolderButtons(ui.sidebar?.tabs?.actors);
  });
  Hooks.on("deleteActor", actor => {
    if (actor.type === "party") refreshPartyFolderButtons(ui.sidebar?.tabs?.actors);
  });
  Hooks.on("updateActor", actor => {
    if (actor.type === "party") refreshPartyFolderButtons(ui.sidebar?.tabs?.actors);
  });
  Hooks.on("updateFolder", folder => {
    if (folder.type === "Actor") refreshPartyFolderButtons(ui.sidebar?.tabs?.actors);
  });
}
