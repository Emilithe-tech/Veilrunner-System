/** Shipped three-tier tree catalog: School -> Practice -> Spell/Skill. */
const spell = (id, name, order, options = {}) => ({
  id, name, order, x: Number(options.x) || 0, y: Number(options.y) || 0,
  shape: ["circle", "hex", "pentagon", "square", "diamond"].includes(options.shape) ? options.shape : (options.type === "ability" ? "hex" : options.type === "trait" ? "circle" : "diamond"),
  type: options.type === "ability" ? "ability" : "action",
  category: options.category ?? "magic", actions: options.type === "ability" ? 0 : (options.actions ?? 1),
  talentCost: options.talentCost ?? 1, rankCost: options.rankCost ?? 1, maxRank: options.maxRank ?? 20,
  requiredLevel: options.requiredLevel ?? 1, requires: options.requires ?? [], traits: options.traits ?? [],
  resourceCosts: options.resourceCosts ?? { mana: 0, stamina: 0, health: 0 }, effects: options.effects ?? [],
  img: options.img ?? "", description: options.description ?? ""
});

const practice = (id, name, x, y, spells = [], options = {}) => ({
  id, name, x, y, shape: ["circle", "hex", "pentagon", "square", "diamond"].includes(options.shape) ? options.shape : "diamond", talentCost: options.talentCost ?? 1, requiredLevel: options.requiredLevel ?? 1,
  requires: options.requires ?? [], color: options.color ?? "", spells: spells.map((entry, index) => ({
    ...entry,
    x: entry.x || (x + 105 + (index - (spells.length - 1) / 2) * 78),
    y: entry.y || (y + 138 + (index % 2) * 44)
  }))
});

const MAGIC_ROOT = Object.freeze({ id: "magic-root", name: "Magic", x: 5000, y: 3500, color: "#d8b4fe", shape: "hex" });
const TALENT_TREE_LAYOUT_VERSION = 6;
const SCHOOL_ANGLES = Object.freeze({ elemental: -90, primal: -30, arcane: 30, spirit: 90, creation: 150, intrinsic: 210 });
const school = (id, name, x, y, color, practices) => {
  const angle = (SCHOOL_ANGLES[id] ?? -90) * Math.PI / 180;
  const target = { x: MAGIC_ROOT.x + Math.cos(angle) * 330, y: MAGIC_ROOT.y + Math.sin(angle) * 330 };
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

export const VEILRUNNER_TALENT_TREES = Object.freeze({
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

export const VEILRUNNER_TALENT_TREE_ROOTS = Object.freeze({ magic: MAGIC_ROOT, skills: { id: "skills-root", name: "Skills", x: 5000, y: 3500, color: "#67e8f9", shape: "hex" } });

export function skillPointCostForLevel(level) {
  return Math.max(1, Math.ceil(Math.max(1, Number(level) || 1) / 10));
}

export function talentTreePage(key) {
  const fallback = VEILRUNNER_TALENT_TREES[key] ?? [];
  const catalog = game.settings?.get?.(game.system.id, "talentTreeCatalog");
  if (!validPage(catalog?.[key])) return fallback;
  return Number(catalog.layoutVersion) === TALENT_TREE_LAYOUT_VERSION ? catalog[key] : migratePageLayout(catalog[key], fallback);
}

export function talentTreeCatalog() {
  const saved = game.settings?.get?.(game.system.id, "talentTreeCatalog") ?? {};
  return {
    layoutVersion: TALENT_TREE_LAYOUT_VERSION,
    roots: foundry.utils.deepClone(Number(saved.layoutVersion) === TALENT_TREE_LAYOUT_VERSION ? (saved.roots ?? VEILRUNNER_TALENT_TREE_ROOTS) : VEILRUNNER_TALENT_TREE_ROOTS),
    skills: validPage(saved.skills) ? foundry.utils.deepClone(Number(saved.layoutVersion) === TALENT_TREE_LAYOUT_VERSION ? saved.skills : migratePageLayout(saved.skills, VEILRUNNER_TALENT_TREES.skills)) : foundry.utils.deepClone(VEILRUNNER_TALENT_TREES.skills),
    magic: validPage(saved.magic) ? foundry.utils.deepClone(Number(saved.layoutVersion) === TALENT_TREE_LAYOUT_VERSION ? saved.magic : migratePageLayout(saved.magic, VEILRUNNER_TALENT_TREES.magic)) : foundry.utils.deepClone(VEILRUNNER_TALENT_TREES.magic)
  };
}

export function talentTreeRoot(key) {
  const saved = game.settings?.get?.(game.system.id, "talentTreeCatalog") ?? {};
  return foundry.utils.deepClone(Number(saved.layoutVersion) === TALENT_TREE_LAYOUT_VERSION ? (saved.roots?.[key] ?? VEILRUNNER_TALENT_TREE_ROOTS[key]) : VEILRUNNER_TALENT_TREE_ROOTS[key]);
}

function validPage(page) {
  return Array.isArray(page) && (page.length === 0 || page.every(school => Array.isArray(school?.practices)));
}

function migratePageLayout(savedPage, baselinePage) {
  const result = foundry.utils.deepClone(savedPage);
  for (const baselineSchool of baselinePage) {
    let school = result.find(entry => entry.id === baselineSchool.id);
    if (!school) { result.push(foundry.utils.deepClone(baselineSchool)); continue; }
    Object.assign(school, { x: baselineSchool.x, y: baselineSchool.y, shape: baselineSchool.shape });
    if (school.id === "spirit" && String(school.color ?? "").toLowerCase() === "#22d3ee") school.color = baselineSchool.color;
    school.practices ??= [];
    for (const baselinePractice of baselineSchool.practices ?? []) {
      let practice = school.practices.find(entry => entry.id === baselinePractice.id);
      if (!practice) { school.practices.push(foundry.utils.deepClone(baselinePractice)); continue; }
      Object.assign(practice, { x: baselinePractice.x, y: baselinePractice.y, shape: baselinePractice.shape });
      practice.spells ??= [];
      for (const baselineSpell of baselinePractice.spells ?? []) {
        const spell = practice.spells.find(entry => entry.id === baselineSpell.id);
        if (!spell) practice.spells.push(foundry.utils.deepClone(baselineSpell));
        else Object.assign(spell, { x: baselineSpell.x, y: baselineSpell.y, shape: baselineSpell.shape, maxRank: Math.min(20, Math.max(1, Number(spell.maxRank) || baselineSpell.maxRank)) });
      }
    }
  }
  return result;
}

export async function saveTalentTreeCatalog(catalog) {
  return game.settings.set(game.system.id, "talentTreeCatalog", { ...catalog, layoutVersion: TALENT_TREE_LAYOUT_VERSION });
}
