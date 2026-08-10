import { VEILRUNNER_SETTINGS, getVeilrunnerSetting, refreshVeilrunnerCombatUi } from "../settings.mjs";

const DEFAULT_BANDS = [
  { name: "Phase 1", minimum: 11 },
  { name: "Phase 2", minimum: null }
];

let initiativeBandDecider;
let initiativeBandPanelDrag;

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function clampPhaseCount(value) {
  return Math.max(1, Number.parseInt(value, 10) || DEFAULT_BANDS.length);
}

function getPhaseRecommendation() {
  if (!game.combat) return null;

  const sides = { players: 0, enemies: 0 };
  for (const combatant of game.combat.combatants ?? []) {
    if (combatant.actor?.hasPlayerOwner) sides.players += 1;
    else sides.enemies += 1;
  }

  return {
    ...sides,
    phases: Math.max(1, Math.ceil(Math.max(sides.players, sides.enemies) / 3))
  };
}

export function getCombatantTeam(combatant) {
  const disposition = combatant?.token?.disposition ?? combatant?.actor?.prototypeToken?.disposition;
  const dispositionTeams = {
    "-2": { id: "secret", label: "VEILRUNNER.InitiativeBands.SecretBlock" },
    "-1": { id: "hostile", label: "VEILRUNNER.InitiativeBands.HostileBlock" },
    "0": { id: "neutral", label: "VEILRUNNER.InitiativeBands.NeutralBlock" },
    "1": { id: "friendly", label: "VEILRUNNER.InitiativeBands.FriendlyBlock" }
  };
  const team = dispositionTeams[disposition];
  if (team) return team;

  return combatant?.actor?.hasPlayerOwner
    ? { id: "players", label: "VEILRUNNER.InitiativeBands.PlayerBlock" }
    : { id: "enemies", label: "VEILRUNNER.InitiativeBands.EnemyBlock" };
}

function defaultBandName(index) {
  return DEFAULT_BANDS[index]?.name ?? `Phase ${index + 1}`;
}

function normalizeBands(value) {
  const source = Array.isArray(value?.bands) ? value.bands : Array.isArray(value) ? value : DEFAULT_BANDS;
  const bands = source
    .map((band, index) => ({
      name: String(band?.name ?? defaultBandName(index)).trim() || defaultBandName(index),
      minimum: band?.minimum === null || band?.minimum === "" || band?.minimum === undefined ? null : Number.parseInt(band.minimum, 10)
    }))
    .filter(band => band.name);

  const normalized = (bands.length ? bands : DEFAULT_BANDS)
    .map((band, index) => ({
      name: band.name,
      minimum: Number.isFinite(band.minimum) ? band.minimum : null
    }))
    .sort((a, b) => {
      if (a.minimum === null && b.minimum === null) return 0;
      if (a.minimum === null) return 1;
      if (b.minimum === null) return -1;
      return b.minimum - a.minimum;
    });

  if (!normalized.length) return foundry.utils.deepClone(DEFAULT_BANDS);
  for (let index = 0; index < normalized.length - 1; index += 1) {
    if (normalized[index].minimum === null) normalized[index].minimum = 0;
  }
  normalized[normalized.length - 1].minimum = null;
  return normalized;
}

function bandsForCount(bands, count) {
  const normalized = normalizeBands(bands);
  const adjusted = [];
  for (let index = 0; index < count; index += 1) {
    const band = normalized[index];
    if (band) {
      adjusted.push({ ...band });
      continue;
    }
    const previousMinimum = adjusted
      .slice()
      .reverse()
      .find(previous => previous.minimum !== null)?.minimum ?? 25;
    adjusted.push({ name: defaultBandName(index), minimum: index === count - 1 ? null : previousMinimum - 5 });
  }
  adjusted[adjusted.length - 1].minimum = null;
  return adjusted;
}

