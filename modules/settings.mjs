export const VEILRUNNER_SETTINGS = {
  allowPlayerDatapad: "allowPlayerDatapad",
  createDatapadFolders: "createDatapadFolders",
  defaultQuestObjectiveVisibility: "defaultQuestObjectiveVisibility",
  initiativeMode: "initiativeMode",
  initiativeBands: "initiativeBands",
  initiativeNeutralPhaseEnabled: "initiativeNeutralPhaseEnabled",
  initiativeBandsPanelEnabled: "initiativeBandsPanelEnabled",
  initiativeBandsPanelLocked: "initiativeBandsPanelLocked",
  initiativeBandsPanelPosition: "initiativeBandsPanelPosition",
  combatCarouselEnabled: "combatCarouselEnabled",
  combatCarouselPortraitShape: "combatCarouselPortraitShape",
  combatCarouselPortraitSize: "combatCarouselPortraitSize",
  combatCarouselTextSize: "combatCarouselTextSize",
  combatCarouselShowResourceNumbers: "combatCarouselShowResourceNumbers",
  combatCarouselRevealPlayerNumbers: "combatCarouselRevealPlayerNumbers",
  combatCarouselShowResourceBars: "combatCarouselShowResourceBars",
  combatCarouselResourceBarsGmOnly: "combatCarouselResourceBarsGmOnly",
  combatCarouselResourceBarVisibility: "combatCarouselResourceBarVisibility",
  combatCarouselActivePhaseOnly: "combatCarouselActivePhaseOnly",
  combatCarouselGmCompact: "combatCarouselGmCompact",
  combatCarouselHideDead: "combatCarouselHideDead",
  combatCarouselLocked: "combatCarouselLocked",
  combatCarouselPosition: "combatCarouselPosition"
};

const QUEST_OBJECTIVE_VISIBILITY = {
  observers: "VEILRUNNER.Settings.defaultQuestObjectiveVisibility.Choices.observers",
  gm: "VEILRUNNER.Settings.defaultQuestObjectiveVisibility.Choices.gm"
};

const INITIATIVE_MODES = {
  traditional: "VEILRUNNER.Settings.initiativeMode.Choices.traditional",
  phases: "VEILRUNNER.Settings.initiativeMode.Choices.phases",
  block: "VEILRUNNER.Settings.initiativeMode.Choices.block"
};

const PORTRAIT_SHAPES = {
  circle: "VEILRUNNER.Settings.combatCarouselPortraitShape.Choices.circle",
  rounded: "VEILRUNNER.Settings.combatCarouselPortraitShape.Choices.rounded",
  square: "VEILRUNNER.Settings.combatCarouselPortraitShape.Choices.square"
};

const PORTRAIT_SIZES = {
  small: "VEILRUNNER.Settings.combatCarouselPortraitSize.Choices.small",
  medium: "VEILRUNNER.Settings.combatCarouselPortraitSize.Choices.medium",
  large: "VEILRUNNER.Settings.combatCarouselPortraitSize.Choices.large",
  xl: "VEILRUNNER.Settings.combatCarouselPortraitSize.Choices.xl",
  xxl: "VEILRUNNER.Settings.combatCarouselPortraitSize.Choices.xxl"
};

const RESOURCE_BAR_VISIBILITY = {
  hover: "VEILRUNNER.Settings.combatCarouselResourceBarVisibility.Choices.hover",
  always: "VEILRUNNER.Settings.combatCarouselResourceBarVisibility.Choices.always",
  off: "VEILRUNNER.Settings.combatCarouselResourceBarVisibility.Choices.off"
};

const PHASE_VIEW_MODES = {
  all: "VEILRUNNER.Settings.combatCarouselActivePhaseOnly.Choices.all",
  active: "VEILRUNNER.Settings.combatCarouselActivePhaseOnly.Choices.active",
  hybrid: "VEILRUNNER.Settings.combatCarouselActivePhaseOnly.Choices.hybrid"
};

