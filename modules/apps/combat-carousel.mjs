import { getCombatantTeam, getInitiativeBands, getInitiativeMode, initiativeBandRange } from "./initiative-band-decider.mjs";
import { VEILRUNNER_SETTINGS, getVeilrunnerSetting } from "../settings.mjs";

const RESOURCE_KEYS = [
  { key: "health", label: "VEILRUNNER.Health", color: "var(--vr-red)" },
  { key: "armor", label: "VEILRUNNER.Armor", color: "var(--vr-amber)" },
  { key: "barriers", label: "VEILRUNNER.Barriers", color: "var(--vr-accent)" },
  { key: "shields", label: "VEILRUNNER.Shields", color: "var(--vr-cyan)" }
];

const PORTRAIT_SIZES = {
  small: 48,
  medium: 64,
  large: 80,
  xl: 96,
  xxl: 112
};

const BAR_VISIBILITY_MODES = new Set(["hover", "always", "off"]);
const PHASE_TURN_MARKER_PROPERTY = "_veilrunnerPhaseTurnMarker";

let dragState = null;
let phaseTurnMarkerRetryPending = false;
let previousPhaseTransition = null;

const PHASE_VIEW_MODES = new Set(["all", "active", "hybrid"]);

function escape(value) {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function initiativeValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function poolFor(actor, key) {
  const resources = actor?.system?.resources ?? {};
  if (key === "shields") return resources.shields ?? resources.shield;
  return resources[key];
}

function poolPercent(actor, key, pool) {
  const percent = actor?.system?.percent?.[key];
  if (Number.isFinite(Number(percent))) return clamp(percent, 0, 100);

  const max = Number(pool?.max) || 0;
  if (max <= 0) return 0;
  return clamp(Math.round(((Number(pool?.value) || 0) / max) * 100), 0, 100);
}

function canSeeNumbers(actor) {
  if (game.user.isGM) return true;
  if (actor?.isOwner) return true;
  return Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselRevealPlayerNumbers));
}

function dyingValue(actor) {
  return clamp(actor?.system?.resources?.dying?.value, 0, 3);
}

function woundedValue(actor) {
  return Math.max(0, Number(actor?.system?.resources?.wounded?.value) || 0);
}

function isDeadCombatant(combatant) {
  const actor = combatant?.actor;
  const defeatedStatus = CONFIG.specialStatusEffects?.DEFEATED;
  const health = poolFor(actor, "health");
  const hasNoHealth = Number(health?.max) > 0 && Number(health?.value) <= 0;
  return Boolean(combatant?.defeated || (defeatedStatus && actor?.statuses?.has?.(defeatedStatus)) || (hasNoHealth && dyingValue(actor) === 0 && woundedValue(actor) === 0));
}

function renderDyingIndicator(actor, dead) {
  const value = dyingValue(actor);
  if (dead || value <= 0) return "";
  const label = game.i18n.localize("VEILRUNNER.Dying");
  const pips = Array.from({ length: 3 }, (_, index) => `<i class="fa-solid fa-skull${index < value ? " active" : ""}"></i>`).join("");
  return `<span class="vr-combat-carousel-dying-indicator" title="${escape(`${label}: ${value}`)}" aria-label="${escape(`${label}: ${value}`)}">${pips}</span>`;
}

function renderWoundedIndicator(actor, dead) {
  if (dead) return "";
  const value = woundedValue(actor);
  if (value <= 0) return "";
  const label = game.i18n.localize("VEILRUNNER.CombatCarousel.Wounded");
  return `<span class="vr-combat-carousel-wounded-indicator" title="${escape(`${label}: ${value}`)}" aria-label="${escape(`${label}: ${value}`)}"><i class="fa-solid fa-heart-pulse"></i><strong>${escape(value)}</strong></span>`;
}

function combatantsForCarousel(settings = {}) {
  const combatants = Array.isArray(game.combat?.turns)
    ? game.combat.turns.filter(combatant => combatant.actor)
    : Array.from(game.combat?.combatants ?? []).filter(combatant => combatant.actor);
  return settings.hideDead ? combatants.filter(combatant => !isDeadCombatant(combatant)) : combatants;
}

function portraitSizeSetting() {
  const value = getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselPortraitSize);
  if (PORTRAIT_SIZES[value]) return { key: value, pixels: PORTRAIT_SIZES[value] };

  const legacyPixels = Number(value);
  if (Number.isFinite(legacyPixels)) {
    const nearest = Object.entries(PORTRAIT_SIZES)
      .sort(([, a], [, b]) => Math.abs(a - legacyPixels) - Math.abs(b - legacyPixels))[0];
    return { key: nearest?.[0] ?? "medium", pixels: nearest?.[1] ?? PORTRAIT_SIZES.medium };
  }

  return { key: "medium", pixels: PORTRAIT_SIZES.medium };
}