export function initiativeBandRange(band, index, bands) {
  if (!bands.length) return "";
  if (band.minimum === null) {
    const previous = bands[index - 1];
    return previous?.minimum === null || previous?.minimum === undefined ? "1+" : `1-${previous.minimum - 1}`;
  }
  const previous = bands[index - 1];
  if (!previous || previous.minimum === null) return `${band.minimum}+`;
  if (previous.minimum <= band.minimum) return `${band.minimum}`;
  return `${band.minimum}-${previous.minimum - 1}`;
}

export function getInitiativeBands() {
  return normalizeBands(getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeBands));
}

export function getInitiativeMode() {
  return getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeMode) ?? "phases";
}

export function getInitiativeBandReferenceBands() {
  const bands = getInitiativeBands();
  return bands.map((band, index) => ({
    name: band.name,
    range: initiativeBandRange(band, index, bands)
  }));
}

export function openInitiativeBandDecider() {
  if (!game.user.isGM) {
    ui.notifications.warn(game.i18n.localize("VEILRUNNER.InitiativeBands.GMOnly"));
    return null;
  }
  if (!initiativeBandDecider) initiativeBandDecider = new InitiativeBandDecider();
  initiativeBandDecider.render();
  initiativeBandDecider.bringToFront();
  return initiativeBandDecider;
}

export function registerInitiativeBandDecider() {
  game.veilrunner = {
    ...(game.veilrunner ?? {}),
    openInitiativeBandDecider,
    refreshInitiativeTrackerControls
  };

  Hooks.on("renderSettingsConfig", (_app, html) => {
    if (!game.user.isGM) return;
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelector || root.querySelector("[data-action='open-initiative-band-decider']")) return;

    const anchor = root.querySelector(`[name="${game.system.id}.${VEILRUNNER_SETTINGS.initiativeMode}"]`)?.closest(".form-group, fieldset")
      ?? root.querySelector(`[name="${game.system.id}.${VEILRUNNER_SETTINGS.initiativeBands}"]`)?.closest(".form-group, fieldset")
      ?? root.querySelector(`[name="${game.system.id}.${VEILRUNNER_SETTINGS.defaultQuestObjectiveVisibility}"]`)?.closest(".form-group, fieldset");
    if (!anchor?.parentElement) return;

    const field = document.createElement("div");
    field.className = "form-group";
    field.innerHTML = `
      <label>${game.i18n.localize("VEILRUNNER.InitiativeBands.SettingsButton.Name")}</label>
      <div class="form-fields">
        <button type="button" data-action="open-initiative-band-decider">
          <i class="fa-solid fa-layer-group"></i>
          ${game.i18n.localize("VEILRUNNER.InitiativeBands.SettingsButton.Label")}
        </button>
      </div>
      <p class="hint">${game.i18n.localize("VEILRUNNER.InitiativeBands.SettingsButton.Hint")}</p>
    `;
    field.querySelector("button")?.addEventListener("click", event => {
      event.preventDefault();
      openInitiativeBandDecider();
    });
    anchor.parentElement.insertBefore(field, anchor.nextSibling);
  });

  Hooks.on("renderCombatTracker", injectCombatTrackerControls);
  Hooks.on("renderCombat", injectCombatTrackerControls);
  window.addEventListener("pointermove", event => {
    if (!initiativeBandPanelDrag) return;
    const left = event.clientX - initiativeBandPanelDrag.offsetX;
    const top = event.clientY - initiativeBandPanelDrag.offsetY;
    applyInitiativeBandPanelPosition(initiativeBandPanelDrag.panel, { left, top });
  });
  window.addEventListener("pointerup", event => {
    if (!initiativeBandPanelDrag || event.pointerId !== initiativeBandPanelDrag.pointerId) return;
    finishInitiativeBandPanelDrag();
  });
  window.addEventListener("pointercancel", event => {
    if (!initiativeBandPanelDrag || event.pointerId !== initiativeBandPanelDrag.pointerId) return;
    finishInitiativeBandPanelDrag();
  });
}

