import { VEILRUNNER_SETTINGS, getVeilrunnerSetting } from "../settings.mjs";

const SECTIONS = [
  { key: "quests", label: "Quests", icon: "fa-solid fa-list-check" },
  { key: "lore", label: "Lore", icon: "fa-solid fa-book-open" },
  { key: "bestiary", label: "Bestiary", icon: "fa-solid fa-dragon" },
  { key: "characters", label: "Characters", icon: "fa-solid fa-user-group" },
  { key: "factions", label: "Factions", icon: "fa-solid fa-flag" },
  { key: "places", label: "Places", icon: "fa-solid fa-location-dot" },
  { key: "maps", label: "Maps", icon: "fa-solid fa-map" },
  { key: "my-journal", label: "My Journal", icon: "fa-solid fa-pen-to-square" },
  { key: "shared-journal", label: "Shared Journal", icon: "fa-solid fa-book-bookmark" },
  { key: "timeline", label: "Timeline", icon: "fa-solid fa-timeline" },
  { key: "achievements", label: "Achievements", icon: "fa-solid fa-trophy" }
];
const DATABASE_SECTIONS = ["lore", "bestiary", "characters", "factions", "places"];
const TOP_SECTIONS = [
  { key: "quests", label: "Quests", icon: "fa-solid fa-list-check" },
  { key: "database", label: "Database", icon: "fa-solid fa-database", children: DATABASE_SECTIONS },
  { key: "maps", label: "Maps", icon: "fa-solid fa-map" },
  { key: "journals", label: "Journals", icon: "fa-solid fa-book-bookmark", children: ["my-journal", "shared-journal"] },
  { key: "timeline", label: "Timeline", icon: "fa-solid fa-timeline" },
  { key: "achievements", label: "Achievements", icon: "fa-solid fa-trophy" }
];
const DATAPAD_FOLDER_TREE = {
  "Quests": [],
  "Database": ["Lore", "Bestiary", "Characters", "Factions", "Places"],
  "Maps": [],
  "Journals": ["My Journal", "Shared Journal"],
  "Timeline": [],
  "Achievements": []
};

let datapad;
let datapadFolders = new Map();

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[ _]+/g, "-");
}

function canView(document) {
  return document?.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) ?? false;
}

function categoryForJournal(journal) {
  let folder = journal.folder;
  while (folder) {
    const category = normalize(folder.name);
    if (SECTIONS.some(section => section.key === category)) return category;
    if (category === "player-journal") return "my-journal";
    folder = game.folders.get(folderParentId(folder));
  }
  return "";
}

function journalDatapadData(journal) {
  const data = journal.getFlag?.(game.system.id, "datapad") ?? {};
  const status = ["undiscovered", "inProgress", "complete"].includes(data.status) ? data.status : "inProgress";
  return { category: categoryForJournal(journal), hidden: Boolean(data.hidden), status };
}

function statusLabel(status) {
  return { undiscovered: "Undiscovered", inProgress: "In Progress", complete: "Complete" }[status] ?? "In Progress";
}

function folderParentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

function folderForCategory(category) {
  return datapadFolders.get(category) ?? game.folders.find(folder => folder.type === "JournalEntry" && normalize(folder.name) === category) ?? null;
}

async function ensureDatapadFolders() {
  if (!game.user.isGM || !getVeilrunnerSetting(VEILRUNNER_SETTINGS.createDatapadFolders)) return;
  const journalFolders = () => game.folders.filter(folder => folder.type === "JournalEntry");
  let root = journalFolders().find(folder => folder.name === "Datapad" && !folderParentId(folder));
  if (!root) root = await Folder.create({ name: "Datapad", type: "JournalEntry" });

  for (const [name, children] of Object.entries(DATAPAD_FOLDER_TREE)) {
    let parent = journalFolders().find(folder => folder.name === name && folderParentId(folder) === root.id);
    if (!parent) parent = await Folder.create({ name, type: "JournalEntry", folder: root.id });
    if (!children.length) datapadFolders.set(normalize(name), parent);
    for (const childName of children) {
      let child = journalFolders().find(folder => folder.name === childName && folderParentId(folder) === parent.id);
      if (!child) child = await Folder.create({ name: childName, type: "JournalEntry", folder: parent.id });
      datapadFolders.set(normalize(childName), child);
    }
  }

  for (const journal of game.journal) {
    const configured = normalize(journal.getFlag?.(game.system.id, "datapad")?.category ?? journal.getFlag?.(game.system.id, "datapadCategory"));
    const category = configured === "player-journal" ? "my-journal" : configured;
    const folder = datapadFolders.get(category);
    if (folder && !journal.folder) await journal.update({ folder: folder.id });
  }
}