function phaseViewSetting() {
  const value = getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselActivePhaseOnly);
  // Preserve the active-only behavior for clients that stored the former Boolean setting.
  if (value === true || value === "true") return "active";
  return PHASE_VIEW_MODES.has(value) ? value : "all";
}

function carouselSettings() {
  const portraitSize = portraitSizeSetting();
  const legacyShowBars = getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselShowResourceBars);
  const preferredBarVisibility = getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselResourceBarVisibility)
    ?? (legacyShowBars === false ? "off" : "always");
  const barVisibility = BAR_VISIBILITY_MODES.has(preferredBarVisibility) ? preferredBarVisibility : "always";
  const barsGmOnly = Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselResourceBarsGmOnly));
  const canShowBars = !barsGmOnly || game.user.isGM;

  return {
    enabled: Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselEnabled)),
    portraitShape: getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselPortraitShape) ?? "circle",
    portraitSize: portraitSize.pixels,
    portraitSizeKey: portraitSize.key,
    textSize: settingNumber(VEILRUNNER_SETTINGS.combatCarouselTextSize, 10, 18),
    locked: Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselLocked)),
    phaseView: phaseViewSetting(),
    compact: game.user.isGM && Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselGmCompact)),
    hideDead: Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselHideDead)),
    showNumbers: Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselShowResourceNumbers)),
    barVisibility: canShowBars ? barVisibility : "off",
    showBars: canShowBars && barVisibility !== "off"
  };
}

function settingNumber(key, min, max) {
  return clamp(getVeilrunnerSetting(key), min, max);
}

function renderResource(actor, resource, settings) {
  const pool = poolFor(actor, resource.key);
  const value = Number(pool?.value) || 0;
  const max = Number(pool?.max) || 0;
  if (value === 0 && max === 0) return "";
  if (!settings.showBars) return "";

  const percent = poolPercent(actor, resource.key, pool);
  const showNumbers = settings.showNumbers && canSeeNumbers(actor);

  const label = game.i18n.localize(resource.label);
  const title = showNumbers
    ? `${label}: ${value} / ${max}`
    : `${label}: ${game.i18n.localize("VEILRUNNER.CombatCarousel.PanLocked")}`;

  return `
    <div class="vr-combat-carousel-resource" data-resource="${resource.key}" title="${escape(title)}" style="--vr-carousel-resource-color: ${resource.color};">
      ${settings.showBars ? `<span class="vr-combat-carousel-resource-fill" style="width: ${percent}%"></span>` : ""}
      ${showNumbers ? `<span class="vr-combat-carousel-resource-number">${escape(value)} / ${escape(max)}</span>` : ""}
    </div>
  `;
}

function renderCombatant(combatant, settings, { phaseActive = false } = {}) {
  const actor = combatant.actor;
  const active = game.combat?.combatant?.id === combatant.id;
  const dead = isDeadCombatant(combatant);
  const deadLabel = game.i18n.localize("VEILRUNNER.CombatCarousel.Defeated");
  const dyingIndicator = renderDyingIndicator(actor, dead);
  const woundedIndicator = renderWoundedIndicator(actor, dead);
  const img = combatant.img || actor.system?.portraitImage || actor.system?.appearanceImage || actor.img || "icons/svg/mystery-man.svg";
  const initiative = initiativeValue(combatant.initiative) ?? "--";
  const resources = RESOURCE_KEYS.map(resource => renderResource(actor, resource, settings)).join("");

  return `
    <article class="vr-combat-carousel-card${phaseActive ? " phase-active" : ""}${active ? " active" : ""}${dead ? " dead" : ""}" data-combatant-id="${escape(combatant.id)}">
      <div class="vr-combat-carousel-portrait-frame">
        <img class="vr-combat-carousel-portrait" src="${escape(img)}" alt="${escape(combatant.name)}" />
        ${dead ? `<span class="vr-combat-carousel-dead-indicator" title="${escape(deadLabel)}" aria-label="${escape(deadLabel)}"><i class="fa-solid fa-skull"></i></span>` : ""}
        ${woundedIndicator}
        ${dyingIndicator}
        <header class="vr-combat-carousel-heading">
          <strong>${escape(combatant.name)}</strong>
        </header>
        <span class="vr-combat-carousel-initiative">${escape(initiative)}</span>
      </div>
      ${resources ? `<div class="vr-combat-carousel-resources">${resources}</div>` : ""}
    </article>
  `;
}

function phaseIdentifier(combatant, bands) {
  if (!game.user.isGM) return null;
  const index = initiativeBandIndex(combatant?.initiative, bands);
  const band = bands[index] ?? bands[bands.length - 1];
  if (!band) return null;
  return {
    id: `phase-${index}`,
    type: "phase",
    label: index + 1,
    detail: initiativeBandRange(band, index, bands)
  };
}

function blockIdentifier(combatant) {
  const team = getCombatantTeam(combatant);
  return {
    id: `block-${team.id}`,
    type: "block",
    label: game.i18n.localize(team.label),
    detail: ""
  };
}