function refreshInitiativeTrackerControls() {
  const roots = new Set([
    ui.combat?.element?.[0],
    ui.combat?.element,
    ui.sidebar?.tabs?.combat?.element?.[0],
    ui.sidebar?.tabs?.combat?.element,
    document.querySelector("#combat"),
    document.querySelector("#combat-tracker"),
    document.querySelector("[data-tab='combat']")
  ].filter(root => root instanceof HTMLElement));

  const root = Array.from(roots).find(element => element.querySelector("ol.combatants, .combat-tracker, #combat-tracker, .directory-list"))
    ?? roots.values().next().value;
  if (root) injectCombatTrackerControls(null, root);
}

function injectCombatTrackerControls(_app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root?.querySelector) return;
  document.querySelectorAll(".vr-combat-initiative-bands.embedded, .vr-combat-phase-controls, .vr-initiative-block-heading").forEach(element => element.remove());
  document.querySelectorAll(".vr-initiative-block-member").forEach(element => {
    element.classList.remove("vr-initiative-block-member");
    delete element.dataset.vrInitiativeBlockTeam;
  });

  const mode = getInitiativeMode();
  if (mode === "block") {
    injectBlockInitiativeControls(root);
    return;
  }
  if (mode !== "phases") return;

  injectEmbeddedInitiativeBandPanel(root);
  injectPhaseTurnControls(root);
  if (getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeBandsPanelEnabled)) injectFloatingInitiativeBandPanel();
}