const SETTINGS_SECTIONS = [
  {
    key: "general",
    settings: [
      VEILRUNNER_SETTINGS.defaultQuestObjectiveVisibility,
      VEILRUNNER_SETTINGS.initiativeMode,
      VEILRUNNER_SETTINGS.initiativeBands,
      VEILRUNNER_SETTINGS.initiativeNeutralPhaseEnabled,
      VEILRUNNER_SETTINGS.initiativeBandsPanelEnabled,
      VEILRUNNER_SETTINGS.combatCarouselEnabled,
      VEILRUNNER_SETTINGS.combatCarouselPortraitShape,
      VEILRUNNER_SETTINGS.combatCarouselPortraitSize,
      VEILRUNNER_SETTINGS.combatCarouselTextSize,
      VEILRUNNER_SETTINGS.combatCarouselShowResourceNumbers,
      VEILRUNNER_SETTINGS.combatCarouselRevealPlayerNumbers,
      VEILRUNNER_SETTINGS.combatCarouselResourceBarsGmOnly,
      VEILRUNNER_SETTINGS.combatCarouselResourceBarVisibility,
      VEILRUNNER_SETTINGS.combatCarouselActivePhaseOnly,
      VEILRUNNER_SETTINGS.combatCarouselGmCompact,
      VEILRUNNER_SETTINGS.combatCarouselHideDead
    ]
  },
  {
    key: "datapad",
    settings: [
      VEILRUNNER_SETTINGS.allowPlayerDatapad,
      VEILRUNNER_SETTINGS.createDatapadFolders
    ]
  }
];

export function getVeilrunnerSetting(key) {
  return game.settings.get(game.system.id, key);
}

export function refreshVeilrunnerCombatUi() {
  document.querySelectorAll(".vr-combat-carousel, .vr-combat-initiative-bands, .vr-initiative-block-heading").forEach(element => element.remove());
  document.querySelectorAll(".vr-initiative-block-member").forEach(element => {
    element.classList.remove("vr-initiative-block-member");
    delete element.dataset.vrInitiativeBlockTeam;
  });
  ui.combat?.render?.(false);
  ui.sidebar?.tabs?.combat?.render?.(false);
  game.veilrunner?.refreshInitiativeTrackerControls?.();
  window.setTimeout(() => game.veilrunner?.refreshInitiativeTrackerControls?.(), 0);
  game.veilrunner?.refreshCombatCarousel?.();
}