function phaseSideIdentifier(combatant) {
  const disposition = combatant?.token?.disposition ?? combatant?.actor?.prototypeToken?.disposition;
  const dispositionNumber = Number(disposition);
  const hasDisposition = disposition !== undefined && disposition !== null && Number.isFinite(dispositionNumber);
  const isPlayerSide = hasDisposition ? dispositionNumber === 1 : Boolean(combatant?.actor?.hasPlayerOwner);
  const key = isPlayerSide ? "players" : "enemies";
  const labelKey = {
    players: "VEILRUNNER.CombatCarousel.PlayerTurn",
    enemies: "VEILRUNNER.CombatCarousel.HostileTurn"
  }[key];
  return {
    id: `side-${key}`,
    key,
    label: game.i18n.localize(labelKey)
  };
}

function shouldUseNeutralPhase(combatant) {
  return Boolean(getVeilrunnerSetting(VEILRUNNER_SETTINGS.initiativeNeutralPhaseEnabled))
    && initiativeValue(combatant?.initiative) === null;
}

function combatantIdentifier(combatant, mode, bands) {
  if (mode === "phases") return phaseIdentifier(combatant, bands);
  if (mode === "block") return blockIdentifier(combatant);
  return null;
}

function renderIdentifier(identifier) {
  if (!identifier) return "";
  const label = identifier.type === "phase"
    ? game.i18n.format("VEILRUNNER.CombatCarousel.PhaseLabel", { number: identifier.label })
    : identifier.label;
  return `
    <div class="vr-combat-carousel-identifier type-${escape(identifier.type ?? "block")}" data-identifier-id="${escape(identifier.id)}">
      <strong>${escape(label)}</strong>
      ${identifier.detail ? `<span>${escape(identifier.detail)}</span>` : ""}
    </div>
  `;
}

function renderSideBreak(identifier) {
  return `
    <div class="vr-combat-carousel-side-break" data-side-id="${escape(identifier.id)}">
      <span>${escape(identifier.label)}</span>
    </div>
  `;
}

function groupPhaseCombatants(combatants, bands) {
  const phaseGroups = [];
  const byPhase = new Map();
  const neutral = [];

  for (const combatant of combatants) {
    if (shouldUseNeutralPhase(combatant)) {
      neutral.push(combatant);
      continue;
    }

    const phaseIndex = initiativeBandIndex(combatant?.initiative, bands);
    if (!byPhase.has(phaseIndex)) {
      const band = bands[phaseIndex] ?? bands[bands.length - 1];
      const group = {
        phaseIndex,
        identifier: band
          ? {
            id: `phase-${phaseIndex}`,
            type: "phase",
            label: phaseIndex + 1,
            detail: initiativeBandRange(band, phaseIndex, bands)
          }
          : null,
        players: [],
        enemies: []
      };
      byPhase.set(phaseIndex, group);
      phaseGroups.push(group);
    }

    const side = phaseSideIdentifier(combatant);
    byPhase.get(phaseIndex)[side.key].push(combatant);
  }

  for (const group of phaseGroups) {
    group.players.sort(compareInitiativeDescending);
    group.enemies.sort(compareInitiativeDescending);
  }

  if (neutral.length) {
    phaseGroups.push({
      phaseIndex: "neutral",
      identifier: null,
      players: [],
      enemies: [],
      neutral
    });
  }

  return phaseGroups;
}

function compareInitiativeDescending(left, right) {
  const difference = (initiativeValue(right?.initiative) ?? -Infinity) - (initiativeValue(left?.initiative) ?? -Infinity);
  if (difference !== 0) return difference;
  return 0;
}

function phaseSidesInTurnOrder(group) {
  const playerHighest = initiativeValue(group.players[0]?.initiative);
  const enemyHighest = initiativeValue(group.enemies[0]?.initiative);
  const playersHaveInitiative = playerHighest !== null;
  const enemiesHaveInitiative = enemyHighest !== null;

  if (!playersHaveInitiative) return ["enemies", "players"];
  if (!enemiesHaveInitiative) return ["players", "enemies"];
  return playerHighest >= enemyHighest ? ["players", "enemies"] : ["enemies", "players"];
}

function phaseTurnGroups(combatants, bands) {
  const groupedTurns = [];
  for (const group of groupPhaseCombatants(combatants, bands)) {
    for (const side of phaseSidesInTurnOrder(group)) {
      if (group[side].length) groupedTurns.push({ phaseIndex: group.phaseIndex, side, combatants: group[side] });
    }
    if (group.neutral?.length) groupedTurns.push({ phaseIndex: group.phaseIndex, side: "neutral", combatants: group.neutral });
  }
  return groupedTurns;
}