function initiativeBandListHtml() {
  return `
    <div class="vr-combat-initiative-band-list">
      ${getInitiativeBandReferenceBands().map(band => `
        <div class="vr-combat-initiative-band">
          <span>${escape(band.name)}</span>
          <strong>${escape(band.range)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function injectEmbeddedInitiativeBandPanel(root) {
  const panel = document.createElement("section");
  panel.className = "veilrunner vr-combat-initiative-bands embedded";
  panel.innerHTML = `
    <header>
      <span><i class="fa-solid fa-layer-group"></i> ${game.i18n.localize("VEILRUNNER.InitiativeBands.CombatTitle")}</span>
      <div class="vr-combat-initiative-band-actions">
        <button type="button" data-action="float-initiative-bands" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.FloatPanel")}">
          <i class="fa-solid fa-up-right-from-square"></i>
        </button>
        <button type="button" data-action="open-initiative-band-decider" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.SettingsButton.Label")}">
          <i class="fa-solid fa-sliders"></i>
        </button>
      </div>
    </header>
    ${initiativeBandListHtml()}
  `;
  panel.querySelector("[data-action='open-initiative-band-decider']")?.addEventListener("click", event => {
    event.preventDefault();
    openInitiativeBandDecider();
  });
  panel.querySelector("[data-action='float-initiative-bands']")?.addEventListener("click", async event => {
    event.preventDefault();
    await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.initiativeBandsPanelEnabled, true);
  });

  const combatantList = root.matches("ol.combatants, .directory-list")
    ? root
    : root.querySelector("ol.combatants, .directory-list");
  if (combatantList?.parentElement) {
    combatantList.before(panel);
    return;
  }

  const target = root.matches(".combat-tracker, #combat-tracker")
    ? root
    : root.querySelector(".combat-tracker, #combat-tracker, .window-content") ?? root;
  target.prepend(panel);
}

function injectPhaseTurnControls(root) {
  const panel = document.createElement("nav");
  panel.className = "veilrunner vr-combat-phase-controls";
  panel.setAttribute("aria-label", "Initiative band navigation");
  panel.innerHTML = `
    <button type="button" data-vr-combat-action="previous-round" title="Previous Round" aria-label="Previous Round"><i class="fa-solid fa-backward-fast"></i></button>
    <button type="button" data-vr-combat-action="previous-phase" title="Previous Phase" aria-label="Previous Phase"><i class="fa-solid fa-backward-step"></i></button>
    <button type="button" data-vr-combat-action="previous-turn" title="Previous Turn" aria-label="Previous Turn"><i class="fa-solid fa-chevron-left"></i></button>
    <button type="button" data-vr-combat-action="next-turn" title="Next Turn" aria-label="Next Turn"><i class="fa-solid fa-chevron-right"></i></button>
    <button type="button" data-vr-combat-action="next-phase" title="Next Phase" aria-label="Next Phase"><i class="fa-solid fa-forward-step"></i></button>
    <button type="button" data-vr-combat-action="next-round" title="Next Round" aria-label="Next Round"><i class="fa-solid fa-forward-fast"></i></button>
  `;

  const navigation = {
    "previous-round": () => game.veilrunner?.moveCombatRound?.(-1),
    "next-round": () => game.veilrunner?.moveCombatRound?.(1),
    "previous-phase": () => game.veilrunner?.moveCombatPhase?.(-1),
    "next-phase": () => game.veilrunner?.moveCombatPhase?.(1),
    "previous-turn": () => game.veilrunner?.moveCombatTurn?.(-1),
    "next-turn": () => game.veilrunner?.moveCombatTurn?.(1)
  };
  panel.addEventListener("click", async event => {
    const button = event.target.closest("button[data-vr-combat-action]");
    const action = button?.dataset.vrCombatAction;
    if (!action || !navigation[action]) return;
    event.preventDefault();
    button.disabled = true;
    try {
      await navigation[action]();
    } finally {
      button.disabled = false;
    }
  });

  const bandPanel = root.querySelector(".vr-combat-initiative-bands.embedded");
  if (bandPanel?.parentElement) {
    bandPanel.after(panel);
    return;
  }
  const target = root.matches(".combat-tracker, #combat-tracker")
    ? root
    : root.querySelector(".combat-tracker, #combat-tracker, .window-content") ?? root;
  target.prepend(panel);
}

function injectFloatingInitiativeBandPanel() {
  document.querySelectorAll("body > .vr-combat-initiative-bands.floating").forEach(element => element.remove());
  const panel = document.createElement("section");
  const locked = Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeBandsPanelLocked));
  panel.className = `veilrunner vr-combat-initiative-bands floating${locked ? " locked" : ""}`;
  applyInitiativeBandPanelPosition(panel, getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeBandsPanelPosition));
  panel.innerHTML = `
    <header>
      <button type="button" class="vr-combat-initiative-band-drag" data-action="drag-initiative-bands" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.Drag")}" ${locked ? "disabled" : ""}>
        <i class="fa-solid fa-grip-lines"></i>
      </button>
      <span><i class="fa-solid fa-layer-group"></i> ${game.i18n.localize("VEILRUNNER.InitiativeBands.CombatTitle")}</span>
      <div class="vr-combat-initiative-band-actions">
        <button type="button" data-action="toggle-initiative-bands-lock" title="${game.i18n.localize(locked ? "VEILRUNNER.InitiativeBands.Unlock" : "VEILRUNNER.InitiativeBands.Lock")}">
          <i class="fa-solid ${locked ? "fa-lock" : "fa-lock-open"}"></i>
        </button>
        <button type="button" data-action="open-initiative-band-decider" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.SettingsButton.Label")}">
          <i class="fa-solid fa-sliders"></i>
        </button>
        <button type="button" data-action="close-initiative-bands" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.ClosePanel")}">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </header>
    ${initiativeBandListHtml()}
  `;
  activateInitiativeBandPanel(panel, locked);
  document.body.append(panel);
}

function defaultInitiativeBandPanelPosition() {
  return { left: Math.max(12, window.innerWidth - 290), top: 116 };
}

function normalizeInitiativeBandPanelPosition(position) {
  const fallback = defaultInitiativeBandPanelPosition();
  const left = Number(position?.left);
  const top = Number(position?.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, Math.min(window.innerWidth - 40, left)) : fallback.left,
    top: Number.isFinite(top) ? Math.max(0, Math.min(window.innerHeight - 40, top)) : fallback.top
  };
}

function applyInitiativeBandPanelPosition(panel, position) {
  const normalized = normalizeInitiativeBandPanelPosition(position);
  panel.style.left = `${normalized.left}px`;
  panel.style.top = `${normalized.top}px`;
}