function questData(journal) {
  return {
    level: "",
    displayPageTitle: true,
    image: "",
    aspectRatio: "landscape",
    observerObjectivePermission: "default",
    questGiver: "",
    location: "",
    difficulty: "",
    deadline: "",
    reward: "",
    rewardItems: [],
    description: "",
    order: 0,
    ...(journal?.getFlag?.(game.system.id, "datapadQuest") ?? {})
  };
}

class PlayerDatapad {
  constructor() {
    this.section = "quests";
    this.editingJournal = null;
    this.viewingJournal = null;
    this.questSort = "manual";
    this.questSortMenuOpen = false;
    this.questDirectoryCollapsed = false;
    this.questOutlineCollapsed = false;
    this.questOutlineWidth = 210;
    this.selectedQuestFolderId = null;
    this.questCollapsedFolders = new Set();
    this.root = document.createElement("section");
    this.root.className = "veilrunner vr-player-datapad";
    this.root.tabIndex = -1;
    this.position = { x: Math.max(20, Math.round((window.innerWidth - 1100) / 2)), y: Math.max(20, Math.round((window.innerHeight - 760) / 2)) };
  }

  render() {
    if (!this.root.isConnected) document.body.append(this.root);
    this.#applyPosition();
    this.#draw();
    this.root.focus();
  }

  bringToFront() {
    this.root.focus();
  }

  close() {
    if (document.fullscreenElement === this.root) document.exitFullscreen?.();
    this.root.remove();
    datapad = null;
  }