function activePhaseCombatants() {
  const combat = game.combat;
  const active = combat?.combatant;
  const turns = combat?.turns ?? [];
  if (!active || !turns.length || getInitiativeMode() !== "phases") return active ? [active] : [];

  if (shouldUseNeutralPhase(active)) return turns.filter(shouldUseNeutralPhase);

  const bands = getInitiativeBands();
  const phase = initiativeBandIndex(active.initiative, bands);
  const side = phaseSideIdentifier(active).key;
  return turns.filter(combatant => {
    if (shouldUseNeutralPhase(combatant)) return false;
    return initiativeBandIndex(combatant.initiative, bands) === phase
      && phaseSideIdentifier(combatant).key === side;
  });
}

function activePhaseTurnSide() {
  const active = game.combat?.combatant;
  if (!active || getInitiativeMode() !== "phases") return "";
  return shouldUseNeutralPhase(active) ? "neutral" : phaseSideIdentifier(active).key;
}

/** Keep Foundry's combat tracker in sync with the simultaneous phase turn. */
function refreshPhaseTurnTrackerHighlights(_app, html) {
  const root = html instanceof HTMLElement ? html : html?.[0] ?? document;
  const phaseMode = getInitiativeMode() === "phases";
  const activeIds = phaseMode ? new Set(activePhaseCombatants().map(combatant => combatant.id)) : new Set();
  const side = phaseMode ? activePhaseTurnSide() : "";
  const rows = root.querySelectorAll?.("li.combatant[data-combatant-id]") ?? [];

  for (const row of rows) {
    const isPhaseActive = activeIds.has(row.dataset.combatantId);
    row.classList.toggle("vr-phase-turn-active", isPhaseActive);
    if (isPhaseActive) row.dataset.vrPhaseTurn = side;
    else delete row.dataset.vrPhaseTurn;
  }
}

function clearPhaseTurnMarker(token) {
  const phaseMarker = token?.[PHASE_TURN_MARKER_PROPERTY];
  if (!phaseMarker) return;
  canvas?.app?.ticker?.remove(phaseMarker.sync);
  phaseMarker.sprite.parent?.removeChild(phaseMarker.sprite);
  phaseMarker.sprite.destroy({ children: true });
  delete token[PHASE_TURN_MARKER_PROPERTY];
}

function tokenCenter(token) {
  return token?.getCenterPoint?.() ?? { x: token?.x ?? 0, y: token?.y ?? 0 };
}

function drawPhaseTurnMarker(token, activeToken) {
  const template = activeToken?.turnMarker;
  const templateMesh = template?.mesh;
  const markerLayer = template?.parent;
  if (!token || !markerLayer?.addChild || !templateMesh?.clone) return;

  clearPhaseTurnMarker(token);
  const sprite = templateMesh.clone();
  sprite.eventMode = "none";
  markerLayer.addChild(sprite);

  const sync = () => {
    if (sprite.destroyed || templateMesh.destroyed) return;
    const activeCenter = tokenCenter(activeToken);
    const targetCenter = tokenCenter(token);
    const templatePosition = templateMesh.getGlobalPosition?.() ?? template.getGlobalPosition?.() ?? template.position;
    const activePosition = canvas?.stage?.toGlobal?.(activeCenter) ?? activeCenter;
    const targetPosition = canvas?.stage?.toGlobal?.(targetCenter) ?? targetCenter;
    const targetMarkerPosition = {
      x: targetPosition.x + (templatePosition.x - activePosition.x),
      y: targetPosition.y + (templatePosition.y - activePosition.y)
    };
    const localPosition = markerLayer.toLocal?.(targetMarkerPosition) ?? targetMarkerPosition;
    sprite.position.copyFrom(localPosition);
    sprite.scale.copyFrom(templateMesh.scale);
    sprite.rotation = templateMesh.rotation;
    sprite.alpha = templateMesh.alpha;
  };

  token[PHASE_TURN_MARKER_PROPERTY] = { sprite, sync };
  sync();
  canvas?.app?.ticker?.add(sync);
}

function refreshPhaseTurnMarkers() {
  const tokens = canvas?.tokens?.placeables ?? [];
  for (const token of tokens) clearPhaseTurnMarker(token);

  const activeCombatant = game.combat?.combatant;
  const activeToken = activeCombatant?.token?.object ?? canvas?.tokens?.get(activeCombatant?.tokenId);
  if (!activeToken?.turnMarker) {
    if (!phaseTurnMarkerRetryPending) {
      phaseTurnMarkerRetryPending = true;
      window.requestAnimationFrame(() => {
        phaseTurnMarkerRetryPending = false;
        if (game.combat?.combatant?.token?.object?.turnMarker) refreshPhaseTurnMarkers();
      });
    }
    return;
  }

  for (const combatant of activePhaseCombatants()) {
    const token = combatant.token?.object ?? canvas?.tokens?.get(combatant.tokenId);
    if (!token || token.destroyed) continue;
    if (combatant.id === activeCombatant?.id) continue;
    drawPhaseTurnMarker(token, activeToken);
  }
}

