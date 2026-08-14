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
  { key: "party-journal", label: "Party Journal", icon: "fa-solid fa-book-bookmark" },
  { key: "timeline", label: "Timeline", icon: "fa-solid fa-timeline" },
  { key: "achievements", label: "Achievements", icon: "fa-solid fa-trophy" }
];
const DATABASE_SECTIONS = ["lore", "bestiary", "characters", "factions", "places"];
const TOP_SECTIONS = [
  { key: "quests", label: "Quests", icon: "fa-solid fa-list-check" },
  { key: "database", label: "Database", icon: "fa-solid fa-database", children: DATABASE_SECTIONS },
  { key: "maps", label: "Maps", icon: "fa-solid fa-map" },
  { key: "journals", label: "Journals", icon: "fa-solid fa-book-bookmark", children: ["my-journal", "shared-journal", "party-journal"] },
  { key: "timeline", label: "Timeline", icon: "fa-solid fa-timeline" },
  { key: "achievements", label: "Achievements", icon: "fa-solid fa-trophy" }
];
const DATAPAD_FOLDER_TREE = {
  "Quests": [],
  "Database": ["Lore", "Bestiary", "Characters", "Factions", "Places"],
  "Maps": [],
  "Journals": ["My Journal", "Shared Journal", "Party Journal"],
  "Timeline": [],
  "Achievements": []
};
const QUEST_TYPE_SECTIONS = { main: "Main Quests", side: "Side Quests", other: "Other" };

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

export function journalDatapadData(journal) {
  const data = journal.getFlag?.(game.system.id, "datapad") ?? {};
  const status = ["undiscovered", "inProgress", "complete", "failed"].includes(data.status) ? data.status : "inProgress";
  return { category: categoryForJournal(journal), hidden: Boolean(data.hidden), status, partyId: String(data.partyId ?? "") };
}

function playerDatapadTheme() {
  const options = game.user?.character?.system?.sheetOptions ?? {};
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value ?? "").trim()) ? String(value).trim() : fallback;
  return {
    uiColor: color(options.uiColor, "#101216"),
    accent: color(options.categoryHighlightColor, "#a855f7")
  };
}

function statusLabel(status) {
  return { undiscovered: "Undiscovered", inProgress: "In Progress", complete: "Completed", failed: "Failed" }[status] ?? "In Progress";
}

function folderParentId(folder) {
  return folder?.folder?.id ?? folder?.folder ?? null;
}

function folderForCategory(category) {
  return datapadFolders.get(category) ?? game.folders.find(folder => folder.type === "JournalEntry" && normalize(folder.name) === category) ?? null;
}

