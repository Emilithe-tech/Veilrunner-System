# Reactive Combat HUD

## Architecture

The HUD is a frameless Foundry v14 `ApplicationV2` registered during system initialization. It renders five independent Handlebars parts: party, self, workspace, target, and economy. The Combat Carousel remains a separate overlay.

The UI is a projection of authoritative Actor, Item, ActiveEffect, Token target, Combat, Combatant, Party-folder, Macro, and User data. It does not own resources, equipment, targets, effects, PAN state, intel, AP/RX, or MAP.

Action processing is split across these modules:

- `discovery.mjs`: normalizes owned Actions/Abilities, generated firearm operations, equipped-item actions, provider actions, and hotbar macros.
- `availability.mjs`: returns `satisfied`, `unsatisfied`, or `unknown-to-player` without leaking hidden target state.
- `resolver.mjs`: validates composer choices and resolves rank, enhancement, resource, and AP projections.
- `execution.mjs`: shared system entry point; commits resources and combat economy only after the underlying action succeeds.
- `economy.mjs`: combatant-scoped AP, RX, movement placeholder, attack count, and MAP.
- `visibility.mjs`, `pan.mjs`, and `target-intel.mjs`: effect disclosure, PAN fidelity, qualitative health, and encounter-scoped party intel.

## Data Contracts

Normalized HUD actions contain source/provider identity, domain, timing, AP cost, governing attribute, traits/tags, resource costs, requirements, composer fields, enhancements, augments, rank scaling, and execution metadata.

Action and Ability Items support structured requirements and effect consumption. Physical Items may grant `system.hudActions` while equipped. Heroes may link controlled assets through `system.assetLinks` entries containing an Actor UUID and `pet`, `spirit`, `drone`, `summon`, or `vehicle` kind.

Persistent state:

- Combatant flag `flags.Veilrunner.actionHud.economy`: cycle key, AP, RX, movement, successful attack count.
- Combatant flag `flags.Veilrunner.actionHud.pan.state`: Stable, Degraded, Jammed, or Link Lost override.
- Combat flag `flags.Veilrunner.actionHud.intel.<party>.<target>`: encounter intel modules.
- User flag `flags.Veilrunner.actionHud.preferences.<actor>`: pins, recents, remembered choices, filters, selected asset, and accessibility preferences.
- ActiveEffect flag `flags.Veilrunner.visibility.disclosure`: observable, self-known, PAN telemetry, biomonitor, system telemetry, magical detection, digital detection, or hidden.

## Implemented Functionality

- Automatic combat lifecycle and controlled-combatant selection with owner/GM fallback.
- Responsive fixed anchors, vertical party rail, stable target panel, replacement workspace modes, and persistent economy rail.
- The transparent overlay is locked to the viewport bottom, dynamically reserves Foundry's visible right-sidebar width, and confines the economy footer to the center workspace column.
- Self and target cards use vertical equipment-art portrait frames above their details. Portraits are centered at full frame height with contained scaling and clipped overflow; the empty target preserves the same footprint.
- Normal deck, deterministic capability domains, libraries/search, fixed-order pins, recents, context actions, macros, saves, weapon selector, composers, and asset context.
- During combat the native Foundry hotbar is visually hidden without changing its assignments or keyboard behavior. Its occupied current-user slots are projected, in native slot order, into the wider horizontally scrollable macro region of the HUD footer. PAN remains on the self card.
- Real equipment switching, generated firearm fire/reload/load/unload operations, ammunition state, and empty-weapon context.
- Equipped-weapon interactions resolve against the unfiltered action projection, so saved domain and search filters cannot redirect executable firearms to their Item sheets. Firearms expose a dedicated composer with a Single Shot compatibility mode, optional authored modes/options, exact formula/cost/ammunition/range/MAP data, and no fabricated hit, critical, or expected-damage values.
- Shared Action/Ability/firearm execution, post-success AP/RX expenditure, and cumulative trait-adjusted MAP.
- Data-first rank/enhancement/augment configuration and pre-execution resource projection.
- Conservative effect visibility, qualitative target health, subsystem intel, PAN fidelity, and reduced-motion support.
- Item/hero authoring seams for advanced action contracts, granted item actions, and controlled assets.

## Current Rules Assumptions

- AP is `2 + floor(Agility / 10)` and RX is `floor(Reaction / 10)` because those formulas already exist on the hero sheet.
- MAP is zero for the first attack. Later attacks use `-5 per prior successful attack + the current action's GM-authored trait adjustment`.
- Save rolls use the configurable `combatHudSaveFormula`, seeded as `1d10 + @modifier`.
- Movement and Sustain display as unavailable until authoritative rules exist.
- Health bands are world-configurable and seeded as Uninjured 100, Wounded 61–99, Bloodied 26–60, Critical 1–25, Down 0.
- Legacy ActiveEffects without disclosure metadata remain hidden from non-owners.
- Existing firearm documents require no migration: absent structured modes derive Single Shot, while optional `firearm.fireModes` and `firearm.options` arrays are available for explicit authoring.

## Remaining Runtime Verification

Static tests cannot prove Foundry layout, permissions, focus behavior, document persistence, or hook timing. Before release, test GM and player sessions in standard, block, and phase initiative; verify combatant flag updates as an owning player; exercise every workspace at the supported aspect ratios; confirm target information never leaks; and inspect the browser console for v14 API or Handlebars errors.

Future rule content should extend providers and schemas rather than add action names or formulas to the renderer. Range resolution, finalized movement/sustain rules, environment interaction providers, and persistent dossier intel remain intentionally authorable seams rather than invented mechanics.