function renderPhaseTracker(combatants, settings, bands) {
  const activeCombatantIds = new Set(activePhaseCombatants().map(combatant => combatant.id));
  const groups = groupPhaseCombatants(combatants, bands);
  const activeGroupIndex = groups.findIndex(group => group.players.concat(group.enemies, group.neutral ?? []).some(combatant => activeCombatantIds.has(combatant.id)));
  const visibleGroups = settings.phaseView === "all" || activeGroupIndex === -1
    ? groups
    : settings.phaseView === "hybrid"
      ? [groups[activeGroupIndex], groups[(activeGroupIndex + 1) % groups.length]].filter((group, index, selected) => group && selected.indexOf(group) === index)
      : [groups[activeGroupIndex]];
  return visibleGroups.map((group, groupIndex) => {
    const chunks = [];
    const phaseActive = group.players.concat(group.enemies, group.neutral ?? []).some(combatant => activeCombatantIds.has(combatant.id));
    if (game.user.isGM) chunks.push(renderIdentifier(group.identifier));
    for (const side of phaseSidesInTurnOrder(group)) {
      const combatantsForSide = group[side];
      if (!combatantsForSide.length) continue;
      const turnActive = combatantsForSide.some(combatant => activeCombatantIds.has(combatant.id));
      const sideBreak = renderSideBreak({
        id: `phase-${group.phaseIndex}-${side}`,
        label: game.i18n.localize(side === "players"
          ? "VEILRUNNER.CombatCarousel.PlayerTurn"
          : "VEILRUNNER.CombatCarousel.HostileTurn")
      });
      chunks.push(`<div class="vr-combat-carousel-phase-side side-${side}${turnActive ? " active-turn" : ""}">${sideBreak}${combatantsForSide.map(combatant => renderCombatant(combatant, settings, { phaseActive: turnActive })).join("")}</div>`);
    }
    if (group.neutral?.length) {
      const turnActive = group.neutral.some(combatant => activeCombatantIds.has(combatant.id));
      const sideBreak = renderSideBreak({
        id: "phase-neutral",
        label: game.i18n.localize("VEILRUNNER.CombatCarousel.NeutralTurn")
      });
      chunks.push(`<div class="vr-combat-carousel-phase-side side-neutral${turnActive ? " active-turn" : ""}">${sideBreak}${group.neutral.map(combatant => renderCombatant(combatant, settings, { phaseActive: turnActive })).join("")}</div>`);
    }
    const phaseClass = group.phaseIndex === "neutral" ? "neutral" : `band-${Number(group.phaseIndex) % 4}`;
    return `<section class="vr-combat-carousel-phase ${phaseClass}${phaseActive ? " active-phase" : ""}" data-phase-index="${escape(group.phaseIndex ?? groupIndex)}">${chunks.join("")}</section>`;
  }).join("");
}

function renderTracker(combatants, settings) {
  const mode = getInitiativeMode();
  const bands = mode === "phases" ? getInitiativeBands() : [];
  if (mode === "phases") return renderPhaseTracker(combatants, settings, bands);

  let previousIdentifierId = "";

  return combatants.map(combatant => {
    const identifier = combatantIdentifier(combatant, mode, bands);
    const heading = identifier?.id !== previousIdentifierId ? renderIdentifier(identifier) : "";
    previousIdentifierId = identifier?.id ?? "";
    return `${heading}${renderCombatant(combatant, settings)}`;
  }).join("");
}

function countIdentifiers(combatants) {
  const mode = getInitiativeMode();
  if (mode !== "phases" && mode !== "block") return 0;

  const bands = mode === "phases" ? getInitiativeBands() : [];
  if (mode === "phases") {
    return groupPhaseCombatants(combatants, bands).reduce((total, group) => {
      return total + (game.user.isGM && group.identifier ? 1 : 0) + (group.players.length ? 1 : 0) + (group.enemies.length ? 1 : 0) + (group.neutral?.length ? 1 : 0);
    }, 0);
  }

  let previousIdentifierId = "";
  let count = 0;
  for (const combatant of combatants) {
    const identifier = combatantIdentifier(combatant, mode, bands);
    if (identifier && identifier.id !== previousIdentifierId) count += 1;
    previousIdentifierId = identifier?.id ?? "";
  }
  return count;
}

function phaseTransitionState(combatants, settings) {
  if (settings.phaseView === "all" || getInitiativeMode() !== "phases") return null;
  const groups = groupPhaseCombatants(combatants, getInitiativeBands());
  const activeIds = new Set(activePhaseCombatants().map(combatant => combatant.id));
  const index = groups.findIndex(group => group.players.concat(group.enemies, group.neutral ?? []).some(combatant => activeIds.has(combatant.id)));
  return index === -1 ? null : { index, count: groups.length };
}

function phaseSlideDirection(previous, current) {
  if (current.index === previous.index + 1 || (previous.index === previous.count - 1 && current.index === 0)) return "forward";
  return "backward";
}

function removeCarouselAfterTransition(root) {
  root.addEventListener("animationend", () => root.remove(), { once: true });
  window.setTimeout(() => root.remove(), 300);
}