function activateInitiativeBandPanel(panel, locked) {
  panel.querySelector("[data-action='open-initiative-band-decider']")?.addEventListener("click", event => {
    event.preventDefault();
    openInitiativeBandDecider();
  });
  panel.querySelector("[data-action='toggle-initiative-bands-lock']")?.addEventListener("click", async event => {
    event.preventDefault();
    await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.initiativeBandsPanelLocked, !locked);
  });
  panel.querySelector("[data-action='close-initiative-bands']")?.addEventListener("click", async event => {
    event.preventDefault();
    document.querySelectorAll("body > .vr-combat-initiative-bands.floating").forEach(element => element.remove());
    await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.initiativeBandsPanelEnabled, false);
  });
  const handle = panel.querySelector("[data-action='drag-initiative-bands']");
  handle?.addEventListener("pointerdown", event => {
    if (locked) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    initiativeBandPanelDrag = {
      panel,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    handle.setPointerCapture?.(event.pointerId);
    panel.classList.add("dragging");
  });
}

async function finishInitiativeBandPanelDrag() {
  if (!initiativeBandPanelDrag) return;
  const panel = initiativeBandPanelDrag.panel;
  panel.classList.remove("dragging");
  const rect = panel.getBoundingClientRect();
  initiativeBandPanelDrag = null;
  await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.initiativeBandsPanelPosition, {
    left: Math.round(rect.left),
    top: Math.round(rect.top)
  });
}

function injectBlockInitiativeControls(root) {
  const rows = Array.from(root.querySelectorAll("li.combatant[data-combatant-id]"));
  let previousTeamId;

  for (const row of rows) {
    const combatant = game.combat?.combatants?.get(row.dataset.combatantId);
    const team = getCombatantTeam(combatant);
    row.classList.add("vr-initiative-block-member");
    row.dataset.vrInitiativeBlockTeam = team.id;

    if (team.id === previousTeamId) continue;
    const heading = document.createElement("li");
    heading.className = "vr-initiative-block-heading";
    heading.dataset.vrInitiativeBlockTeam = team.id;
    heading.innerHTML = `<i class="fa-solid fa-users"></i><span>${escape(game.i18n.localize(team.label))}</span>`;
    row.before(heading);
    previousTeamId = team.id;
  }
}

class InitiativeBandDecider {
  constructor() {
    this.bands = getInitiativeBands();
    this.position = { x: Math.max(20, Math.round((window.innerWidth - 560) / 2)), y: Math.max(20, Math.round((window.innerHeight - 560) / 2)) };
    this.root = document.createElement("section");
    this.root.className = "veilrunner vr-initiative-band-decider";
    this.root.tabIndex = -1;
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
    this.root.remove();
    initiativeBandDecider = null;
  }