  #documents() {
    let journals = game.journal.filter(journal => {
      const data = journalDatapadData(journal);
      return canView(journal) && data.category === this.section && (game.user.isGM || !data.hidden);
    }).map(journal => ({ document: journal, kind: "Journal", ...journalDatapadData(journal) }));
    if (this.section === "quests") {
      const questRoot = folderForCategory("quests");
      if (this.selectedQuestFolderId && this.selectedQuestFolderId !== questRoot?.id) {
        journals = journals.filter(entry => entry.document.folder?.id === this.selectedQuestFolderId);
      }
      const created = entry => Number(entry.document._stats?.createdTime ?? 0);
      if (this.questSort === "inProgress") journals = journals.filter(entry => entry.status === "inProgress");
      if (this.questSort === "complete") journals = journals.filter(entry => entry.status === "complete");
      journals.sort((a, b) => {
        if (this.questSort === "a-z") return a.document.name.localeCompare(b.document.name);
        if (this.questSort === "z-a") return b.document.name.localeCompare(a.document.name);
        if (this.questSort === "oldest") return created(a) - created(b);
        if (this.questSort === "newest") return created(b) - created(a);
        if (this.questSort === "questGiver") return String(questData(a.document).questGiver).localeCompare(String(questData(b.document).questGiver));
        if (this.questSort === "location") return String(questData(a.document).location).localeCompare(String(questData(b.document).location));
        return Number(questData(a.document).order) - Number(questData(b.document).order) || a.document.name.localeCompare(b.document.name);
      });
    }
    if (this.section !== "maps") return journals;
    const scenes = game.scenes.filter(scene => canView(scene) && (normalize(scene.folder?.name) === "maps" || normalize(scene.getFlag?.(game.system.id, "datapadCategory")) === "maps"))
      .map(scene => ({ document: scene, kind: "Scene", hidden: false, status: "inProgress" }));
    return [...journals, ...scenes];
  }

  #draw() {
    const section = SECTIONS.find(entry => entry.key === this.section) ?? SECTIONS[0];
    const documents = this.#documents();
    const databaseActive = DATABASE_SECTIONS.includes(this.section);
    const journalsActive = ["my-journal", "shared-journal"].includes(this.section);
    const questEditor = this.section === "quests" && this.editingJournal ? this.#questEditor() : "";
    const questWorkspace = this.section === "quests" && !questEditor ? this.#questWorkspace(documents) : "";
    this.root.innerHTML = `
      <div class="vr-datapad-shell" role="dialog" aria-modal="true" aria-label="Player Datapad">
        <header class="vr-datapad-header">
          <nav class="vr-datapad-nav" aria-label="Datapad sections">
            ${TOP_SECTIONS.map(entry => {
              const active = entry.key === "database" ? databaseActive : entry.key === "journals" ? journalsActive : entry.key === this.section;
              const children = entry.children?.map(key => SECTIONS.find(section => section.key === key)).filter(Boolean) ?? [];
              return `<div class="vr-datapad-nav-group ${children.length ? "has-menu" : ""}"><button type="button" class="${active ? "active" : ""}" data-top-section="${entry.key}"><i class="${entry.icon}"></i><span>${entry.label}</span>${children.length ? '<i class="fa-solid fa-chevron-down menu-arrow"></i>' : ""}</button>${children.length ? `<div class="vr-datapad-menu">${children.map(child => `<button type="button" class="${child.key === this.section ? "active" : ""}" data-section="${child.key}"><i class="${child.icon}"></i><span>${child.label}</span></button>`).join("")}</div>` : ""}</div>`;
            }).join("")}
          </nav>
          <span class="vr-datapad-drag-handle" title="Drag to move Datapad"><i class="fa-solid fa-grip-lines"></i></span>
          <div class="vr-datapad-header-actions">
            ${game.user.isGM ? '<button type="button" data-action="new-entry" title="New Entry"><i class="fa-solid fa-plus"></i><span>New</span></button>' : ""}
            <button type="button" data-action="fullscreen" title="Toggle Fullscreen"><i class="fa-solid fa-expand"></i></button>
            <button type="button" data-action="close" title="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </header>
        <div class="vr-datapad-layout">
          <main class="vr-datapad-content">
            <header><i class="${section.icon}"></i><div><h2>${questEditor ? "Quest Editor" : this.section === "quests" ? "Quest Directory" : section.label}</h2><p>${questEditor ? "Organize how this quest appears and what players can discover." : this.section === "quests" ? "Browse, sort, and review campaign quests." : game.user.isGM ? "Manage campaign records and player discovery." : "Player-visible campaign records."}</p></div></header>
            ${questEditor || questWorkspace || `<div class="vr-datapad-records">
              ${documents.length ? documents.map(({ document, kind, hidden, status }) => {
                const locked = !game.user.isGM && status === "undiscovered";
                return `<article class="vr-datapad-entry ${hidden ? "is-hidden" : ""} ${locked ? "is-locked" : ""}">
                  <button type="button" class="vr-datapad-record" data-action="open-entry" data-uuid="${escape(document.uuid)}" ${locked ? "disabled" : ""}><i class="fa-solid ${locked ? "fa-lock" : kind === "Scene" ? "fa-map" : "fa-book"}"></i><span>${locked ? "Undiscovered" : escape(document.name)}</span><small>${statusLabel(status)}</small></button>
                  ${game.user.isGM && kind === "Journal" ? `<div class="vr-datapad-gm-controls">${this.section === "quests" ? `<button type="button" data-action="edit-quest" data-uuid="${escape(document.uuid)}" title="Edit quest"><i class="fa-solid fa-pen"></i></button>` : ""}<label title="Hidden entries are visible only to GMs"><input type="checkbox" data-action="toggle-hidden" data-uuid="${escape(document.uuid)}" ${hidden ? "checked" : ""}> Hide</label><select data-action="set-status" data-uuid="${escape(document.uuid)}"><option value="undiscovered" ${status === "undiscovered" ? "selected" : ""}>Undiscovered</option><option value="inProgress" ${status === "inProgress" ? "selected" : ""}>In Progress</option><option value="complete" ${status === "complete" ? "selected" : ""}>Complete</option></select></div>` : ""}
                </article>`;
              }).join("") : `<div class="vr-datapad-empty"><i class="fa-solid fa-folder-open"></i><p>No ${escape(section.label.toLowerCase())} records yet.</p><small>${game.user.isGM ? "Use New Entry to add the first record in this section." : "The GM has not shared any records in this section yet."}</small></div>`}
            </div>`}
          </main>
        </div>
        <footer><i class="fa-solid fa-keyboard"></i> Press <kbd>J</kbd> to open this Datapad from anywhere.</footer>
      </div>`;
    this.root.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());
    this.root.querySelector('[data-action="fullscreen"]')?.addEventListener("click", () => this.#toggleFullscreen());
    this.#bindDrag();
    this.root.querySelectorAll("[data-top-section]").forEach(button => button.addEventListener("click", () => {
      const topSection = button.dataset.topSection;
      this.section = topSection === "database" ? (DATABASE_SECTIONS.includes(this.section) ? this.section : "lore")
        : topSection === "journals" ? (journalsActive ? this.section : "my-journal") : topSection;
      if (topSection === "quests") {
        this.editingJournal = null;
        this.viewingJournal = null;
      }
      if (this.section !== "quests") this.editingJournal = null;
      if (this.section !== "quests") this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelectorAll("[data-section]").forEach(button => button.addEventListener("click", () => {
      this.section = button.dataset.section;
      this.editingJournal = null;
      this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelector('[data-action="new-entry"]')?.addEventListener("click", () => this.#createEntry());
    this.root.querySelectorAll('[data-action="open-entry"]').forEach(button => button.addEventListener("click", async () => {
      const document = await fromUuid(button.dataset.uuid);
      if (this.section === "quests" && document) {
        this.viewingJournal = document;
        this.#draw();
      } else document?.sheet?.render(true);
    }));
    this.root.querySelectorAll('[data-action="toggle-hidden"]').forEach(input => input.addEventListener("change", () => this.#updateEntry(input.dataset.uuid, { hidden: input.checked })));
    this.root.querySelectorAll('[data-action="set-status"]').forEach(select => select.addEventListener("change", () => this.#updateEntry(select.dataset.uuid, { status: select.value })));
    this.root.querySelectorAll('[data-action="edit-quest"]').forEach(button => button.addEventListener("click", async () => {
      this.editingJournal = await fromUuid(button.dataset.uuid);
      this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelector('[data-action="cancel-quest-edit"]')?.addEventListener("click", () => {
      this.editingJournal = null;
      this.#draw();
    });
    this.root.querySelector('[data-action="save-quest"]')?.addEventListener("click", event => this.#saveQuest(event));
    this.root.querySelector('[data-action="browse-quest-image"]')?.addEventListener("click", () => {
      const input = this.root.querySelector('.vr-datapad-quest-editor input[name="image"]');
      if (!input) return;
      new FilePicker({
        type: "image",
        current: input.value,
        callback: path => { input.value = path; }
      }).browse();
    });
    this.root.querySelectorAll('[data-reward-item]').forEach(button => button.addEventListener("click", async () => {
      const item = await fromUuid(button.dataset.rewardItem);
      item?.sheet?.render(true);
    }));
    this.root.querySelector('[data-action="toggle-quest-directory"]')?.addEventListener("click", () => {
      this.questDirectoryCollapsed = !this.questDirectoryCollapsed;
      this.#draw();
    });
    this.root.querySelector('[data-action="toggle-quest-outline"]')?.addEventListener("click", () => {
      this.questOutlineCollapsed = !this.questOutlineCollapsed;
      this.#draw();
    });
    this.root.querySelectorAll('[data-quest-sort]').forEach(button => button.addEventListener("click", () => {
      this.questSort = button.dataset.questSort;
      this.questSortMenuOpen = false;
      this.#draw();
    }));
    this.root.querySelector('[data-action="cycle-quest-sort"]')?.addEventListener("click", () => {
      const options = ["manual", "a-z", "z-a", "oldest", "newest", "inProgress", "complete", "questGiver", "location"];
      this.questSort = options[(options.indexOf(this.questSort) + 1) % options.length];
      this.#draw();
    });
    this.root.querySelector('[data-action="toggle-quest-sort-menu"]')?.addEventListener("click", () => {
      this.questSortMenuOpen = !this.questSortMenuOpen;
      this.#draw();
    });
    this.root.querySelectorAll('[data-quest-anchor]').forEach(button => button.addEventListener("click", () => {
      this.root.querySelector(`.vr-quest-preview [data-quest-section="${button.dataset.questAnchor}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }));
    this.root.querySelector('[data-action="create-quest-folder"]')?.addEventListener("click", () => this.#createQuestFolder());
    this.root.querySelectorAll('[data-quest-folder]').forEach(button => button.addEventListener("click", () => {
      this.selectedQuestFolderId = button.dataset.questFolder;
      this.#draw();
    }));
    this.root.querySelectorAll('[data-action="toggle-quest-folder"]').forEach(button => button.addEventListener("click", () => {
      const folderId = button.dataset.questFolder;
      if (this.questCollapsedFolders.has(folderId)) this.questCollapsedFolders.delete(folderId);
      else this.questCollapsedFolders.add(folderId);
      this.#draw();
    }));
    this.root.querySelectorAll('[data-quest-document]').forEach(button => button.addEventListener("dragstart", event => {
      event.dataTransfer?.setData("text/plain", button.dataset.questDocument);
      event.dataTransfer.effectAllowed = "move";
    }));
    this.root.querySelectorAll('[data-drop-quest-folder]').forEach(folder => {
      folder.addEventListener("dragover", event => { if (game.user.isGM) event.preventDefault(); });
      folder.addEventListener("drop", async event => {
        event.preventDefault();
        if (!game.user.isGM) return;
        const journal = game.journal.get(event.dataTransfer?.getData("text/plain"));
        if (!journal) return;
        await journal.update({ folder: folder.dataset.dropQuestFolder });
        this.selectedQuestFolderId = folder.dataset.dropQuestFolder;
        this.#draw();
      });
    });
    this.#bindQuestOutlineResize();
    this.root.querySelector('[data-action="back-to-quests"]')?.addEventListener("click", () => {
      this.viewingJournal = null;
      this.#draw();
    });
    this.root.querySelector('[data-action="edit-open-quest"]')?.addEventListener("click", () => {
      this.editingJournal = this.viewingJournal;
      this.viewingJournal = null;
      this.#draw();
    });
    this.root.onkeydown = event => {
      if (event.key === "Escape") this.close();
    };
  }

  async #toggleFullscreen() {
    if (document.fullscreenElement === this.root) await document.exitFullscreen?.();
    else await this.root.requestFullscreen?.();
  }

  #applyPosition() {
    if (document.fullscreenElement === this.root) return;
    this.root.style.left = `${this.position.x}px`;
    this.root.style.top = `${this.position.y}px`;
  }

  #bindDrag() {
    const header = this.root.querySelector(".vr-datapad-header");
    if (!header) return;
    header.onpointerdown = event => {
      if (event.button !== 0 || event.target.closest("button")) return;
      const start = { x: event.clientX, y: event.clientY, left: this.position.x, top: this.position.y };
      header.setPointerCapture(event.pointerId);
      const move = pointerEvent => {
        this.position.x = Math.max(0, Math.min(window.innerWidth - 240, start.left + pointerEvent.clientX - start.x));
        this.position.y = Math.max(0, Math.min(window.innerHeight - 80, start.top + pointerEvent.clientY - start.y));
        this.#applyPosition();
      };
      header.addEventListener("pointermove", move);
      header.addEventListener("pointerup", () => header.removeEventListener("pointermove", move), { once: true });
      header.addEventListener("pointercancel", () => header.removeEventListener("pointermove", move), { once: true });
    };
  }

  #bindQuestOutlineResize() {
    const handle = this.root.querySelector(".vr-quest-outline-resizer");
    const workspace = this.root.querySelector(".vr-quest-workspace");
    if (!handle || !workspace || this.questOutlineCollapsed) return;
    handle.onpointerdown = event => {
      if (event.button !== 0) return;
      const startX = event.clientX;
      const startWidth = this.questOutlineWidth;
      const maxWidth = Math.max(150, workspace.getBoundingClientRect().width - 520);
      handle.setPointerCapture(event.pointerId);
      const move = pointerEvent => {
        this.questOutlineWidth = Math.max(150, Math.min(maxWidth, startWidth + pointerEvent.clientX - startX));
        workspace.style.setProperty("--quest-outline-width", `${this.questOutlineWidth}px`);
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", () => handle.removeEventListener("pointermove", move), { once: true });
      handle.addEventListener("pointercancel", () => handle.removeEventListener("pointermove", move), { once: true });
    };
  }

  async #createEntry() {
    if (this.section === "quests" && !this.selectedQuestFolderId) {
      ui.notifications?.warn("Create or select a quest folder before adding a quest.");
      return;
    }
    const folder = this.section === "quests" && this.selectedQuestFolderId
      ? game.folders.get(this.selectedQuestFolderId)
      : folderForCategory(this.section);
    if (!folder) {
      ui.notifications?.warn("The Datapad folders are still being created. Please try again in a moment.");
      return;
    }
    const journal = await JournalEntry.create({
      name: `New ${SECTIONS.find(entry => entry.key === this.section)?.label ?? "Datapad"} Entry`,
      folder: folder?.id ?? null,
      flags: { [game.system.id]: { datapad: { category: this.section, hidden: false, status: "undiscovered" } } }
    });
    this.#draw();
    if (this.section === "quests") {
      this.editingJournal = journal;
      this.#draw();
    } else journal?.sheet?.render(true);
  }

  async #updateEntry(uuid, changes) {
    const journal = await fromUuid(uuid);
    if (!journal || !game.user.isGM) return;
    await journal.setFlag(game.system.id, "datapad", { ...journalDatapadData(journal), ...changes });
    this.#draw();
  }

  #questEditor() {
    const journal = this.editingJournal;
    const data = questData(journal);
    const state = journalDatapadData(journal);
    const selectedRewards = new Set((data.rewardItems ?? []).map(item => typeof item === "string" ? item : item.uuid));
    const itemOptions = Array.from(game.items ?? []).sort((a, b) => a.name.localeCompare(b.name))
      .map(item => `<option value="${escape(item.uuid)}" ${selectedRewards.has(item.uuid) ? "selected" : ""}>${escape(item.name)}</option>`).join("");
    return `<form class="vr-datapad-quest-editor">
      <div class="vr-quest-editor-title"><label>Quest Title<input name="name" value="${escape(journal.name)}" required></label><label class="vr-quest-toggle"><input name="displayPageTitle" type="checkbox" ${data.displayPageTitle ? "checked" : ""}> Display page title</label></div>
      <section><h3>Discovery & Status</h3><div class="vr-quest-grid"><label>Level<input name="level" value="${escape(data.level)}" placeholder="Level 1"></label><label>Status<select name="status"><option value="undiscovered" ${state.status === "undiscovered" ? "selected" : ""}>Undiscovered</option><option value="inProgress" ${state.status === "inProgress" ? "selected" : ""}>In Progress</option><option value="complete" ${state.status === "complete" ? "selected" : ""}>Complete</option></select></label><label>Observer objective permission<select name="observerObjectivePermission"><option value="default" ${data.observerObjectivePermission === "default" ? "selected" : ""}>Default (follow setting)</option><option value="allow" ${data.observerObjectivePermission === "allow" ? "selected" : ""}>Allow</option><option value="deny" ${data.observerObjectivePermission === "deny" ? "selected" : ""}>Deny</option></select></label><label class="vr-quest-toggle"><input name="hidden" type="checkbox" ${state.hidden ? "checked" : ""}> Hide from players</label></div></section>
      <section><h3>Presentation</h3><div class="vr-quest-grid"><div class="vr-quest-image-field wide"><span>Image</span><div><input name="image" value="${escape(data.image)}" placeholder="Image path or URL"><button type="button" data-action="browse-quest-image" title="Browse Foundry files"><i class="fa-solid fa-folder-open"></i></button></div></div><label>Aspect ratio<select name="aspectRatio"><option value="landscape" ${data.aspectRatio === "landscape" ? "selected" : ""}>Landscape</option><option value="portrait" ${data.aspectRatio === "portrait" ? "selected" : ""}>Portrait</option><option value="square" ${data.aspectRatio === "square" ? "selected" : ""}>Square</option></select></label><label>Order<input name="order" type="number" value="${escape(data.order)}"></label></div></section>
      <section><h3>Quest Details</h3><div class="vr-quest-grid"><label>Quest giver<input name="questGiver" value="${escape(data.questGiver)}"></label><label>Location<input name="location" value="${escape(data.location)}"></label><label>Difficulty<input name="difficulty" value="${escape(data.difficulty)}"></label><label>Deadline<input name="deadline" value="${escape(data.deadline)}"></label></div></section>
      <section><h3>Reward</h3><textarea name="reward" placeholder="Rewards for completing this quest">${escape(data.reward)}</textarea><label class="wide">Linked Items<select name="rewardItems" multiple size="5">${itemOptions}</select></label></section>
      <section><h3>Description</h3><textarea name="description" placeholder="Quest briefing, objectives, and notes">${escape(data.description)}</textarea></section>
      <footer><button type="button" data-action="cancel-quest-edit">Cancel</button><button type="button" class="primary" data-action="save-quest"><i class="fa-solid fa-floppy-disk"></i> Save Quest</button></footer>
    </form>`;
  }

  #questView() {
    const journal = this.viewingJournal;
    const data = questData(journal);
    const state = journalDatapadData(journal);
    const details = [["Quest Giver", data.questGiver], ["Location", data.location], ["Difficulty", data.difficulty], ["Deadline", data.deadline], ["Level", data.level]].filter(([, value]) => String(value ?? "").trim());
    const rewardItems = (data.rewardItems ?? []).map(item => typeof item === "string" ? { uuid: item, name: "Linked Item" } : item);
    const defaultObjectiveVisibility = getVeilrunnerSetting(VEILRUNNER_SETTINGS.defaultQuestObjectiveVisibility);
    const objectivesAllowed = game.user.isGM
      || data.observerObjectivePermission === "allow"
      || (data.observerObjectivePermission === "default" && defaultObjectiveVisibility === "observers");
    const text = value => escape(value).replace(/\n/g, "<br>");
    return `<article class="vr-datapad-quest-view">
      <div class="vr-quest-view-actions">${game.user.isGM ? '<button type="button" data-action="edit-open-quest"><i class="fa-solid fa-pen"></i> Edit</button>' : ""}</div>
      <header>${data.displayPageTitle ? `<h1>${escape(journal.name)}</h1>` : ""}<span class="vr-quest-status ${state.status}">${statusLabel(state.status)}</span></header>
      <div class="vr-quest-view-layout">
        <div class="vr-quest-view-main"><section data-quest-section="objective"><h3>Objective</h3><p>${objectivesAllowed ? (data.description ? text(data.description) : "No objective briefing has been published yet.") : "Objectives have not been revealed yet."}</p></section>${data.reward || rewardItems.length ? `<section data-quest-section="reward"><h3>Reward</h3>${data.reward ? `<p>${text(data.reward)}</p>` : ""}${rewardItems.length ? `<div class="vr-quest-reward-items">${rewardItems.map(item => `<button type="button" data-reward-item="${escape(item.uuid)}"><i class="fa-solid fa-cube"></i>${escape(item.name)}</button>`).join("")}</div>` : ""}</section>` : ""}</div>
        <aside data-quest-section="details">${data.image ? `<img class="vr-quest-image ${escape(data.aspectRatio)}" src="${escape(data.image)}" alt="${escape(journal.name)}">` : ""}${details.length ? `<dl>${details.map(([label, value]) => `<div><dt>${label}</dt><dd>${escape(value)}</dd></div>`).join("")}</dl>` : ""}</aside>
      </div>
    </article>`;
  }

  #questWorkspace(documents) {
    const controls = [
      ["manual", "Sort Manually", "fa-solid fa-bars-staggered"],
      ["a-z", "A-Z", "fa-solid fa-arrow-down-a-z"],
      ["z-a", "Z-A", "fa-solid fa-arrow-down-z-a"],
      ["oldest", "Oldest to Newest", "fa-solid fa-arrow-up-1-9"],
      ["newest", "Newest to Oldest", "fa-solid fa-arrow-down-1-9"],
      ["inProgress", "In Progress", "fa-solid fa-spinner"],
      ["complete", "Completed", "fa-solid fa-circle-check"],
      ["questGiver", "By Quest Giver", "fa-solid fa-user"],
      ["location", "By Location", "fa-solid fa-location-dot"]
    ];
    const currentSort = controls.find(([key]) => key === this.questSort) ?? controls[0];
    const folders = this.#questFolders();
    const activeFolderId = this.selectedQuestFolderId;
    const foldersById = new Map(folders.map(folder => [folder.id, folder]));
    const isVisible = folder => {
      let parentId = folder.parentId;
      while (parentId) {
        if (this.questCollapsedFolders.has(parentId)) return false;
        parentId = foldersById.get(parentId)?.parentId;
      }
      return true;
    };
    const folderMarkup = `<div class="vr-quest-folder-list">${folders.filter(isVisible).map(folder => {
      const entries = this.questCollapsedFolders.has(folder.id) ? [] : documents.filter(entry => entry.document.folder?.id === folder.id);
      const hasChildren = folders.some(child => child.parentId === folder.id) || entries.length > 0;
      const collapsed = this.questCollapsedFolders.has(folder.id);
      return `<div class="vr-quest-folder-row" style="--quest-folder-depth:${folder.depth}">${hasChildren ? `<button type="button" class="vr-quest-tree-toggle" data-action="toggle-quest-folder" data-quest-folder="${folder.id}" title="${collapsed ? "Expand" : "Collapse"} folder"><i class="fa-solid fa-chevron-${collapsed ? "right" : "down"}"></i></button>` : '<span class="vr-quest-tree-spacer"></span>'}<button type="button" class="vr-quest-folder-select ${folder.id === activeFolderId ? "active" : ""}" data-quest-folder="${folder.id}" data-drop-quest-folder="${folder.id}"><i class="fa-solid fa-folder"></i><span>${escape(folder.name)}</span></button></div>${entries.map(({ document, status, hidden }) => `<button type="button" draggable="${game.user.isGM}" class="vr-quest-folder-entry ${this.viewingJournal?.id === document.id ? "active" : ""} ${hidden ? "is-hidden" : ""}" data-action="open-entry" data-uuid="${escape(document.uuid)}" data-quest-document="${document.id}" style="--quest-folder-depth:${folder.depth}"><i class="fa-solid fa-file-lines"></i><span>${escape(document.name)}</span><small>${statusLabel(status)}</small></button>`).join("")}`;
    }).join("")}${documents.length ? "" : '<div class="vr-quest-list-empty">No matching quests.</div>'}</div>`;
    return `<div class="vr-quest-workspace ${this.questDirectoryCollapsed ? "directory-collapsed" : ""} ${this.questOutlineCollapsed ? "outline-collapsed" : ""}" style="--quest-outline-width: ${this.questOutlineWidth}px">
      <aside class="vr-quest-directory"><header><span>Directory</span><div>${game.user.isGM ? '<button type="button" data-action="create-quest-folder" title="New quest folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}<button type="button" data-action="toggle-quest-outline" title="${this.questOutlineCollapsed ? "Show" : "Hide"} page outline"><i class="fa-solid fa-list"></i></button><button type="button" data-action="toggle-quest-directory" title="${this.questDirectoryCollapsed ? "Expand" : "Collapse"} directory"><i class="fa-solid fa-angles-left"></i></button></div></header><div class="vr-quest-directory-controls"><div class="vr-quest-sort-picker"><button type="button" class="vr-quest-sort-cycle" data-action="cycle-quest-sort" title="Cycle sort options"><i class="${currentSort[2]}"></i><span>${currentSort[1]}</span></button><button type="button" class="vr-quest-sort-toggle" data-action="toggle-quest-sort-menu" title="Choose a sort option"><i class="fa-solid fa-chevron-down"></i></button><div class="vr-quest-sort-menu ${this.questSortMenuOpen ? "open" : ""}">${controls.map(([key, label, icon]) => `<button type="button" class="${this.questSort === key ? "active" : ""}" data-quest-sort="${key}"><i class="${icon}"></i><span>${label}</span></button>`).join("")}</div></div></div>${folderMarkup}</aside>
      <section class="vr-quest-outline">${this.#questOutline()}</section>
      <div class="vr-quest-outline-resizer" title="Drag to resize page outline"></div>
      <section class="vr-quest-preview">${this.viewingJournal ? this.#questView() : '<div class="vr-quest-preview-empty"><i class="fa-solid fa-list-check"></i><p>Select a quest to view its briefing.</p></div>'}</section>
    </div>`;
  }

  #questFolders() {
    const root = folderForCategory("quests");
    if (!root) return [];
    const folders = [];
    const addChildren = (parentId, depth) => {
      const children = game.folders.filter(folder => folder.type === "JournalEntry" && folderParentId(folder) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        folders.push({ id: child.id, name: child.name, depth, parentId });
        addChildren(child.id, depth + 1);
      }
    };
    addChildren(root.id, 0);
    return folders;
  }

  #questOutline() {
    if (!this.viewingJournal) return '<div class="vr-quest-outline-empty">Select a quest to see its page outline.</div>';
    const data = questData(this.viewingJournal);
    const entries = [["Quest Briefing", "objective"], ["Quest Details", "details"]];
    if (data.reward || data.rewardItems?.length) entries.splice(1, 0, ["Reward", "reward"]);
    const headings = String(data.description ?? "").match(/^#{1,6}\s+(.+)$/gm) ?? [];
    for (const heading of headings) entries.push([heading.replace(/^#+\s*/, ""), "objective"]);
    return `<header><i class="fa-solid fa-list"></i><span>On This Page</span></header><div>${entries.map(([label, target]) => `<button type="button" data-quest-anchor="${target}">${escape(label)}</button>`).join("")}</div>`;
  }

  async #createQuestFolder() {
    if (!game.user.isGM) return;
    const parent = folderForCategory("quests");
    if (!parent) return;
    const folder = await Folder.create({ name: "New Quest Folder", type: "JournalEntry", folder: parent.id });
    this.selectedQuestFolderId = folder.id;
    this.#draw();
  }

  async #saveQuest(event) {
    const form = event.target.closest("form");
    const values = Object.fromEntries(new FormData(form));
    const journal = this.editingJournal;
    const { name, status, hidden, displayPageTitle, rewardItems, ...quest } = values;
    quest.displayPageTitle = form.elements.displayPageTitle.checked;
    quest.order = Number(quest.order) || 0;
    quest.rewardItems = new FormData(form).getAll("rewardItems").map(uuid => {
      const item = Array.from(game.items ?? []).find(entry => entry.uuid === uuid);
      return { uuid, name: item?.name ?? "Linked Item" };
    });
    await journal.update({ name });
    await journal.setFlag(game.system.id, "datapad", { ...journalDatapadData(journal), status, hidden: form.elements.hidden.checked });
    await journal.setFlag(game.system.id, "datapadQuest", quest);
    this.editingJournal = journal;
    this.#draw();
  }
}

export function openPlayerDatapad() {
  if (!game.user.isGM && !getVeilrunnerSetting(VEILRUNNER_SETTINGS.allowPlayerDatapad)) {
    ui.notifications?.warn(game.i18n.localize("VEILRUNNER.Settings.DatapadDisabled"));
    return null;
  }
  if (datapad) {
    datapad.bringToFront();
    return datapad;
  }
  datapad = new PlayerDatapad();
  datapad.render();
  return datapad;
}

export function registerDatapad() {
  game.keybindings.register(game.system.id, "openPlayerDatapad", {
    name: "VEILRUNNER.Keybindings.openPlayerDatapad.Name",
    hint: "VEILRUNNER.Keybindings.openPlayerDatapad.Hint",
    editable: [{ key: "KeyJ" }],
    onDown: () => {
      return Boolean(openPlayerDatapad());
    }
  });

  Hooks.on("renderJournalDirectory", (app, html) => {
    if (!game.user.isGM && !getVeilrunnerSetting(VEILRUNNER_SETTINGS.allowPlayerDatapad)) return;
    const root = html instanceof HTMLElement ? html : html?.[0] ?? app.element?.[0] ?? app.element;
    if (!root?.querySelector || root.querySelector(".vr-open-datapad")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "vr-open-datapad";
    button.innerHTML = '<i class="fa-solid fa-tablet-screen-button"></i> Datapad';
    button.addEventListener("click", () => openPlayerDatapad());
    (root.querySelector(".directory-header .header-actions") ?? root.querySelector(".directory-header") ?? root).append(button);
  });

  Hooks.once("ready", () => ensureDatapadFolders());

  for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"]) {
    Hooks.on(hook, () => datapad?.render());
  }
}