function finishCarouselEntrance(root) {
  root.addEventListener("animationend", () => {
    root.classList.remove("phase-transition-in", "phase-slide-forward", "phase-slide-backward");
  }, { once: true });
}

function combatControlButton(action, icon, labelKey) {
  const label = game.i18n.localize(labelKey);
  return `
    <button type="button" data-action="${action}" title="${escape(label)}" aria-label="${escape(label)}">
      <i class="${icon}"></i>
    </button>
  `;
}

function renderControls(direction) {
  if (!game.user.isGM) return "";
  const last = direction === "previous";
  const phaseButtons = getInitiativeMode() === "phases"
    ? combatControlButton(last ? "last-phase" : "next-phase", last ? "fa-solid fa-backward-step" : "fa-solid fa-forward-step", last ? "VEILRUNNER.CombatCarousel.Controls.LastPhase" : "VEILRUNNER.CombatCarousel.Controls.NextPhase")
    : "";

  return `
    <div class="vr-combat-carousel-controls ${direction}">
      ${combatControlButton(last ? "last-round" : "next-round", last ? "fa-solid fa-backward-fast" : "fa-solid fa-forward-fast", last ? "VEILRUNNER.CombatCarousel.Controls.LastRound" : "VEILRUNNER.CombatCarousel.Controls.NextRound")}
      ${phaseButtons}
      ${combatControlButton(last ? "last-turn" : "next-turn", last ? "fa-solid fa-chevron-left" : "fa-solid fa-chevron-right", last ? "VEILRUNNER.CombatCarousel.Controls.LastTurn" : "VEILRUNNER.CombatCarousel.Controls.NextTurn")}
    </div>
  `;
}

function renderDragControls(settings) {
  const lockLabel = game.i18n.localize(settings.locked ? "VEILRUNNER.CombatCarousel.Controls.Unlock" : "VEILRUNNER.CombatCarousel.Controls.Lock");
  const dragLabel = game.i18n.localize("VEILRUNNER.CombatCarousel.Controls.Drag");
  const settingsLabel = game.i18n.localize("VEILRUNNER.CombatCarousel.Controls.Settings");
  return `
    <div class="vr-combat-carousel-dragbar">
      <button type="button" class="vr-combat-carousel-drag-handle" data-action="drag-carousel" title="${escape(dragLabel)}" aria-label="${escape(dragLabel)}" ${settings.locked ? "disabled" : ""}>
        <i class="fa-solid fa-grip-lines"></i>
      </button>
      <button type="button" data-action="toggle-lock" title="${escape(lockLabel)}" aria-label="${escape(lockLabel)}">
        <i class="fa-solid ${settings.locked ? "fa-lock" : "fa-lock-open"}"></i>
      </button>
      <button type="button" data-action="open-settings" title="${escape(settingsLabel)}" aria-label="${escape(settingsLabel)}">
        <i class="fa-solid fa-gear"></i>
      </button>
    </div>
  `;
}

function initiativeBandIndex(initiative, bands) {
  const value = initiativeValue(initiative) ?? 1;
  const index = bands.findIndex(band => band.minimum === null || value >= Number(band.minimum));
  return index === -1 ? bands.length - 1 : index;
}

function turnPhaseIndex(turn, bands) {
  return initiativeBandIndex(turn?.initiative, bands);
}

async function setCombatTurn(turn, round = game.combat?.round, combat = game.combat) {
  if (!combat || !Number.isInteger(turn)) return;
  return combat.update({ round: Math.max(1, Number(round) || 1), turn: clamp(turn, 0, Math.max(0, (combat.turns?.length ?? 1) - 1)) });
}

async function movePhaseTurn(combat, delta) {
  if (!combat) return;
  const groupedTurns = phaseTurnGroups(combat.turns ?? [], getInitiativeBands());
  if (!groupedTurns.length) return;
  const currentId = combat.combatant?.id;
  const currentIndex = groupedTurns.findIndex(group => group.combatants.some(combatant => combatant.id === currentId));
  const nextIndex = currentIndex === -1 ? (delta > 0 ? 0 : groupedTurns.length - 1) : currentIndex + delta;
  const wrapsRound = nextIndex < 0 || nextIndex >= groupedTurns.length;
  const nextGroup = groupedTurns[(nextIndex + groupedTurns.length) % groupedTurns.length];
  const rawTurn = combat.turns.findIndex(turn => turn.id === nextGroup?.combatants[0]?.id);
  if (rawTurn !== -1) return setCombatTurn(rawTurn, (combat.round ?? 1) + (wrapsRound ? delta : 0), combat);
}

async function moveTurn(delta) {
  const combat = game.combat;
  if (!combat) return;
  if (getInitiativeMode() === "phases") return movePhaseTurn(combat, delta);
  const method = delta > 0 ? "nextTurn" : "previousTurn";
  if (typeof combat[method] === "function") {
    await combat[method]();
    return;
  }
  await setCombatTurn((combat.turn ?? 0) + delta);
}