  #applyPosition() {
    this.root.style.left = `${this.position.x}px`;
    this.root.style.top = `${this.position.y}px`;
  }

  #draw() {
    const bands = normalizeBands(this.bands);
    this.bands = bands;
    const recommendation = getPhaseRecommendation();
    const rows = bands.map((band, index) => `
      <div class="vr-initiative-band-row" data-band-index="${index}">
        <span class="vr-initiative-band-order">${index + 1}</span>
        <label>
          <span>${game.i18n.localize("VEILRUNNER.InitiativeBands.Name")}</span>
          <input type="text" data-field="name" value="${escape(band.name)}" />
        </label>
        <label>
          <span>${index === bands.length - 1 ? game.i18n.localize("VEILRUNNER.InitiativeBands.Lowest") : game.i18n.localize("VEILRUNNER.InitiativeBands.Minimum")}</span>
          <input type="number" data-field="minimum" value="${band.minimum ?? ""}" ${index === bands.length - 1 ? "disabled" : ""} />
        </label>
        <strong>${escape(initiativeBandRange(band, index, bands))}</strong>
      </div>
    `).join("");

    this.root.innerHTML = `
      <header class="vr-initiative-band-header">
        <div>
          <h2>${game.i18n.localize("VEILRUNNER.InitiativeBands.Title")}</h2>
          <p>${game.i18n.localize("VEILRUNNER.InitiativeBands.Subtitle")}</p>
        </div>
        <button type="button" data-action="close" title="${game.i18n.localize("VEILRUNNER.Close")}"><i class="fa-solid fa-xmark"></i></button>
      </header>
      <div class="vr-initiative-band-tools">
        <label>
          <span>${game.i18n.localize("VEILRUNNER.InitiativeBands.PhaseCount")}</span>
          <input type="number" data-action="set-phase-count" min="1" value="${bands.length}" />
        </label>
        ${recommendation ? `
          <div class="vr-initiative-band-recommendation">
            <span>${game.i18n.format("VEILRUNNER.InitiativeBands.Recommendation", recommendation)}</span>
            <small>${game.i18n.format("VEILRUNNER.InitiativeBands.RecommendationDetail", recommendation)}</small>
            <button type="button" data-action="apply-recommendation" title="${game.i18n.localize("VEILRUNNER.InitiativeBands.ApplyRecommendation")}">
              <i class="fa-solid fa-wand-magic-sparkles"></i>
              ${game.i18n.localize("VEILRUNNER.InitiativeBands.ApplyRecommendation")}
            </button>
          </div>
        ` : `<span class="vr-initiative-band-no-recommendation">${game.i18n.localize("VEILRUNNER.InitiativeBands.NoActiveCombat")}</span>`}
        <button type="button" data-action="reset"><i class="fa-solid fa-rotate-left"></i> ${game.i18n.localize("VEILRUNNER.Reset")}</button>
      </div>
      <div class="vr-initiative-band-list">${rows}</div>
      <div class="vr-initiative-band-preview">
        <h3>${game.i18n.localize("VEILRUNNER.InitiativeBands.Preview")}</h3>
        ${bands.map((band, index) => `<div><span>${escape(band.name)}</span><strong>${escape(initiativeBandRange(band, index, bands))}</strong></div>`).join("")}
      </div>
      <footer>
        <button type="button" data-action="save"><i class="fa-solid fa-floppy-disk"></i> ${game.i18n.localize("VEILRUNNER.Save")}</button>
      </footer>
    `;

    this.#activateListeners();
  }

  #activateListeners() {
    this.root.querySelector("[data-action='close']")?.addEventListener("click", () => this.close());
    this.root.querySelector("[data-action='reset']")?.addEventListener("click", () => {
      this.bands = foundry.utils.deepClone(DEFAULT_BANDS);
      this.#draw();
    });
    this.root.querySelector("[data-action='save']")?.addEventListener("click", () => this.#save());
    this.root.querySelector("[data-action='apply-recommendation']")?.addEventListener("click", () => {
      const recommendation = getPhaseRecommendation();
      if (!recommendation) return;
      this.#readForm();
      this.bands = bandsForCount(this.bands, recommendation.phases);
      this.#draw();
    });
    this.root.querySelector("[data-action='set-phase-count']")?.addEventListener("change", event => {
      this.#readForm();
      this.bands = bandsForCount(this.bands, clampPhaseCount(event.currentTarget.value));
      this.#draw();
    });
    this.root.querySelectorAll("[data-field]").forEach(input => {
      input.addEventListener("change", () => {
        this.#readForm();
        this.#draw();
      });
    });
  }

  #readForm() {
    this.bands = Array.from(this.root.querySelectorAll(".vr-initiative-band-row")).map(row => {
      const name = row.querySelector("[data-field='name']")?.value;
      const minimumInput = row.querySelector("[data-field='minimum']");
      return {
        name,
        minimum: minimumInput?.disabled ? null : minimumInput?.value
      };
    });
  }

  async #save() {
    this.#readForm();
    const bands = normalizeBands(this.bands);
    await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.initiativeBands, { bands });
    ui.notifications.info(game.i18n.localize("VEILRUNNER.InitiativeBands.Saved"));
    refreshVeilrunnerCombatUi();
    for (const app of Object.values(ui.windows ?? {})) {
      if (app?.actor?.type === "hero") app.render(false);
    }
    this.bands = bands;
    this.#draw();
  }
}