export function registerSettings() {
  const sid = game.system.id;

  game.settings.register(sid, VEILRUNNER_SETTINGS.allowPlayerDatapad, {
    name: "VEILRUNNER.Settings.allowPlayerDatapad.Name",
    hint: "VEILRUNNER.Settings.allowPlayerDatapad.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.createDatapadFolders, {
    name: "VEILRUNNER.Settings.createDatapadFolders.Name",
    hint: "VEILRUNNER.Settings.createDatapadFolders.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.defaultQuestObjectiveVisibility, {
    name: "VEILRUNNER.Settings.defaultQuestObjectiveVisibility.Name",
    hint: "VEILRUNNER.Settings.defaultQuestObjectiveVisibility.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: QUEST_OBJECTIVE_VISIBILITY,
    default: "observers",
    restricted: true
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeMode, {
    name: "VEILRUNNER.Settings.initiativeMode.Name",
    hint: "VEILRUNNER.Settings.initiativeMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: INITIATIVE_MODES,
    default: "phases",
    restricted: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeBands, {
    name: "VEILRUNNER.Settings.initiativeBands.Name",
    hint: "VEILRUNNER.Settings.initiativeBands.Hint",
    scope: "world",
    config: false,
    type: Object,
    default: {
      bands: [
        { name: "Phase 1", minimum: 11 },
        { name: "Phase 2", minimum: null }
      ]
    },
    restricted: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeNeutralPhaseEnabled, {
    name: "VEILRUNNER.Settings.initiativeNeutralPhaseEnabled.Name",
    hint: "VEILRUNNER.Settings.initiativeNeutralPhaseEnabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeBandsPanelEnabled, {
    name: "VEILRUNNER.Settings.initiativeBandsPanelEnabled.Name",
    hint: "VEILRUNNER.Settings.initiativeBandsPanelEnabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeBandsPanelLocked, {
    name: "VEILRUNNER.Settings.initiativeBandsPanelLocked.Name",
    hint: "VEILRUNNER.Settings.initiativeBandsPanelLocked.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.initiativeBandsPanelPosition, {
    name: "VEILRUNNER.Settings.initiativeBandsPanelPosition.Name",
    hint: "VEILRUNNER.Settings.initiativeBandsPanelPosition.Hint",
    scope: "client",
    config: false,
    type: Object,
    default: null,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselEnabled, {
    name: "VEILRUNNER.Settings.combatCarouselEnabled.Name",
    hint: "VEILRUNNER.Settings.combatCarouselEnabled.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselPortraitShape, {
    name: "VEILRUNNER.Settings.combatCarouselPortraitShape.Name",
    hint: "VEILRUNNER.Settings.combatCarouselPortraitShape.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: PORTRAIT_SHAPES,
    default: "circle",
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselPortraitSize, {
    name: "VEILRUNNER.Settings.combatCarouselPortraitSize.Name",
    hint: "VEILRUNNER.Settings.combatCarouselPortraitSize.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: PORTRAIT_SIZES,
    default: "medium",
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselTextSize, {
    name: "VEILRUNNER.Settings.combatCarouselTextSize.Name",
    hint: "VEILRUNNER.Settings.combatCarouselTextSize.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 10, max: 18, step: 1 },
    default: 12,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselShowResourceNumbers, {
    name: "VEILRUNNER.Settings.combatCarouselShowResourceNumbers.Name",
    hint: "VEILRUNNER.Settings.combatCarouselShowResourceNumbers.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselRevealPlayerNumbers, {
    name: "VEILRUNNER.Settings.combatCarouselRevealPlayerNumbers.Name",
    hint: "VEILRUNNER.Settings.combatCarouselRevealPlayerNumbers.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselShowResourceBars, {
    name: "VEILRUNNER.Settings.combatCarouselShowResourceBars.Name",
    hint: "VEILRUNNER.Settings.combatCarouselShowResourceBars.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselResourceBarsGmOnly, {
    name: "VEILRUNNER.Settings.combatCarouselResourceBarsGmOnly.Name",
    hint: "VEILRUNNER.Settings.combatCarouselResourceBarsGmOnly.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    restricted: true,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselResourceBarVisibility, {
    name: "VEILRUNNER.Settings.combatCarouselResourceBarVisibility.Name",
    hint: "VEILRUNNER.Settings.combatCarouselResourceBarVisibility.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: RESOURCE_BAR_VISIBILITY,
    default: "always",
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselActivePhaseOnly, {
    name: "VEILRUNNER.Settings.combatCarouselActivePhaseOnly.Name",
    hint: "VEILRUNNER.Settings.combatCarouselActivePhaseOnly.Hint",
    scope: "client",
    config: true,
    type: String,
    choices: PHASE_VIEW_MODES,
    default: "all",
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselGmCompact, {
    name: "VEILRUNNER.Settings.combatCarouselGmCompact.Name",
    hint: "VEILRUNNER.Settings.combatCarouselGmCompact.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselHideDead, {
    name: "VEILRUNNER.Settings.combatCarouselHideDead.Name",
    hint: "VEILRUNNER.Settings.combatCarouselHideDead.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: false,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselLocked, {
    name: "VEILRUNNER.Settings.combatCarouselLocked.Name",
    hint: "VEILRUNNER.Settings.combatCarouselLocked.Hint",
    scope: "client",
    config: false,
    type: Boolean,
    default: false,
    onChange: refreshVeilrunnerCombatUi
  });

  game.settings.register(sid, VEILRUNNER_SETTINGS.combatCarouselPosition, {
    name: "VEILRUNNER.Settings.combatCarouselPosition.Name",
    hint: "VEILRUNNER.Settings.combatCarouselPosition.Hint",
    scope: "client",
    config: false,
    type: Object,
    default: null,
    onChange: refreshVeilrunnerCombatUi
  });

  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root?.querySelector) return;

    for (const section of SETTINGS_SECTIONS) {
      const firstSetting = section.settings
        .map(key => root.querySelector(`[name="${sid}.${key}"]`))
        .find(Boolean);
      const field = firstSetting?.closest(".form-group, fieldset")
        ?? firstSetting?.closest(".form-fields")?.parentElement
        ?? firstSetting?.parentElement;
      if (!field || field.previousElementSibling?.dataset?.veilrunnerSettingsSection === section.key) continue;

      const heading = document.createElement("h3");
      heading.className = "vr-settings-section";
      heading.dataset.veilrunnerSettingsSection = section.key;
      heading.textContent = game.i18n.localize(`VEILRUNNER.Settings.Sections.${section.key}`);
      field.parentElement?.insertBefore(heading, field);
    }
  });
}