function registerPhaseTurnNavigation() {
  const CombatClass = game.combat?.constructor ?? CONFIG.Combat?.documentClass;
  const prototype = CombatClass?.prototype;
  if (!prototype || prototype._veilrunnerPhaseTurnNavigation) return;

  const originalNextTurn = prototype.nextTurn;
  const originalPreviousTurn = prototype.previousTurn;
  Object.defineProperty(prototype, "_veilrunnerPhaseTurnNavigation", { value: true });

  prototype.nextTurn = function(...args) {
    if (getInitiativeMode() === "phases") return movePhaseTurn(this, 1);
    return originalNextTurn?.apply(this, args);
  };
  prototype.previousTurn = function(...args) {
    if (getInitiativeMode() === "phases") return movePhaseTurn(this, -1);
    return originalPreviousTurn?.apply(this, args);
  };
}

async function moveRound(delta) {
  const combat = game.combat;
  if (!combat) return;
  const method = delta > 0 ? "nextRound" : "previousRound";
  if (typeof combat[method] === "function") {
    await combat[method]();
    return;
  }
  const turn = delta > 0 ? 0 : Math.max(0, (combat.turns?.length ?? 1) - 1);
  await setCombatTurn(turn, (combat.round ?? 1) + delta);
}

async function movePhase(delta) {
  const combat = game.combat;
  if (!combat || getInitiativeMode() !== "phases") return;

  const bands = getInitiativeBands();
  if (!bands.length) return;

  const groupedTurns = phaseTurnGroups(combat.turns ?? [], bands);
  if (!groupedTurns.length) return;
  const currentIndex = groupedTurns.findIndex(group => group.combatants.some(combatant => combatant.id === combat.combatant?.id));
  const currentGroup = groupedTurns[currentIndex === -1 ? 0 : currentIndex];
  const candidates = groupedTurns.map((group, index) => ({ index, phase: group.phaseIndex }));
  const target = delta > 0
    ? candidates.find(candidate => candidate.index > currentIndex && candidate.phase !== currentGroup.phaseIndex)
    : candidates.slice().reverse().find(candidate => candidate.index < currentIndex && candidate.phase !== currentGroup.phaseIndex);

  if (target) {
    const rawTurn = combat.turns.findIndex(turn => turn.id === groupedTurns[target.index]?.combatants[0]?.id);
    if (rawTurn !== -1) await setCombatTurn(rawTurn);
    return;
  }

  const wrapped = delta > 0 ? groupedTurns[0] : groupedTurns[groupedTurns.length - 1];
  const rawTurn = combat.turns.findIndex(turn => turn.id === wrapped?.combatants[0]?.id);
  if (rawTurn !== -1) await setCombatTurn(rawTurn, (combat.round ?? 1) + delta);
}

async function handleControlAction(action) {
  if (!game.user.isGM) return;
  const handlers = {
    "last-round": () => moveRound(-1),
    "next-round": () => moveRound(1),
    "last-phase": () => movePhase(-1),
    "next-phase": () => movePhase(1),
    "last-turn": () => moveTurn(-1),
    "next-turn": () => moveTurn(1)
  };
  await handlers[action]?.();
}

function defaultPosition() {
  return { left: Math.round(window.innerWidth / 2), top: 12 };
}

function normalizePosition(position) {
  const fallback = defaultPosition();
  const left = Number(position?.left);
  const top = Number(position?.top);
  return {
    left: Number.isFinite(left) ? clamp(left, 12, Math.max(12, window.innerWidth - 12)) : fallback.left,
    top: Number.isFinite(top) ? clamp(top, 0, Math.max(0, window.innerHeight - 80)) : fallback.top
  };
}

function applyPosition(root, position) {
  const normalized = normalizePosition(position);
  root.style.left = `${normalized.left}px`;
  root.style.top = `${normalized.top}px`;
}

function activateCarousel(root, settings) {
  root.querySelectorAll("[data-action]").forEach(button => {
    button.addEventListener("click", async event => {
      event.preventDefault();
      const action = event.currentTarget.dataset.action;
      if (action === "toggle-lock") {
        await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.combatCarouselLocked, !settings.locked);
        return;
      }
      if (action === "open-settings") {
        game.settings.sheet?.render(true);
        return;
      }
      if (action !== "drag-carousel") await handleControlAction(action);
    });
  });

  const handle = root.querySelector("[data-action='drag-carousel']");
  handle?.addEventListener("pointerdown", event => {
    if (settings.locked) return;
    event.preventDefault();
    const rect = root.getBoundingClientRect();
    dragState = {
      root,
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    handle.setPointerCapture?.(event.pointerId);
    root.classList.add("dragging");
  });
}

async function finishDrag() {
  if (!dragState) return;
  const root = dragState.root;
  root.classList.remove("dragging");
  const rect = root.getBoundingClientRect();
  dragState = null;
  await game.settings.set(game.system.id, VEILRUNNER_SETTINGS.combatCarouselPosition, {
    left: Math.round(rect.left + rect.width / 2),
    top: Math.round(rect.top)
  });
}

