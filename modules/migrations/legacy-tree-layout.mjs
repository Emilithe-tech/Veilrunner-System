// Historical migration input only. Production runtime must not import this catalog.

/** Shipped three-tier tree catalog: School -> Practice -> Spell/Skill. */
const NODE_SHAPES = ["circle", "diamond", "hex", "pentagon", "square", "rounded-square", "shield", "flag", "star", "capsule"];
const spell = (id, name, order, options = {}) => ({
  id, name, order, x: Number(options.x) || 0, y: Number(options.y) || 0,
  shape: NODE_SHAPES.includes(options.shape) ? options.shape : (options.type === "ability" ? "hex" : options.type === "trait" ? "circle" : "diamond"),
  size: options.size ?? { preset: "medium" },
  type: ["ability", "reaction"].includes(options.type) ? options.type : "action",
  category: options.category ?? "magic", actions: options.type === "ability" ? 0 : (options.actions ?? 1),
  talentCost: options.talentCost ?? 1, rankCost: options.rankCost ?? 1, maxRank: options.maxRank ?? Number.MAX_SAFE_INTEGER,
  requiredLevel: options.requiredLevel ?? 1, requires: options.requires ?? [], traits: options.traits ?? [],
  resourceCosts: options.resourceCosts ?? { mana: 0, stamina: 0, health: 0 }, effects: options.effects ?? [],
  img: options.img ?? "", description: options.description ?? ""
});

const practice = (id, name, x, y, spells = [], options = {}) => ({
  id, name, x, y, shape: NODE_SHAPES.includes(options.shape) ? options.shape : "diamond", size: options.size ?? { preset: "medium" }, talentCost: options.talentCost ?? 1, requiredLevel: options.requiredLevel ?? 1,
  requires: options.requires ?? [], color: options.color ?? "", spells: spells.map((entry, index) => ({
    ...entry,
    x: entry.x || (x + 105 + (index - (spells.length - 1) / 2) * 78),
    y: entry.y || (y + 138 + (index % 2) * 44)
  }))
});

export const TALENT_TREE_CANVAS = Object.freeze({ width: 3840, height: 2160, margin: 60 });
export const TALENT_TREE_LAYOUT_VERSION = 10;
const LEGACY_LAYOUT_SCALE = Object.freeze({ x: .55, y: .36 });
const LEGACY_LAYOUT_EDGE = Object.freeze({ x: 3600, y: 1920 });
const LEGACY_MAGIC_ROOT = Object.freeze({ id: "magic-root", name: "Aetheric Ability", x: 5000, y: 3500, color: "#d8b4fe", shape: "hex" });
const SCHOOL_ANGLES = Object.freeze({ elemental: -90, primal: -30, arcane: 30, spirit: 90, creation: 150, intrinsic: 210 });
const school = (id, name, x, y, color, practices) => {
  const angle = (SCHOOL_ANGLES[id] ?? -90) * Math.PI / 180;
  const target = { x: LEGACY_MAGIC_ROOT.x + Math.cos(angle) * 330, y: LEGACY_MAGIC_ROOT.y + Math.sin(angle) * 330 };
  const outward = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -outward.y, y: outward.x };
  const transform = node => {
    const dx = Number(node.x) - x;
    const dy = Number(node.y) - y;
    return { ...node, x: Math.round(target.x + across.x * dx + outward.x * dy), y: Math.round(target.y + across.y * dx + outward.y * dy) };
  };
  return { id, name, x: Math.round(target.x), y: Math.round(target.y), color, shape: "pentagon", practices: practices.map(entry => ({ ...transform(entry), spells: (entry.spells ?? []).map(transform) })) };
};
const s = spell;
const spiritProgression = (verb, prefix, traits) => ["Minor", "Lesser", "Regular", "Greater", "Arch"].map((rank, index, ranks) => s(`${prefix}-${rank.toLowerCase()}-spirit`, `${verb} ${rank} Spirit`, index, { traits, requires: index ? [{ id: `${prefix}-${ranks[index - 1].toLowerCase()}-spirit`, level: 1 }] : [] }));