function questTypeForFolder(folder) {
  const root = folderForCategory("quests");
  let current = folder;
  while (current && folderParentId(current) !== root?.id) current = game.folders.get(folderParentId(current));
  return Object.entries(QUEST_TYPE_SECTIONS).find(([, name]) => current?.name === name)?.[0] ?? "other";
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

function achievementData(page) {
  const data = page?.getFlag?.(game.system.id, "achievement") ?? {};
  const color = /^#[0-9a-f]{6}$/i.test(String(data.color ?? "")) ? data.color : "#facc15";
  return {
    image: String(data.image ?? ""),
    color,
    visibleWhenUnearned: Boolean(data.visibleWhenUnearned),
    awardedActorIds: Array.isArray(data.awardedActorIds) ? data.awardedActorIds.map(String) : []
  };
}

function achievementHeroes() {
  return game.actors.filter(actor => actor.type === "hero");
}

function isAchievementChapter(journal) {
  return categoryForJournal(journal) === "achievements";
}

function playerEarnedAchievement(page) {
  const awarded = new Set(achievementData(page).awardedActorIds);
  return achievementHeroes().some(actor => awarded.has(actor.id) && actor.isOwner);
}

function canSeeAchievement(page) {
  const data = achievementData(page);
  return game.user.isGM || playerEarnedAchievement(page) || data.visibleWhenUnearned;
}

function achievementPageSheetRoot(app, html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? app.element?.[0] ?? app.element;
}

function addAchievementPageConfig(app, html) {
  const page = app.document ?? app.object;
  if (!game.user.isGM || !page || !isAchievementChapter(page.parent)) return;
  const root = achievementPageSheetRoot(app, html);
  if (!root?.querySelector || root.querySelector(".vr-achievement-page-config")) return;
  const data = achievementData(page);
  const heroes = achievementHeroes();
  const panel = document.createElement("section");
  panel.className = "vr-achievement-page-config";
  panel.innerHTML = `<header><i class="fa-solid fa-trophy"></i><div><h3>Achievement</h3><p>This Journal Page is one achievement.</p></div></header>
    <div class="vr-achievement-config-fields"><label>Artwork<div><input type="text" name="achievement-image" value="${escape(data.image)}" placeholder="Image path or URL"><button type="button" data-action="browse-achievement-image" title="Browse Foundry files"><i class="fa-solid fa-folder-open"></i></button></div></label><label>Accent color<input type="color" name="achievement-color" value="${escape(data.color)}"></label><label class="vr-achievement-visible"><input type="checkbox" name="achievement-visible" ${data.visibleWhenUnearned ? "checked" : ""}> Show as ??? before it is earned</label></div>
    <div class="vr-achievement-award-grid"><h4>Awarded Heroes</h4><p>Click a portrait to grant or revoke this achievement immediately.</p><div>${heroes.map(actor => `<button type="button" class="${data.awardedActorIds.includes(actor.id) ? "awarded" : ""}" data-achievement-hero="${actor.id}" title="${escape(actor.name)}"><img src="${escape(actor.system?.portraitImage || actor.img)}" alt="${escape(actor.name)}"><span>${escape(actor.name)}</span><i class="fa-solid fa-check"></i></button>`).join("") || '<small>No Hero actors are available.</small>'}</div></div>
    <footer><button type="button" data-action="save-achievement-config"><i class="fa-solid fa-floppy-disk"></i> Save Achievement Settings</button></footer>`;
  (root.querySelector("form") ?? root).append(panel);
  panel.querySelector('[data-action="browse-achievement-image"]')?.addEventListener("click", () => {
    const input = panel.querySelector('[name="achievement-image"]');
    new FilePicker({ type: "image", current: input.value, callback: path => { input.value = path; } }).browse();
  });
  panel.querySelector('[data-action="save-achievement-config"]')?.addEventListener("click", async () => {
    await page.setFlag(game.system.id, "achievement", {
      ...achievementData(page),
      image: panel.querySelector('[name="achievement-image"]').value.trim(),
      color: panel.querySelector('[name="achievement-color"]').value,
      visibleWhenUnearned: panel.querySelector('[name="achievement-visible"]').checked
    });
    datapad?.render();
    ui.notifications?.info("Achievement settings saved.");
  });
  panel.querySelectorAll("[data-achievement-hero]").forEach(button => button.addEventListener("click", async () => {
    const current = achievementData(page);
    const actorId = button.dataset.achievementHero;
    const awardedActorIds = current.awardedActorIds.includes(actorId)
      ? current.awardedActorIds.filter(id => id !== actorId)
      : [...current.awardedActorIds, actorId];
    await page.setFlag(game.system.id, "achievement", { ...current, awardedActorIds });
    button.classList.toggle("awarded", awardedActorIds.includes(actorId));
    datapad?.render();
  }));
}

class PlayerDatapad {
  constructor({ section = "quests", partyId = null } = {}) {
    this.section = SECTIONS.some(entry => entry.key === section) ? section : "quests";
    this.partyId = partyId;
    this.editingJournal = null;
    this.viewingJournal = null;
    this.questSort = "manual";
    this.questSortMenuOpen = false;
    this.questDirectoryMode = "quest";
    this.questTypeCollapsed = new Set();
    this.questStatusCollapsed = new Set();
    this.questDirectoryCollapsed = false;
    this.questOutlineCollapsed = false;
    this.questOutlineWidth = 210;
    this.selectedQuestFolderId = null;
    this.selectedCategoryFolderIds = new Map();
    this.selectedAchievementChapterId = null;
    this.questCollapsedFolders = new Set();
    this.questDirectoryHandleTop = 50;
    this.navIndicatorFrom = null;
    this.root = document.createElement("section");
    this.root.className = "veilrunner vr-player-datapad";
    this.root.tabIndex = -1;
    this.position = { x: Math.max(20, Math.round((window.innerWidth - 1100) / 2)), y: Math.max(20, Math.round((window.innerHeight - 760) / 2)) };
  }

  render() {
    if (!this.root.isConnected) document.body.append(this.root);
    const theme = playerDatapadTheme();
    this.root.style.setProperty("--vr-dp-ui-color", theme.uiColor);
    this.root.style.setProperty("--vr-datapad-accent", theme.accent);
    this.#applyPosition();
    this.#draw();
    this.root.focus();
  }

  bringToFront() {
    this.root.focus();
  }

  show({ section, partyId = null } = {}) {
    if (SECTIONS.some(entry => entry.key === section)) this.section = section;
    this.partyId = partyId;
    this.render();
  }

  close() {
    if (document.fullscreenElement === this.root) document.exitFullscreen?.();
    this.root.remove();
    datapad = null;
  }

  #documents() {
    let journals = game.journal.filter(journal => {
      const data = journalDatapadData(journal);
      return canView(journal) && data.category === this.section && (game.user.isGM || !data.hidden)
        && (this.section !== "party-journal" || !this.partyId || data.partyId === this.partyId);
    }).map(journal => ({ document: journal, kind: "Journal", ...journalDatapadData(journal) }));
    if (this.section === "quests") {
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
    const journalsActive = ["my-journal", "shared-journal", "party-journal"].includes(this.section);
    const activeTopIndex = TOP_SECTIONS.findIndex(entry => entry.key === (databaseActive ? "database" : journalsActive ? "journals" : this.section));
    const indicatorFrom = this.navIndicatorFrom ?? activeTopIndex;
    const questEditor = this.section === "quests" && this.editingJournal ? this.#questEditor() : "";
    const directoryWorkspace = !questEditor ? (this.section === "quests" ? this.#questWorkspace(documents) : this.section === "achievements" ? this.#achievementWorkspace(documents) : this.#categoryWorkspace(documents)) : "";
    this.root.innerHTML = `
      <div class="vr-datapad-shell" role="dialog" aria-modal="true" aria-label="Player Datapad">
        <header class="vr-datapad-header">
          <nav class="vr-datapad-nav" aria-label="Datapad sections">
            <span class="vr-datapad-nav-indicator" style="--nav-from: ${indicatorFrom}; --nav-offset: ${activeTopIndex};" aria-hidden="true"></span>
            ${TOP_SECTIONS.map(entry => {
              const active = entry.key === "database" ? databaseActive : entry.key === "journals" ? journalsActive : entry.key === this.section;
              const children = entry.children?.map(key => SECTIONS.find(section => section.key === key)).filter(Boolean) ?? [];
              return `<div class="vr-datapad-nav-group ${children.length ? "has-menu" : ""}"><button type="button" class="${active ? "active" : ""}" data-top-section="${entry.key}"><i class="${entry.icon}"></i><span>${entry.label}</span>${children.length ? '<i class="fa-solid fa-chevron-down menu-arrow"></i>' : ""}</button>${children.length ? `<div class="vr-datapad-menu">${children.map(child => `<button type="button" class="${child.key === this.section ? "active" : ""}" data-section="${child.key}"><i class="${child.icon}"></i><span>${child.label}</span></button>`).join("")}</div>` : ""}</div>`;
            }).join("")}
          </nav>
          <span class="vr-datapad-drag-handle" title="Drag to move Datapad"><i class="fa-solid fa-grip-lines"></i></span>
          <div class="vr-datapad-header-actions">
            <button type="button" data-action="fullscreen" title="Toggle Fullscreen"><i class="fa-solid fa-expand"></i></button>
            <button type="button" data-action="close" title="Close"><i class="fa-solid fa-xmark"></i></button>
          </div>
        </header>
        <div class="vr-datapad-layout">
          <main class="vr-datapad-content">
            <header><i class="${section.icon}"></i><div><h2>${questEditor ? "Quest Editor" : this.section === "quests" ? "Quest Directory" : section.label}</h2><p>${questEditor ? "Organize how this quest appears and what players can discover." : this.section === "quests" ? "Browse, sort, and review campaign quests." : game.user.isGM ? "Manage campaign records and player discovery." : "Player-visible campaign records."}</p></div></header>
            ${questEditor || directoryWorkspace || `<div class="vr-datapad-records">
              ${documents.length ? documents.map(({ document, kind, hidden, status }) => {
                const locked = !game.user.isGM && status === "undiscovered";
                return `<article class="vr-datapad-entry ${hidden ? "is-hidden" : ""} ${locked ? "is-locked" : ""}">
                  <button type="button" class="vr-datapad-record" data-action="open-entry" data-uuid="${escape(document.uuid)}" ${locked ? "disabled" : ""}><i class="fa-solid ${locked ? "fa-lock" : kind === "Scene" ? "fa-map" : "fa-book"}"></i><span>${locked ? "Undiscovered" : escape(document.name)}</span><small>${statusLabel(status)}</small></button>
                  ${game.user.isGM && kind === "Journal" ? `<div class="vr-datapad-gm-controls">${this.section === "quests" ? `<button type="button" data-action="edit-quest" data-uuid="${escape(document.uuid)}" title="Edit quest"><i class="fa-solid fa-pen"></i></button>` : ""}<label title="Hidden entries are visible only to GMs"><input type="checkbox" data-action="toggle-hidden" data-uuid="${escape(document.uuid)}" ${hidden ? "checked" : ""}> Hide</label><select data-action="set-status" data-uuid="${escape(document.uuid)}"><option value="undiscovered" ${status === "undiscovered" ? "selected" : ""}>Undiscovered</option><option value="inProgress" ${status === "inProgress" ? "selected" : ""}>In Progress</option><option value="complete" ${status === "complete" ? "selected" : ""}>Complete</option></select></div>` : ""}
                </article>`;
              }).join("") : `<div class="vr-datapad-empty"><i class="fa-solid fa-folder-open"></i><p>No ${escape(section.label.toLowerCase())} records yet.</p><small>${game.user.isGM ? "Use New to add the first record in this section." : "The GM has not shared any records in this section yet."}</small></div>`}
            </div>`}
          </main>
        </div>
        <footer><i class="fa-solid fa-keyboard"></i> Press <kbd>J</kbd> to open this Datapad from anywhere.</footer>
      </div>`;
    const indicator = this.root.querySelector(".vr-datapad-nav-indicator");
    if (indicator && indicatorFrom !== activeTopIndex) requestAnimationFrame(() => indicator.style.setProperty("--nav-from", activeTopIndex));
    this.navIndicatorFrom = null;
    this.root.querySelector('[data-action="close"]')?.addEventListener("click", () => this.close());
    this.root.querySelector('[data-action="fullscreen"]')?.addEventListener("click", () => this.#toggleFullscreen());
    this.#bindDrag();
    this.root.querySelectorAll("[data-top-section]").forEach(button => button.addEventListener("click", () => {
      this.navIndicatorFrom = activeTopIndex;
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
      this.navIndicatorFrom = activeTopIndex;
      this.section = button.dataset.section;
      this.editingJournal = null;
      this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelectorAll('[data-action="new-entry"]').forEach(button => button.addEventListener("click", () => this.#createEntry()));
    this.root.querySelectorAll('[data-action="open-entry"]').forEach(button => button.addEventListener("click", async () => {
      const document = await fromUuid(button.dataset.uuid);
      if ((this.section === "quests" || button.closest(".vr-datapad-directory-workspace")) && document) {
        this.viewingJournal = document;
        this.#draw();
      } else document?.sheet?.render(true);
    }));
    this.root.querySelector('[data-action="open-selected-entry"]')?.addEventListener("click", async button => {
      const document = await fromUuid(button.currentTarget.dataset.uuid);
      document?.sheet?.render(true);
    });
    this.root.querySelectorAll('[data-action="toggle-hidden"]').forEach(input => input.addEventListener("change", () => this.#updateEntry(input.dataset.uuid, { hidden: input.checked })));
    this.root.querySelectorAll('[data-action="set-status"]').forEach(select => select.addEventListener("change", () => this.#updateEntry(select.dataset.uuid, { status: select.value })));
    this.root.querySelectorAll('[data-action="edit-quest"]').forEach(button => button.addEventListener("click", async () => {
      this.editingJournal = await fromUuid(button.dataset.uuid);
      this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelectorAll('[data-category-folder]').forEach(button => button.addEventListener("click", () => {
      this.selectedCategoryFolderIds.set(this.section, button.dataset.categoryFolder);
      if (this.section === "achievements") this.selectedAchievementChapterId = null;
      this.viewingJournal = null;
      this.#draw();
    }));
    this.root.querySelectorAll('[data-achievement-chapter]').forEach(button => button.addEventListener("click", () => {
      this.selectedAchievementChapterId = button.dataset.achievementChapter;
      this.#draw();
    }));
    this.root.querySelector('[data-action="create-achievement-chapter"]')?.addEventListener("click", () => this.#createAchievementChapter());
    this.root.querySelector('[data-action="open-achievement-chapter"]')?.addEventListener("click", () => {
      game.journal.get(this.selectedAchievementChapterId)?.sheet?.render(true);
    });
    this.root.querySelectorAll('[data-achievement-page]').forEach(button => button.addEventListener("click", () => {
      const chapter = game.journal.get(this.selectedAchievementChapterId);
      chapter?.pages?.get(button.dataset.achievementPage)?.sheet?.render(true);
    }));
    this.root.querySelector('[data-action="create-category-folder"]')?.addEventListener("click", () => this.#createCategoryFolder());
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
    const rewardDropTarget = this.root.querySelector('[data-drop-reward-items]');
    rewardDropTarget?.addEventListener("dragover", event => {
      event.preventDefault();
      rewardDropTarget.classList.add("drag-over");
    });
    rewardDropTarget?.addEventListener("dragleave", () => rewardDropTarget.classList.remove("drag-over"));
    rewardDropTarget?.addEventListener("drop", event => this.#dropRewardItem(event, rewardDropTarget));
    this.root.querySelector('[data-action="toggle-quest-directory"]')?.addEventListener("click", () => {
      this.questDirectoryCollapsed = !this.questDirectoryCollapsed;
      const workspace = this.root.querySelector(".vr-quest-workspace");
      const toggle = this.root.querySelector('[data-action="toggle-quest-directory"]');
      workspace?.classList.toggle("directory-collapsed", this.questDirectoryCollapsed);
      if (this.questDirectoryCollapsed && toggle) {
        toggle.classList.remove("directory-handle-return");
        void toggle.offsetWidth;
        toggle.classList.add("directory-handle-return");
      } else toggle?.classList.remove("directory-handle-return");
      toggle?.setAttribute("aria-expanded", String(!this.questDirectoryCollapsed));
      toggle?.setAttribute("aria-label", this.questDirectoryCollapsed ? "Show quest directory" : "Hide quest directory");
      toggle?.setAttribute("title", this.questDirectoryCollapsed ? "Show quest directory" : "Hide quest directory");
      const icon = toggle?.querySelector("i");
      if (icon) icon.className = `fa-solid fa-angles-${this.questDirectoryCollapsed ? "right" : "left"}`;
    });
    this.root.querySelector('[data-action="toggle-quest-outline"]')?.addEventListener("click", () => {
      this.questOutlineCollapsed = !this.questOutlineCollapsed;
      this.#draw();
    });
    this.root.querySelector('[data-action="toggle-quest-directory-mode"]')?.addEventListener("click", () => {
      this.questDirectoryMode = this.questDirectoryMode === "quest" ? "tree" : "quest";
      this.#draw();
    });
    this.root.querySelectorAll('[data-action="toggle-quest-type"]').forEach(button => button.addEventListener("click", () => {
      const type = button.dataset.questType;
      if (this.questTypeCollapsed.has(type)) this.questTypeCollapsed.delete(type);
      else this.questTypeCollapsed.add(type);
      this.#draw();
    }));
    this.root.querySelectorAll('[data-action="toggle-quest-status"]').forEach(button => button.addEventListener("click", () => {
      const status = button.dataset.questStatus;
      if (this.questStatusCollapsed.has(status)) this.questStatusCollapsed.delete(status);
      else this.questStatusCollapsed.add(status);
      this.#draw();
    }));
    this.root.querySelectorAll('[data-quest-folder-document]').forEach(folder => folder.addEventListener("dragstart", event => {
      if (!game.user.isGM) return;
      event.dataTransfer?.setData("application/veilrunner-quest-folder", folder.dataset.questFolderDocument);
      event.dataTransfer.effectAllowed = "move";
    }));
    this.root.querySelectorAll('[data-drop-quest-type]').forEach(section => {
      section.addEventListener("dragover", event => { if (game.user.isGM) event.preventDefault(); });
      section.addEventListener("dragenter", () => section.classList.add("drag-over"));
      section.addEventListener("dragleave", () => section.classList.remove("drag-over"));
      section.addEventListener("drop", event => this.#moveQuestFolderToType(event, section));
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
    this.root.querySelectorAll('.vr-quest-folder-select').forEach(button => button.addEventListener("click", () => {
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
    this.#bindQuestDirectoryHandleDragging();
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

  #bindQuestDirectoryHandleDragging() {
    const handle = this.root.querySelector(".vr-quest-directory-toggle");
    const workspace = this.root.querySelector(".vr-quest-workspace");
    if (!handle || !workspace) return;

    handle.style.setProperty("--quest-directory-handle-top", `${this.questDirectoryHandleTop}%`);
    let drag = null;
    let moved = false;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || !this.questDirectoryCollapsed) return;
      const workspaceRect = workspace.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      drag = {
        startY: event.clientY,
        startCenter: handleRect.top - workspaceRect.top + (handleRect.height / 2),
        workspaceRect
      };
      moved = false;
    });
    handle.addEventListener("pointermove", event => {
      if (!drag) return;
      const distance = event.clientY - drag.startY;
      if (Math.abs(distance) > 3 && !moved) {
        moved = true;
        handle.classList.add("is-dragging");
        handle.setPointerCapture(event.pointerId);
      }
      if (!moved) return;
      const halfHeight = handle.offsetHeight / 2;
      const center = Math.max(halfHeight, Math.min(drag.workspaceRect.height - halfHeight, drag.startCenter + distance));
      this.questDirectoryHandleTop = (center / drag.workspaceRect.height) * 100;
      handle.style.setProperty("--quest-directory-handle-top", `${this.questDirectoryHandleTop}%`);
    });
    const cancelClick = event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      moved = false;
    };
    const finishDrag = event => {
      if (!drag) return;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      handle.classList.remove("is-dragging");
      if (moved) handle.addEventListener("click", cancelClick, { capture: true, once: true });
      drag = null;
    };
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
  }

  async #createEntry() {
    if (this.section === "quests" && !this.selectedQuestFolderId) {
      ui.notifications?.warn("Create or select a quest folder before adding a quest.");
      return;
    }
    const selectedFolderId = this.section === "quests" ? this.selectedQuestFolderId : this.selectedCategoryFolderIds.get(this.section);
    const folder = selectedFolderId ? game.folders.get(selectedFolderId) : folderForCategory(this.section);
    if (!folder) {
      ui.notifications?.warn("The Datapad folders are still being created. Please try again in a moment.");
      return;
    }
    const journal = await JournalEntry.create({
      name: `New ${SECTIONS.find(entry => entry.key === this.section)?.label ?? "Datapad"} Entry`,
      folder: folder?.id ?? null,
      flags: { [game.system.id]: { datapad: { category: this.section, hidden: false, status: "undiscovered", partyId: this.section === "party-journal" ? this.partyId : "" } } }
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

  async #dropRewardItem(event, target) {
    event.preventDefault();
    target.classList.remove("drag-over");
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item") {
      ui.notifications?.warn("Drop an Item from the Items Directory or a compendium.");
      return;
    }
    let item = await CONFIG.Item.documentClass.fromDropData(data).catch(() => null);
    if (!item && data.uuid) item = await fromUuid(data.uuid);
    if (!item) {
      ui.notifications?.warn("The dropped Item could not be loaded.");
      return;
    }
    const select = target.querySelector('select[name="rewardItems"]');
    if (!select) return;
    let option = Array.from(select.options).find(entry => entry.value === item.uuid);
    if (!option) {
      option = document.createElement("option");
      option.value = item.uuid;
      option.textContent = item.name;
      option.dataset.itemName = item.name;
      select.append(option);
    }
    option.selected = true;
  }

  async #moveQuestFolderToType(event, section) {
    event.preventDefault();
    section.classList.remove("drag-over");
    if (!game.user.isGM) return;
    const folderId = event.dataTransfer?.getData("application/veilrunner-quest-folder");
    const folder = game.folders.get(folderId);
    const root = folderForCategory("quests");
    const type = section.dataset.dropQuestType;
    if (!folder || !root || !QUEST_TYPE_SECTIONS[type]) return;
    let destination = game.folders.find(entry => entry.type === "JournalEntry" && entry.name === QUEST_TYPE_SECTIONS[type] && folderParentId(entry) === root.id);
    if (!destination) destination = await Folder.create({ name: QUEST_TYPE_SECTIONS[type], type: "JournalEntry", folder: root.id });
    if (folder.id === destination.id || folderParentId(folder) === destination.id) return;
    await folder.update({ folder: destination.id });
    this.selectedQuestFolderId = folder.id;
    this.#draw();
  }

  async #createCategoryFolder() {
    if (!game.user.isGM) return;
    const root = folderForCategory(this.section);
    if (!root) return;
    const parent = game.folders.get(this.selectedCategoryFolderIds.get(this.section)) ?? root;
    const folder = await Folder.create({ name: `New ${SECTIONS.find(entry => entry.key === this.section)?.label ?? "Datapad"} Folder`, type: "JournalEntry", folder: parent.id });
    this.selectedCategoryFolderIds.set(this.section, folder.id);
    this.#draw();
  }

  #questEditor() {
    const journal = this.editingJournal;
    const data = questData(journal);
    const state = journalDatapadData(journal);
    const selectedRewards = new Map((data.rewardItems ?? []).map(item => typeof item === "string" ? [item, "Linked Item"] : [item.uuid, item.name]));
    const items = new Map(Array.from(game.items ?? []).map(item => [item.uuid, item.name]));
    for (const [uuid, name] of selectedRewards) if (!items.has(uuid)) items.set(uuid, name);
    const itemOptions = Array.from(items, ([uuid, name]) => ({ uuid, name })).sort((a, b) => a.name.localeCompare(b.name))
      .map(item => `<option value="${escape(item.uuid)}" data-item-name="${escape(item.name)}" ${selectedRewards.has(item.uuid) ? "selected" : ""}>${escape(item.name)}</option>`).join("");
    return `<form class="vr-datapad-quest-editor">
      <div class="vr-quest-editor-columns">
        <div class="vr-quest-editor-column vr-quest-information"><div class="vr-quest-editor-title"><label>Quest Title<input name="name" value="${escape(journal.name)}" required></label></div>
          <section><h3>Quest Details</h3><div class="vr-quest-grid"><label>Quest giver<input name="questGiver" value="${escape(data.questGiver)}"></label><label>Location<input name="location" value="${escape(data.location)}"></label><label>Difficulty<input name="difficulty" value="${escape(data.difficulty)}"></label><label>Deadline<input name="deadline" value="${escape(data.deadline)}"></label></div></section>
          <section><h3>Reward</h3><textarea name="reward" placeholder="Rewards for completing this quest">${escape(data.reward)}</textarea><label class="wide">Linked Items<div class="vr-quest-reward-drop" data-drop-reward-items><select name="rewardItems" multiple size="5">${itemOptions}</select><small>Drag Items here from the Items Directory or a compendium.</small></div></label></section>
          <section><h3>Description</h3><textarea name="description" placeholder="Quest briefing, objectives, and notes">${escape(data.description)}</textarea></section>
        </div>
        <aside class="vr-quest-editor-column vr-quest-gm-settings"><section><h3>Discovery & Status</h3><div class="vr-quest-grid"><label>Level<input name="level" value="${escape(data.level)}" placeholder="Level 1"></label><label>Status<select name="status"><option value="undiscovered" ${state.status === "undiscovered" ? "selected" : ""}>Undiscovered</option><option value="inProgress" ${state.status === "inProgress" ? "selected" : ""}>In Progress</option><option value="complete" ${state.status === "complete" ? "selected" : ""}>Completed</option><option value="failed" ${state.status === "failed" ? "selected" : ""}>Failed</option></select></label><label>Observer objective permission<select name="observerObjectivePermission"><option value="default" ${data.observerObjectivePermission === "default" ? "selected" : ""}>Default (follow setting)</option><option value="allow" ${data.observerObjectivePermission === "allow" ? "selected" : ""}>Allow</option><option value="deny" ${data.observerObjectivePermission === "deny" ? "selected" : ""}>Deny</option></select></label><label class="vr-quest-toggle"><input name="hidden" type="checkbox" ${state.hidden ? "checked" : ""}> Hide from players</label></div></section>
          <section><h3>GM Display</h3><label class="vr-quest-toggle"><input name="displayPageTitle" type="checkbox" ${data.displayPageTitle ? "checked" : ""}> Display page title</label></section>
          <section><h3>Presentation</h3><div class="vr-quest-grid"><div class="vr-quest-image-field wide"><span>Image</span><div><input name="image" value="${escape(data.image)}" placeholder="Image path or URL"><button type="button" data-action="browse-quest-image" title="Browse Foundry files"><i class="fa-solid fa-folder-open"></i></button></div></div><label>Aspect ratio<select name="aspectRatio"><option value="landscape" ${data.aspectRatio === "landscape" ? "selected" : ""}>Landscape</option><option value="portrait" ${data.aspectRatio === "portrait" ? "selected" : ""}>Portrait</option><option value="square" ${data.aspectRatio === "square" ? "selected" : ""}>Square</option></select></label><label>Order<input name="order" type="number" value="${escape(data.order)}"></label></div></section>
        </aside>
      </div>
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

  #categoryFolders() {
    const root = folderForCategory(this.section);
    if (!root) return [];
    const folders = [{ id: root.id, name: root.name, depth: 0, parentId: null, root: true }];
    const addChildren = (parentId, depth) => {
      const children = game.folders.filter(folder => folder.type === "JournalEntry" && folderParentId(folder) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        folders.push({ id: child.id, name: child.name, depth, parentId, root: false });
        addChildren(child.id, depth + 1);
      }
    };
    addChildren(root.id, 1);
    return folders;
  }

  #achievementWorkspace(documents) {
    const folders = this.#categoryFolders();
    const activeFolderId = this.selectedCategoryFolderIds.get("achievements") ?? folderForCategory("achievements")?.id;
    const chapters = documents.filter(entry => entry.document.folder?.id === activeFolderId && isAchievementChapter(entry.document));
    const chapter = game.journal.get(this.selectedAchievementChapterId) ?? chapters[0]?.document ?? null;
    if (chapter && chapter.id !== this.selectedAchievementChapterId) this.selectedAchievementChapterId = chapter.id;
    const pages = chapter?.pages?.contents ?? [];
    const visiblePages = pages.filter(page => canSeeAchievement(page));
    const folderMarkup = folders.map(folder => `<div class="vr-datapad-folder-row" style="--datapad-folder-depth:${folder.depth}"><button type="button" class="vr-datapad-folder-select ${folder.id === activeFolderId ? "active" : ""}" data-category-folder="${folder.id}"><i class="fa-solid fa-folder"></i><span>${escape(folder.root ? "Achievements Directory" : folder.name)}</span></button></div>`).join("");
    const chapterMarkup = chapters.map(entry => `<button type="button" class="vr-achievement-chapter ${chapter?.id === entry.document.id ? "active" : ""}" data-achievement-chapter="${entry.document.id}"><i class="fa-solid fa-book-bookmark"></i><span>${escape(entry.document.name)}</span><small>${entry.document.pages?.size ?? entry.document.pages?.contents?.length ?? 0}</small></button>`).join("");
    const cards = visiblePages.map(page => {
      const data = achievementData(page);
      const earned = game.user.isGM || playerEarnedAchievement(page);
      if (!earned) return `<article class="vr-achievement-card is-locked"><div class="vr-achievement-card-art"><span>?</span><span>?</span><span>?</span></div><h3>???</h3></article>`;
      const recipients = achievementHeroes().filter(actor => data.awardedActorIds.includes(actor.id));
      const content = page.text?.content ?? "";
      return `<button type="button" class="vr-achievement-card" data-achievement-page="${page.id}" style="--achievement-color:${escape(data.color)}">${data.image ? `<img class="vr-achievement-card-art" src="${escape(data.image)}" alt="">` : '<div class="vr-achievement-card-art"><i class="fa-solid fa-trophy"></i></div>'}<div class="vr-achievement-card-copy"><h3>${escape(page.name)}</h3>${content ? `<div class="vr-achievement-card-description">${content}</div>` : ""}<p>${recipients.map(actor => `<img src="${escape(actor.system?.portraitImage || actor.img)}" title="${escape(actor.name)}" alt="${escape(actor.name)}">`).join("")}</p></div></button>`;
    }).join("");
    return `<div class="vr-achievement-workspace">
      <aside class="vr-datapad-directory"><header><span>Folders</span>${game.user.isGM ? '<button type="button" data-action="create-category-folder" title="New adventure folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}</header><div class="vr-datapad-folder-list">${folderMarkup}</div></aside>
      <aside class="vr-achievement-chapters"><header><span>Chapters</span>${game.user.isGM ? '<button type="button" data-action="create-achievement-chapter" title="New chapter"><i class="fa-solid fa-plus"></i></button>' : ""}</header><div>${chapterMarkup || '<p class="vr-achievement-empty">No chapters in this folder yet.</p>'}</div></aside>
      <section class="vr-achievement-cards"><header><div><span>Achievements</span><small>${chapter ? escape(chapter.name) : "Select a chapter"}</small></div>${game.user.isGM && chapter ? '<button type="button" data-action="open-achievement-chapter"><i class="fa-solid fa-book-open"></i> Open Chapter</button>' : ""}</header>${chapter ? (cards || '<p class="vr-achievement-empty">No player-visible achievements in this chapter.</p>') : '<p class="vr-achievement-empty">Select a chapter to view its achievements.</p>'}</section>
    </div>`;
  }

  async #createAchievementChapter() {
    if (!game.user.isGM) return;
    const folder = game.folders.get(this.selectedCategoryFolderIds.get("achievements")) ?? folderForCategory("achievements");
    if (!folder) return;
    const chapter = await JournalEntry.create({
      name: "New Achievement Chapter",
      folder: folder.id,
      ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      flags: { [game.system.id]: { datapad: { category: "achievements", hidden: false, status: "inProgress", partyId: "" } } }
    });
    this.selectedAchievementChapterId = chapter.id;
    this.#draw();
    chapter.sheet?.render(true);
  }

  #categoryWorkspace(documents) {
    const section = SECTIONS.find(entry => entry.key === this.section) ?? SECTIONS[0];
    const folders = this.#categoryFolders();
    const activeFolderId = this.selectedCategoryFolderIds.get(this.section) ?? folderForCategory(this.section)?.id;
    const folderMarkup = folders.map(folder => {
      const entries = documents.filter(entry => (entry.kind === "Journal" && entry.document.folder?.id === folder.id) || (folder.root && entry.kind === "Scene"));
      return `<div class="vr-datapad-folder-row" style="--datapad-folder-depth:${folder.depth}"><button type="button" class="vr-datapad-folder-select ${folder.id === activeFolderId ? "active" : ""}" data-category-folder="${folder.id}"><i class="fa-solid fa-folder"></i><span>${escape(folder.root ? `${section.label} Directory` : folder.name)}</span></button></div>${entries.map(({ document, kind, hidden, status }) => `<button type="button" class="vr-datapad-folder-entry ${this.viewingJournal?.id === document.id ? "active" : ""} ${hidden ? "is-hidden" : ""}" data-action="open-entry" data-uuid="${escape(document.uuid)}" style="--datapad-folder-depth:${folder.depth}"><i class="fa-solid ${kind === "Scene" ? "fa-map" : "fa-file-lines"}"></i><span>${escape(document.name)}</span><small>${statusLabel(status)}</small></button>`).join("")}`;
    }).join("");
    const selected = this.viewingJournal;
    return `<div class="vr-datapad-directory-workspace">
      <aside class="vr-datapad-directory"><header><span>Directory</span>${game.user.isGM ? '<div><button type="button" data-action="new-entry" title="New journal entry"><i class="fa-solid fa-plus"></i><span>New</span></button><button type="button" data-action="create-category-folder" title="New folder"><i class="fa-solid fa-folder-plus"></i></button></div>' : ""}</header><div class="vr-datapad-folder-list">${folderMarkup || '<div class="vr-datapad-directory-empty">No folders yet.</div>'}</div></aside>
      <section class="vr-datapad-directory-preview">${selected ? `<div><i class="fa-solid ${selected.documentName === "Scene" ? "fa-map" : "fa-book"}"></i><h3>${escape(selected.name)}</h3><p>${statusLabel(journalDatapadData(selected).status)}</p><button type="button" data-action="open-selected-entry" data-uuid="${escape(selected.uuid)}">Open ${selected.documentName === "Scene" ? "Scene" : "Journal Entry"}</button></div>` : `<div><i class="${section.icon}"></i><p>Select a ${escape(section.label.toLowerCase().replace(/s$/, ""))} to view its entry.</p></div>`}</section>
    </div>`;
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
    const folderMarkupFor = scopedDocuments => {
      const relevantFolderIds = new Set(scopedDocuments.map(entry => entry.document.folder?.id).filter(Boolean));
      for (const folderId of Array.from(relevantFolderIds)) {
        let parentId = foldersById.get(folderId)?.parentId;
        while (parentId) {
          relevantFolderIds.add(parentId);
          parentId = foldersById.get(parentId)?.parentId;
        }
      }
      return `<div class="vr-quest-folder-list">${folders.filter(folder => relevantFolderIds.has(folder.id) && isVisible(folder)).map(folder => {
      const folderEntries = scopedDocuments.filter(entry => entry.document.folder?.id === folder.id);
      const entries = this.questCollapsedFolders.has(folder.id) ? [] : folderEntries;
      const hasChildren = folders.some(child => child.parentId === folder.id) || folderEntries.length > 0;
      const collapsed = this.questCollapsedFolders.has(folder.id);
      return `<div class="vr-quest-folder-row" style="--quest-folder-depth:${folder.depth}"><button type="button" draggable="${game.user.isGM}" class="vr-quest-folder-select ${folder.id === activeFolderId ? "active" : ""}" data-quest-folder="${folder.id}" data-quest-folder-document="${folder.id}" data-drop-quest-folder="${folder.id}"><i class="fa-solid fa-folder"></i><span>${escape(folder.name)}</span></button>${hasChildren ? `<button type="button" class="vr-quest-tree-toggle" data-action="toggle-quest-folder" data-quest-folder="${folder.id}" title="${collapsed ? "Expand" : "Collapse"} folder"><i class="fa-solid fa-chevron-${collapsed ? "right" : "down"}"></i></button>` : '<span class="vr-quest-tree-spacer"></span>'}</div>${entries.map(({ document, status, hidden }) => `<button type="button" draggable="${game.user.isGM}" class="vr-quest-folder-entry ${this.viewingJournal?.id === document.id ? "active" : ""} ${hidden ? "is-hidden" : ""}" data-action="open-entry" data-uuid="${escape(document.uuid)}" data-quest-document="${document.id}" style="--quest-folder-depth:${folder.depth}; padding-left:30px !important"><i class="fa-solid fa-file-lines"></i><span>${escape(document.name)}</span><small>${statusLabel(status)}</small></button>`).join("")}`;
      }).join("")}${scopedDocuments.length ? "" : '<div class="vr-quest-list-empty">No matching quests.</div>'}</div>`;
    };
    const questTypes = Object.entries(QUEST_TYPE_SECTIONS);
    const questModeMarkup = `<div class="vr-quest-mode-list">${questTypes.map(([type, label]) => {
      const collapsed = this.questTypeCollapsed.has(type);
      const entries = documents.filter(entry => questTypeForFolder(entry.document.folder) === type);
      return `<section class="vr-quest-directory-group" data-drop-quest-type="${type}"><button type="button" class="vr-quest-directory-group-toggle" data-action="toggle-quest-type" data-quest-type="${type}" aria-expanded="${!collapsed}"><i class="fa-solid fa-caret-${collapsed ? "right" : "down"}"></i><span>${label}</span><small>${entries.length}</small></button>${collapsed ? "" : folderMarkupFor(entries)}</section>`;
    }).join("")}</div>`;
    const statuses = [["inProgress", "In Progress"], ["complete", "Completed"], ["failed", "Failed"], ["undiscovered", "Undiscovered"]];
    const treeModeMarkup = `<div class="vr-quest-mode-list">${statuses.map(([status, label]) => {
      const collapsed = this.questStatusCollapsed.has(status);
      const entries = documents.filter(entry => entry.status === status);
      return `<section class="vr-quest-directory-group"><button type="button" class="vr-quest-directory-group-toggle" data-action="toggle-quest-status" data-quest-status="${status}" aria-expanded="${!collapsed}"><i class="fa-solid fa-caret-${collapsed ? "right" : "down"}"></i><span>${label}</span><small>${entries.length}</small></button>${collapsed ? "" : `<div class="vr-quest-status-list">${entries.map(({ document, hidden, status: entryStatus }) => `<button type="button" draggable="${game.user.isGM}" class="vr-quest-folder-entry ${this.viewingJournal?.id === document.id ? "active" : ""} ${hidden ? "is-hidden" : ""}" data-action="open-entry" data-uuid="${escape(document.uuid)}" data-quest-document="${document.id}" style="padding-left:30px !important"><i class="fa-solid fa-file-lines"></i><span>${escape(document.name)}</span><small>${statusLabel(entryStatus)}</small></button>`).join("") || '<div class="vr-quest-list-empty">No quests.</div>'}</div>`}</section>`;
    }).join("")}</div>`;
    const directoryMarkup = this.questDirectoryMode === "quest" ? questModeMarkup : treeModeMarkup;
    return `<div class="vr-quest-workspace ${this.questDirectoryCollapsed ? "directory-collapsed" : ""} ${this.questOutlineCollapsed ? "outline-collapsed" : ""}" style="--quest-outline-width: ${this.questOutlineWidth}px">
      <aside class="vr-quest-directory"><header><span>Directory</span><div>${game.user.isGM ? '<button type="button" data-action="new-entry" title="New quest entry"><i class="fa-solid fa-plus"></i><span>New</span></button><button type="button" data-action="create-quest-folder" title="New quest folder"><i class="fa-solid fa-folder-plus"></i></button>' : ""}<button type="button" data-action="toggle-quest-directory-mode" title="Switch to ${this.questDirectoryMode === "quest" ? "Tree View" : "Quest Mode"}"><i class="fa-solid ${this.questDirectoryMode === "quest" ? "fa-list-tree" : "fa-list-check"}"></i></button><button type="button" data-action="toggle-quest-outline" title="${this.questOutlineCollapsed ? "Show" : "Hide"} page outline"><i class="fa-solid fa-list"></i></button></div></header><div class="vr-quest-directory-controls"><div class="vr-quest-sort-picker"><button type="button" class="vr-quest-sort-cycle" data-action="cycle-quest-sort" title="Cycle sort options"><i class="${currentSort[2]}"></i><span>${currentSort[1]}</span></button><button type="button" class="vr-quest-sort-toggle" data-action="toggle-quest-sort-menu" title="Choose a sort option"><i class="fa-solid fa-chevron-down"></i></button><div class="vr-quest-sort-menu ${this.questSortMenuOpen ? "open" : ""}">${controls.map(([key, label, icon]) => `<button type="button" class="${this.questSort === key ? "active" : ""}" data-quest-sort="${key}"><i class="${icon}"></i><span>${label}</span></button>`).join("")}</div></div></div>${directoryMarkup}</aside>
      <button type="button" class="vr-quest-directory-toggle" data-action="toggle-quest-directory" aria-expanded="${!this.questDirectoryCollapsed}" aria-label="${this.questDirectoryCollapsed ? "Show" : "Hide"} quest directory" title="${this.questDirectoryCollapsed ? "Show" : "Hide"} quest directory"><i class="fa-solid fa-angles-${this.questDirectoryCollapsed ? "right" : "left"}"></i></button>
      <section class="vr-quest-outline">${this.#questOutline()}</section>
      <div class="vr-quest-outline-resizer" title="Drag to resize page outline"></div>
      <section class="vr-quest-preview">${this.viewingJournal ? this.#questView() : '<div class="vr-quest-preview-empty"><i class="fa-solid fa-list-check"></i><p>Select a quest to view its briefing.</p></div>'}</section>
    </div>`;
  }

  #questFolders() {
    const root = folderForCategory("quests");
    if (!root) return [];
    const folders = [];
    const addChildren = (parentId, depth, displayParentId = parentId) => {
      const children = game.folders.filter(folder => folder.type === "JournalEntry" && folderParentId(folder) === parentId)
        .sort((a, b) => a.name.localeCompare(b.name));
      for (const child of children) {
        if (parentId === root.id && Object.values(QUEST_TYPE_SECTIONS).includes(child.name)) {
          addChildren(child.id, depth, null);
          continue;
        }
        folders.push({ id: child.id, name: child.name, depth, parentId: displayParentId });
        addChildren(child.id, depth + 1, child.id);
      }
    };
    addChildren(root.id, 0, null);
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
    if (!game.user.isGM || !form || !this.editingJournal) return;
    const values = Object.fromEntries(new FormData(form));
    const journal = this.editingJournal;
    const text = key => String(values[key] ?? "").trim();
    const validStatuses = new Set(["undiscovered", "inProgress", "complete", "failed"]);
    const safeStatus = validStatuses.has(text("status")) ? text("status") : "inProgress";
    const quest = {
      level: text("level"),
      displayPageTitle: form.elements.displayPageTitle.checked,
      image: text("image"),
      aspectRatio: ["landscape", "portrait", "square"].includes(text("aspectRatio")) ? text("aspectRatio") : "landscape",
      observerObjectivePermission: ["default", "allow", "deny"].includes(text("observerObjectivePermission")) ? text("observerObjectivePermission") : "default",
      questGiver: text("questGiver"), location: text("location"), difficulty: text("difficulty"), deadline: text("deadline"),
      reward: text("reward"), description: text("description"), order: Number(text("order")) || 0
    };
    quest.rewardItems = Array.from(form.elements.rewardItems.selectedOptions).map(option => ({
      uuid: option.value,
      name: option.dataset.itemName ?? Array.from(game.items ?? []).find(item => item.uuid === option.value)?.name ?? "Linked Item"
    }));
    await journal.update({ name: text("name") || journal.name });
    await journal.setFlag(game.system.id, "datapad", { ...journalDatapadData(journal), status: safeStatus, hidden: form.elements.hidden.checked });
    await journal.setFlag(game.system.id, "datapadQuest", quest);
    this.editingJournal = null;
    this.viewingJournal = null;
    this.#draw();
  }
}

export function openPlayerDatapad(options = {}) {
  if (!game.user.isGM && !getVeilrunnerSetting(VEILRUNNER_SETTINGS.allowPlayerDatapad)) {
    ui.notifications?.warn(game.i18n.localize("VEILRUNNER.Settings.DatapadDisabled"));
    return null;
  }
  if (datapad) {
    datapad.show(options);
    datapad.bringToFront();
    return datapad;
  }
  datapad = new PlayerDatapad(options);
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

  Hooks.on("renderJournalPageSheet", addAchievementPageConfig);
  Hooks.on("renderJournalTextPageSheet", addAchievementPageConfig);

  for (const hook of ["createJournalEntry", "updateJournalEntry", "deleteJournalEntry"]) {
    Hooks.on(hook, () => datapad?.render());
  }
  for (const hook of ["createJournalEntryPage", "updateJournalEntryPage", "deleteJournalEntryPage"]) {
    Hooks.on(hook, () => datapad?.render());
  }
}