function renderCarousel() {
  const settings = carouselSettings();
  const currentCarousel = Array.from(document.querySelectorAll(".vr-combat-carousel"))
    .find(element => !element.classList.contains("phase-transition-out"));
  document.querySelectorAll(".vr-combat-carousel.phase-transition-out").forEach(element => element.remove());
  refreshPhaseTurnMarkers();
  refreshPhaseTurnTrackerHighlights();
  window.requestAnimationFrame(() => refreshPhaseTurnTrackerHighlights());

  if (!settings.enabled || !game.combat) {
    currentCarousel?.remove();
    previousPhaseTransition = null;
    return;
  }

  const combatants = combatantsForCarousel(settings);
  if (!combatants.length) {
    currentCarousel?.remove();
    previousPhaseTransition = null;
    return;
  }

  const phaseTransition = phaseTransitionState(combatants, settings);
  const shouldAnimate = Boolean(currentCarousel && phaseTransition && previousPhaseTransition
    && phaseTransition.index !== previousPhaseTransition.index);
  const slideDirection = shouldAnimate ? phaseSlideDirection(previousPhaseTransition, phaseTransition) : "";
  if (shouldAnimate) {
    currentCarousel.classList.add("phase-transition-out", `phase-slide-${slideDirection}`);
    removeCarouselAfterTransition(currentCarousel);
  } else {
    currentCarousel?.remove();
  }

  const root = document.createElement("section");
  const portraitSize = settings.compact ? Math.max(36, Math.round(settings.portraitSize * 0.72)) : settings.portraitSize;
  const textSize = settings.compact ? Math.max(10, settings.textSize - 1) : settings.textSize;
  root.className = `veilrunner vr-combat-carousel portrait-${settings.portraitShape} size-${settings.portraitSizeKey} bars-${settings.barVisibility}${settings.compact ? " gm-compact" : ""}${settings.locked ? " locked" : ""}${shouldAnimate ? ` phase-transition-in phase-slide-${slideDirection}` : ""}`;
  root.style.setProperty("--vr-carousel-portrait-size", `${portraitSize}px`);
  root.style.setProperty("--vr-carousel-text-size", `${textSize}px`);
  root.style.setProperty("--vr-carousel-track-width", `${(combatants.length * (portraitSize + 8)) + (countIdentifiers(combatants) * 42) + 12}px`);
  applyPosition(root, getVeilrunnerSetting(VEILRUNNER_SETTINGS.combatCarouselPosition));
  root.innerHTML = `
    ${renderDragControls(settings)}
    <div class="vr-combat-carousel-shell">
      ${renderControls("previous")}
      <div class="vr-combat-carousel-track">
        ${renderTracker(combatants, settings)}
      </div>
      ${renderControls("next")}
    </div>
  `;
  document.body.append(root);
  activateCarousel(root, settings);
  if (shouldAnimate) finishCarouselEntrance(root);
  previousPhaseTransition = phaseTransition;
}

export function refreshCombatCarousel() {
  renderCarousel();
}

export function registerCombatCarousel() {
  game.veilrunner = {
    ...(game.veilrunner ?? {}),
    refreshCombatCarousel,
    refreshPhaseTurnMarkers,
    refreshPhaseTurnTrackerHighlights,
    moveCombatRound: moveRound,
    moveCombatPhase: movePhase,
    moveCombatTurn: moveTurn
  };

  Hooks.once("ready", () => {
    registerPhaseTurnNavigation();
    renderCarousel();
  });
  Hooks.on("createCombat", () => {
    registerPhaseTurnNavigation();
    renderCarousel();
  });
  Hooks.on("updateCombat", renderCarousel);
  Hooks.on("deleteCombat", renderCarousel);
  Hooks.on("createCombatant", renderCarousel);
  Hooks.on("updateCombatant", renderCarousel);
  Hooks.on("deleteCombatant", renderCarousel);
  Hooks.on("updateActor", actor => {
    const actorInCombat = Array.from(game.combat?.combatants ?? []).some(combatant => combatant.actor?.id === actor.id);
    if (!actorInCombat) return;
    renderCarousel();
  });
  Hooks.on("canvasReady", renderCarousel);
  Hooks.on("renderCombatTracker", refreshPhaseTurnTrackerHighlights);
  Hooks.on("renderCombat", refreshPhaseTurnTrackerHighlights);
  Hooks.on("renderToken", refreshPhaseTurnMarkers);
  Hooks.on("deleteToken", refreshPhaseTurnMarkers);
  window.addEventListener("pointermove", event => {
    if (!dragState) return;
    const left = event.clientX - dragState.offsetX + dragState.root.offsetWidth / 2;
    const top = event.clientY - dragState.offsetY;
    applyPosition(dragState.root, { left, top });
  });
  window.addEventListener("pointerup", event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    finishDrag();
  });
  window.addEventListener("pointercancel", event => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    finishDrag();
  });
}