const LEGACY_TALENT_TREES = Object.freeze({
  skills: [],
  magic: [
    school("elemental", "Elemental", 500, 120, "#f97316", [
      practice("geomancy", "Geomancy", 80, 390, [], { color: "#d97706" }),
      practice("hydromancy", "Hydromancy", 310, 390, [s("dehydrate", "Dehydrate", 0, { traits: ["hydro", "attack"] })]),
      practice("pyromancy", "Pyromancy", 540, 390, [s("firebolt", "Firebolt", 0, { traits: ["pyro", "attack"] }), s("fire-ball", "Fire Ball", 1, { traits: ["pyro", "attack", "area"], requires: [{ id: "firebolt", level: 5 }] }), s("firestream", "Firestream", 2, { traits: ["pyro", "attack"] }), s("flame-wall", "Flame Wall", 3, { traits: ["pyro", "area"] }), s("napalm", "Napalm", 4, { traits: ["pyro", "area"] })]),
      practice("aeromancy", "Aeromancy", 770, 390, [s("suffocation", "Suffocation", 0, { traits: ["aero", "attack"] })]),
      practice("metalmancy", "Metalmancy", 80, 900, [], { requires: ["geomancy"] }),
      practice("cryomancy", "Cryomancy", 310, 900, [], { requires: ["hydromancy"] }),
      practice("pyromancy-ii", "Pyromancy II", 540, 900, [s("flamethrower", "Flamethrower", 0, { traits: ["pyro", "attack", "area"] })], { requires: ["pyromancy"] }),
      practice("electromancy", "Electromancy", 770, 900, [s("electric-bolt", "Electric Bolt", 0, { traits: ["electric", "attack"] }), s("electric-arc", "Electric Arc", 1, { traits: ["electric", "attack"] })], { requires: ["aeromancy"] }),
      practice("thermokinesis", "Thermokinesis", 425, 1400, [s("flaming-comet", "Flaming Comet", 0, { traits: ["pyro", "attack", "area"] })], { requires: ["cryomancy", "pyromancy-ii"] })
    ]),
    school("primal", "Primal", 1500, 120, "#84cc16", [
      practice("biomancy", "Biomancy", 1080, 390), practice("arborancy", "Arborancy", 1310, 390),
      practice("beastmancy", "Beastmancy", 1540, 390, [s("shapeshift", "Shapeshift (Beast Form)", 0, { type: "ability", traits: ["primal"] })]),
      practice("ruinic", "Ruinic", 1770, 390),
      practice("genesis", "Genesis", 1200, 900, [], { requires: ["biomancy", "arborancy"] }),
      practice("glyphs", "Glyphs", 1660, 900, [], { requires: ["ruinic"] })
    ]),
    school("arcane", "Arcane", 2500, 120, "#a855f7", [
      practice("arcane-energy", "Arcane Energy", 2080, 390, [s("mana-bolt", "Mana Bolt", 0, { traits: ["arcane", "attack"] }), s("mana-ball", "Mana Ball", 1, { traits: ["arcane", "attack", "area"] })]),
      practice("force", "Force", 2310, 390, [s("push", "Push", 0, { traits: ["arcane", "manipulate"] }), s("pull", "Pull", 1, { traits: ["arcane", "manipulate"] })]),
      practice("resonance", "Resonance", 2540, 390),
      practice("light", "Light", 2770, 390, [s("light-spell", "Light", 0, { traits: ["arcane", "light"] }), s("light-grenade", "Light Grenade", 1, { traits: ["arcane", "light", "area"] })]),
      practice("gravity", "Gravity", 2310, 900, [s("lift", "Lift", 0, { traits: ["arcane", "manipulate"] }), s("levitate", "Levitate", 1, { traits: ["arcane", "manipulate"] })], { requires: ["force"] }),
      practice("spatial-manipulation", "Spatial Manipulation", 2310, 1400, [], { requires: ["gravity"] })
    ]),
    school("spirit", "Spirit", 3500, 120, "#e8f7ff", [
      practice("summoning", "Summoning", 3080, 390, spiritProgression("Summon", "summon", ["spirit", "summoning"])),
      practice("conjuration", "Conjuration", 3310, 390), practice("spiritual", "Spiritual", 3540, 390), practice("illusion", "Illusion", 3770, 390),
      practice("binding", "Binding", 3080, 900, spiritProgression("Bind", "bind", ["spirit", "binding"]), { requires: ["summoning"] }),
      practice("phantasms", "Phantasms", 3310, 900, [], { requires: ["conjuration"] }), practice("curse", "Curse", 3540, 900, [], { requires: ["spiritual"] }),
      practice("sound", "Sound", 3770, 900, [s("mute", "Mute", 0, { traits: ["spirit", "sonic"] }), s("mute-area", "Mute Area", 1, { traits: ["spirit", "sonic", "area"] })], { requires: ["illusion"] }),
      practice("channeling", "Channeling", 3080, 1400, spiritProgression("Channel", "channel", ["spirit", "channeling"]).map(entry => ({ ...entry, type: "ability", actions: 0, shape: "hex" })), { requires: ["binding"] }),
      practice("visual", "Visual", 3770, 1400, [s("invisibility", "Invisibility", 0, { traits: ["spirit", "illusion"] }), s("improved-invisibility", "Improved Invisibility", 1, { traits: ["spirit", "illusion"], requires: ["invisibility"] }), s("true-invisibility", "True Invisibility", 2, { traits: ["spirit", "illusion"], requires: ["improved-invisibility"] })], { requires: ["sound"] })
    ]),
    school("creation", "Creation", 4500, 120, "#facc15", [
      practice("vitalism", "Vitalism", 4080, 390, [s("healing-touch", "Healing Touch", 0, { type: "ability", traits: ["creation", "healing"] }), s("soothe", "Soothe", 1, { traits: ["creation", "healing"] }), s("heal", "Heal", 2, { traits: ["creation", "healing"] }), s("greater-heal", "Greater Heal", 3, { traits: ["creation", "healing"] }), s("benediction", "Benediction", 4, { type: "ability", traits: ["creation", "healing"] })]),
      practice("purification", "Purification", 4310, 390), practice("divine-magic", "Divine Magic", 4540, 390, [s("divine-bolt", "Divine Bolt", 0, { traits: ["creation", "attack"] })]), practice("transmutation", "Transmutation", 4770, 390),
      practice("vitalism-ii", "Vitalism II", 4080, 900, [s("minor-area-heal", "Minor Area Heal", 0, { traits: ["creation", "healing", "area"] }), s("lesser-area-heal", "Lesser Area Heal", 1, { traits: ["creation", "healing", "area"] }), s("asylum", "Asylum", 2, { traits: ["creation", "healing", "area"] })], { requires: ["vitalism"] }),
      practice("regeneration", "Regeneration", 4310, 900, [s("regen-i", "Regen I", 0, { type: "ability", traits: ["creation", "healing"] }), s("regen-ii", "Regen II", 1, { type: "ability", traits: ["creation", "healing"] })], { requires: ["purification"] }),
      practice("mana-shielding", "Mana Shielding", 4540, 900, [], { requires: ["divine-magic"] }), practice("fabrication", "Fabrication", 4770, 900, [], { requires: ["transmutation"] }),
      practice("arcane-constructs", "Arcane Constructs", 4425, 1400, [], { requires: ["vitalism-ii", "fabrication"] }), practice("runecrafting", "Runecrafting", 4655, 1400, [], { requires: ["mana-shielding", "fabrication"] })
    ]),
    school("intrinsic", "Intrinsic", 5500, 120, "#38bdf8", [
      practice("temporal", "Temporal", 5080, 390, [s("haste", "Haste", 0, { type: "ability", traits: ["intrinsic"] }), s("slow", "Slow", 1, { traits: ["intrinsic"] })]),
      practice("augmentation", "Augmentation", 5310, 390, [s("resist-damage", "Resist Damage", 0, { type: "ability", traits: ["intrinsic", "defense"] })]), practice("perception", "Perception", 5540, 390), practice("entropy", "Entropy", 5770, 390),
      practice("void", "Void", 5080, 900, [], { requires: ["temporal"] }), practice("augmentation-ii", "Augmentation II", 5310, 900, [s("increase-attributes", "Increase Attributes", 0, { type: "ability", traits: ["intrinsic"] })], { requires: ["augmentation"] }),
      practice("detection", "Detection", 5540, 900, [], { requires: ["perception"] }), practice("blood-magic", "Blood Magic", 5770, 900, [], { requires: ["entropy"] }),
      practice("paradoxical", "Paradoxical", 5080, 1400, [], { requires: ["void"] }), practice("demon-summoning", "Demon Summoning", 5540, 1400, [], { requires: ["detection", "blood-magic"] }),
      practice("death-magic", "Death Magic", 5770, 1800, [], { requires: ["paradoxical", "demon-summoning"] })
    ])
  ]
});

const LEGACY_TALENT_TREE_ROOTS = Object.freeze({ magic: LEGACY_MAGIC_ROOT, skills: { id: "skills-root", name: "Skills", x: 5000, y: 3500, color: "#67e8f9", shape: "hex" } });

function clone(value) {
  return globalThis.structuredClone ? globalThis.structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function pageNodes(page = []) {
  return page.flatMap(school => [school, ...(school.practices ?? []).flatMap(practice => [practice, ...(practice.spells ?? [])])]).filter(Boolean);
}

function legacyPageScale(page, root) {
  const nodes = [root, ...pageNodes(page)].filter(Boolean);
  const maximumX = Math.max(1, ...nodes.map(node => Math.max(0, Number(node.x) || 0)));
  const maximumY = Math.max(1, ...nodes.map(node => Math.max(0, Number(node.y) || 0)));
  return {
    x: Math.min(LEGACY_LAYOUT_SCALE.x, LEGACY_LAYOUT_EDGE.x / maximumX),
    y: Math.min(LEGACY_LAYOUT_SCALE.y, LEGACY_LAYOUT_EDGE.y / maximumY)
  };
}

function canvasCoordinate(value, axis, scale) {
  const maximum = axis === "x" ? TALENT_TREE_CANVAS.width : TALENT_TREE_CANVAS.height;
  return Math.max(TALENT_TREE_CANVAS.margin, Math.min(maximum - TALENT_TREE_CANVAS.margin, Math.round((Number(value) || 0) * scale[axis])));
}

export function clampTalentTreePoint(x, y) {
  return {
    x: Math.max(TALENT_TREE_CANVAS.margin, Math.min(TALENT_TREE_CANVAS.width - TALENT_TREE_CANVAS.margin, Math.round(Number(x) || 0))),
    y: Math.max(TALENT_TREE_CANVAS.margin, Math.min(TALENT_TREE_CANVAS.height - TALENT_TREE_CANVAS.margin, Math.round(Number(y) || 0)))
  };
}

export function talentTreeRingRadius(root, requested = 500) {
  const radius = Math.max(180, Math.min(3000, Number(requested) || 500));
  const maximum = Math.max(0, Math.min(
    Number(root?.x) - TALENT_TREE_CANVAS.margin,
    TALENT_TREE_CANVAS.width - TALENT_TREE_CANVAS.margin - Number(root?.x),
    Number(root?.y) - TALENT_TREE_CANVAS.margin,
    TALENT_TREE_CANVAS.height - TALENT_TREE_CANVAS.margin - Number(root?.y)
  ));
  return Math.min(radius, maximum);
}

function migrateLegacyPage(page, root) {
  const result = clone(page ?? []);
  const scale = legacyPageScale(result, root);
  for (const node of pageNodes(result)) {
    node.x = canvasCoordinate(node.x, "x", scale);
    node.y = canvasCoordinate(node.y, "y", scale);
  }
  const migratedRoot = clone(root);
  migratedRoot.x = canvasCoordinate(migratedRoot.x, "x", scale);
  migratedRoot.y = canvasCoordinate(migratedRoot.y, "y", scale);
  return { page: result, root: migratedRoot };
}

function translateConnectionStyle(style, dx, dy, translated) {
  if (!style || typeof style !== "object" || translated.has(style)) return;
  translated.add(style);
  if (!Array.isArray(style.waypoints)) return;
  for (const point of style.waypoints) {
    if (!point || typeof point !== "object") continue;
    point.x = (Number(point.x) || 0) + dx;
    point.y = (Number(point.y) || 0) + dy;
  }
}

function translateTreePage(page, dx, dy) {
  const translated = new WeakSet();
  for (const node of pageNodes(page)) {
    node.x = (Number(node.x) || 0) + dx;
    node.y = (Number(node.y) || 0) + dy;
  }
  for (const school of page) {
    translateConnectionStyle(school.rootConnection, dx, dy, translated);
    for (const practice of school.practices ?? []) {
      translateConnectionStyle(practice.schoolConnection, dx, dy, translated);
      for (const requirement of practice.requires ?? []) translateConnectionStyle(requirement?.line, dx, dy, translated);
      for (const spell of practice.spells ?? []) {
        translateConnectionStyle(spell.practiceConnection, dx, dy, translated);
        for (const requirement of spell.requires ?? []) translateConnectionStyle(requirement?.line, dx, dy, translated);
      }
    }
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function inferCenteredPageTranslation(page, key, center) {
  const fallbackById = new Map(pageNodes(VEILRUNNER_TALENT_TREES[key]).map(node => [node.id, node]));
  const matches = pageNodes(page).flatMap(node => fallbackById.has(node.id) ? [{ node, fallback: fallbackById.get(node.id) }] : []);
  if (matches.length >= 2) return {
    x: Math.round(median(matches.map(({ node, fallback }) => Number(fallback.x) - Number(node.x)))),
    y: Math.round(median(matches.map(({ node, fallback }) => Number(fallback.y) - Number(node.y))))
  };
  const positionedPrimaryNodes = page.filter(node => Number.isFinite(Number(node?.x)) && Number.isFinite(Number(node?.y)));
  const primaryNodes = positionedPrimaryNodes.filter(node => node.authored !== true);
  if (!primaryNodes.length) primaryNodes.push(...positionedPrimaryNodes);
  if (!primaryNodes.length) return { x: 0, y: 0 };
  return {
    x: Math.round(center.x - primaryNodes.reduce((sum, node) => sum + Number(node.x), 0) / primaryNodes.length),
    y: Math.round(center.y - primaryNodes.reduce((sum, node) => sum + Number(node.y), 0) / primaryNodes.length)
  };
}

const NATIVE_FALLBACKS = (() => {
  const skills = migrateLegacyPage(LEGACY_TALENT_TREES.skills, LEGACY_TALENT_TREE_ROOTS.skills);
  const magic = migrateLegacyPage(LEGACY_TALENT_TREES.magic, LEGACY_TALENT_TREE_ROOTS.magic);
  const center = { x: TALENT_TREE_CANVAS.width / 2, y: TALENT_TREE_CANVAS.height / 2 };
  translateTreePage(skills.page, center.x - skills.root.x, center.y - skills.root.y);
  translateTreePage(magic.page, center.x - magic.root.x, center.y - magic.root.y);
  return {
    roots: Object.freeze({ skills: { ...skills.root, ...center }, magic: { ...magic.root, ...center } }),
    skills: Object.freeze(skills.page),
    magic: Object.freeze(magic.page)
  };
})();

export const VEILRUNNER_TALENT_TREES = Object.freeze({ skills: NATIVE_FALLBACKS.skills, magic: NATIVE_FALLBACKS.magic });
export const VEILRUNNER_TALENT_TREE_ROOTS = NATIVE_FALLBACKS.roots;

function validPage(page) {
  return Array.isArray(page) && (page.length === 0 || page.every(school => Array.isArray(school?.practices)));
}

/** Convert legacy saved tree coordinates to native 3840x2160 canvas pixels. */
export function migrateTalentTreeLayout(source = {}) {
  const saved = source && typeof source === "object" ? clone(source) : {};
  if (Number(saved.layoutVersion) === TALENT_TREE_LAYOUT_VERSION) {
    return {
      ...saved,
      layoutVersion: TALENT_TREE_LAYOUT_VERSION,
      roots: clone(saved.roots ?? VEILRUNNER_TALENT_TREE_ROOTS),
      skills: validPage(saved.skills) ? saved.skills : clone(VEILRUNNER_TALENT_TREES.skills),
      magic: validPage(saved.magic) ? saved.magic : clone(VEILRUNNER_TALENT_TREES.magic)
    };
  }

  const nativeLayout = Number(saved.layoutVersion) >= 7;
  const migratePage = key => {
    if (!validPage(saved[key])) return { page: clone(VEILRUNNER_TALENT_TREES[key]), root: clone(VEILRUNNER_TALENT_TREE_ROOTS[key]) };
    const root = saved.roots?.[key] ?? LEGACY_TALENT_TREE_ROOTS[key];
    return nativeLayout ? { page: clone(saved[key]), root: clone(root) } : migrateLegacyPage(saved[key], root);
  };
  const skills = migratePage("skills");
  const magic = migratePage("magic");
  const migrated = {
    ...saved,
    layoutVersion: TALENT_TREE_LAYOUT_VERSION,
    roots: { skills: skills.root, magic: magic.root },
    skills: skills.page,
    magic: magic.page
  };
  const center = { x: TALENT_TREE_CANVAS.width / 2, y: TALENT_TREE_CANVAS.height / 2 };
  for (const key of ["skills", "magic"]) {
    const root = migrated.roots[key];
    const rootTranslation = { x: center.x - (Number(root.x) || 0), y: center.y - (Number(root.y) || 0) };
    const repairCenteredPage = [8, 9].includes(Number(saved.layoutVersion)) && !rootTranslation.x && !rootTranslation.y;
    const translation = repairCenteredPage
      ? inferCenteredPageTranslation(migrated[key], key, center)
      : rootTranslation;
    translateTreePage(migrated[key], translation.x, translation.y);
    Object.assign(root, center);
    if (["large", "standard"].includes(root.size?.preset)) root.size = { ...root.size, preset: "medium" };
  }
  for (const page of [migrated.skills, migrated.magic]) for (const node of pageNodes(page)) {
    if (["large", "standard"].includes(node.size?.preset)) node.size = { ...node.size, preset: "medium" };
  }
  return migrated;
}

