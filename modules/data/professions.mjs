export const VEILRUNNER_PROFESSIONS = [
  {
    "name": "Berserker",
    "summary": "Berserkers harness innate bodily energy and push beyond normal mortal limits. They excel in close quarters and deliver powerful strikes.",
    "disciplines": [
      {
        "name": "Warrior",
        "summary": "A rage-based martial combatant that escalates close-quarters fights with deadly force and aggression.",
        "primaryWeapon": "Great Axe",
        "primaryAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusAttributes": [
          "Agility",
          "Strength"
        ],
        "bonusSkill": "Rage",
        "persona": [
          "Ruthless",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Last Word",
            "type": "Reaction",
            "text": "Make a decisive strike when a foe tries to leave your reach. The strike deals one higher damage threshold, triples critical damage, and increases your damage by 1d8 for the next round. Once per Field Recovery."
          }
        ],
        "background": "Born from oppression, the systems that used to control the Warrior instead forged them into an individual that was far more dangerous. Warriors transform their raw pain, fury, and defiance into an unwavering resolve. Every scar is a reminder to the Warrior of what was taken, each battle a chance to emerge stronger. Warriors are often referred to as the modern-day barbarian of legends.\n\nThe Warrior is a force that grows stronger with every strike feeding their fury. Each successful attack, their momentum grows pushing the limit of their body and mind allowing execution of devastating techniques. Once a warrior commits to combat, few can halt their relentless force until victory is claimed or their target concedes."
      },
      {
        "name": "Reaver",
        "summary": "A martial combatant that turns damage taken into stamina and uses pain to fuel stronger fighting.",
        "primaryWeapon": "Great Sword",
        "primaryAttributes": [
          "Strength",
          "Wisdom"
        ],
        "bonusAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusSkill": "Toughness",
        "persona": [
          "Ruthless",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Bleeding Endurance",
            "type": "Trait",
            "text": "When taking physical damage, convert 10% of damage taken to stamina, or 20% while below half health. Resisted damage is not converted."
          },
          {
            "name": "Last Stand",
            "type": "Reaction",
            "text": "Gain temporary HP equal to 20% of maximum HP until the end of your next turn when facing a killing blow. If you defeat a target before then, the temporary HP becomes normal HP. Once per long rest."
          }
        ],
        "background": "Reavers are those who've endured endless torment, drowned in their own blood, and have chosen to be reborn as true masochists. A reckless ferocity burns in their veins, running to the forefront of any assault then turning every wound and infliction into a force to strike back seven-fold.\n\nThe joy of agony keeps their will to fight alight. Their bloodied face smiling and laughing, instilling fear into enemies. Wherever a Reaver roams, expect a river of blood and the cursing of clerics on the wind."
      }
    ]
  },
  {
    "name": "Gymnast",
    "summary": "Gymnasts are flexible, dexterous, and agile specialists who move through cities, wilds, and difficult spaces with finesse.",
    "disciplines": [
      {
        "name": "Runner",
        "summary": "An agile courier and escape specialist who excels at covering distance and staying ahead of pursuit.",
        "primaryWeapon": "Unarmed",
        "primaryAttributes": [
          "Agility",
          "Reaction"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Perception"
        ],
        "bonusSkill": "Disarm",
        "persona": [
          "Individual",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Trained Runner",
            "type": "Trait",
            "text": "Gain 4m bonus movement every turn."
          },
          {
            "name": "Improved Awareness",
            "type": "Trait",
            "text": "Gain +2 Perception."
          }
        ],
        "background": "Runners are the backbone of any settlement, traversing information and not so legal packages for clients. Runs require Runners to move fast and quietly. City Runners are masters of parkour using the urban jungle to their advantage. In the lesser developed regions Runners rely on the environment of their landscape to stay hidden. If there are any disruptions the runner must flee as quickly as they possibly can. While not trained in specific weaponry Runners can disarm their opponents as they make their hasty escape."
      },
      {
        "name": "Acrobat",
        "summary": "A nimble specialist in maneuverability and flexibility who moves through difficult spaces with ease.",
        "primaryWeapon": "Finesse",
        "primaryAttributes": [
          "Dexterity",
          "Agility"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Agility"
        ],
        "bonusSkill": "Escape",
        "persona": [
          "Empathetic",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Trained Gymnast",
            "type": "Trait",
            "text": "Gain +3 to Athletics dice roll results."
          },
          {
            "name": "Improved Maneuverability",
            "type": "Trait",
            "text": "Difficult terrain, crates, rubble, and similar obstacles do not impede your movement."
          }
        ],
        "background": "Acrobats are the lesser known Gymnast. This is due to their slippery nature of getting away even if they are captured. Formative years of many Acrobats have been spent in advanced gymnastics with many having cross trained across dance, swimming, vaulting, ice skating or other popular sports.\n\nAcrobats are untrained with specific weapons, however they tend to favor chakrams which can be thrown and return to the Acrobat with enough practice. Chakrams may have glyphs upon them for additional effects."
      }
    ]
  },
  {
    "name": "Martial Artist",
    "summary": "Martial Artists refine body, discipline, and precision through combat traditions passed down across generations.",
    "disciplines": [
      {
        "name": "Monk",
        "summary": "A martial combatant practicing fast, low-powered unarmed strikes, with or without hand weapons.",
        "primaryWeapon": "Unarmed Strikes",
        "primaryAttributes": [
          "Dexterity",
          "Agility"
        ],
        "bonusAttributes": [
          "Agility",
          "Intelligence"
        ],
        "bonusSkill": "Endurance",
        "persona": [
          "Collectivist",
          "Empathetic"
        ],
        "abilities": [
          {
            "name": "Inner Calm",
            "type": "Ability",
            "text": "Remove emotional conditions as if critically successful and heal 1d8 + Wisdom HP. Twice per Field Recovery."
          }
        ],
        "background": "The traditions of the Monk have been passed down for generations. Upon taking the oath of their tradition these individuals forgo material needs in priority of finding inner peace and have sworn to only act in defense of others or to restore stability and balance across reality. Monks are generally pacifistic preferring to prevent unnecessary bloodshed whenever possible. Monks and Druids coexist in Monasteries throughout the galaxy. These two groups rely on each other for their communities instead of purchasing corporate products when necessary.\n\nThe Monk has honed their inner strength focusing on lightning fast strikes moving from target to target in split seconds. With additional training they are able to harness magic to augment their strikes. Monks aim to subdue or incapacitate before taking a life."
      },
      {
        "name": "Fist Fighter",
        "summary": "A slow, heavy-hitting martial combatant who grapples, throws, trips, and pins foes.",
        "primaryWeapon": "Melee",
        "primaryAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusSkill": "Grapple",
        "persona": [
          "Ruthless",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Second Wind",
            "type": "Reaction",
            "text": "When lethal damage would knock you out, prevent the lethal result and set your HP to 1 after the attack resolves. Once per long rest."
          }
        ],
        "background": "The Fist Fighter uses a form of martial arts styles that started as Bar-fighting, Boxing, Karate, Jujitsu and Sumo Wrestling in 20th century Terra Prime and evolved into its own martial art called Gio Feign. Gio Feign training has the Fist Fighter learning to endure being hit despite the exhaustive nature of the Martial Art allowing them to get a second wind. Staples of Gio Feign include grappling, throwing, tripping or intimidating their opponent. Gio Feign is popular among the Planetary Union with training facilities dotting the cityscapes throughout the galaxy.\n\nFist Fighter gets up close and personal using the tactics of Gio Feign to manipulate the moment using their target's strength against them and pin them down. Their advantage often leaves their opponent beaten and humiliated in a crowd."
      }
    ]
  },
  {
    "name": "Vanguard",
    "summary": "Vanguards protect allies by drawing attacks and fire. They rely on physical shields, heavy armor, and energy shields.",
    "disciplines": [
      {
        "name": "Shield Guardian",
        "summary": "An immovable defender who holds position against assaults and protects nearby allies.",
        "primaryWeapon": "Heavy Shield",
        "primaryAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusSkill": "Shield Bash",
        "persona": [
          "Ruthless",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Extended Shifting Block",
            "type": "Trait",
            "text": "With a shield equipped, shift into place when an ally is attacked. Your shifting block range increases by reach + 4m and you may shift the ally up to your reach."
          },
          {
            "name": "Steel Resolve",
            "type": "Ability",
            "text": "With a shield equipped, resist half damage rounded down for the next round. Twice per Field Recovery."
          }
        ],
        "background": "Shield Guardians are referred to as the immovable defender. Once entrenched into a position they will hold at any cost. Once a Division of Shield Guardians has entrenched a position the opposition has limited amount of time before they encroach upon their position bringing judgment to those that oppose them. Shield Guardians proudly wear scars from where they held the line against all odds. Unable to return to civilian life, Shield Guardians find themselves looking for a thrill."
      },
      {
        "name": "Paladin",
        "summary": "A defender using vitalism and divine magic to augment defense and restore allies.",
        "primaryWeapon": "Sword & Light Shield",
        "primaryAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusAttributes": [
          "Reaction",
          "Intelligence"
        ],
        "bonusSkill": "Throw Shield",
        "persona": [
          "Empathetic",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Reprisal",
            "type": "Ability",
            "text": "With a shield equipped, retaliate after blocking a melee attack. The strike uses the current round's multi-attack penalty and costs no action or reaction."
          }
        ],
        "background": "Paladins are the stalwart protectors of the galaxy and belong to the Galactic Federation. Anyone interested in a Division that specializes in defending civilians can join the Paladins. Through brutal training frail individuals are reforged into reliable defenders. Paladins are quickly trained to use heals and shields. While magic can be used in a pinch, Paladins' strength comes from their versatility.\n\nThe GPD sends Paladins across the galaxy to handle smaller nuisances. Nuisances can be as simple as stepping in for a local conflict between settlements, restoring infrastructure, or more intensive nuisances such as evacuating citizens from Qeamite invasions.\n\nDedication between Paladins is near unbreakable. The bonds between Paladins last for life, being recognizable for many years after completing service to the GPD. A GPD veteran is still a force to be reckoned with."
      }
    ]
  },
  {
    "name": "Duelist",
    "summary": "Duelists are blade masters, often hired for clean work by megacorps and fixers.",
    "disciplines": [
      {
        "name": "Assassin",
        "summary": "A melee combatant who exploits weak targets and deals heavy damage to badly injured enemies.",
        "primaryWeapon": "Short Blades",
        "primaryAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusSkill": "Disarm",
        "persona": [
          "Individual",
          "Ruthless"
        ],
        "abilities": [
          {
            "name": "Assassinate",
            "type": "Action >>",
            "text": "With a short blade, strike a badly injured target with no active armor, shields, or barrier. Outcomes scale from contested state to triple critical damage. Three uses per long rest."
          }
        ],
        "background": "Assassins are lone wolves operating in the shadows. When a fixer gives the order for a cleaning crew the Assassin is the first one to show up.\n\nAssassins stalk their target waiting for the most opportune time to strike. Moving through the shadows, silently they sneak upon their prey, often cornered in an alley way away from prying eyes. It is here they deliver a single strike exacting death in a singular moment. It is here the Assassin completes their contract for their fixer, just another job done for credits."
      },
      {
        "name": "Samurai",
        "summary": "A long-blade specialist trained to disable shields and end fights with precise strikes.",
        "primaryWeapon": "Long Blades",
        "primaryAttributes": [
          "Dexterity",
          "Strength"
        ],
        "bonusAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusSkill": "Long Blades",
        "persona": [
          "Empathetic",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Disabling Holshi Shatter",
            "type": "Action >>",
            "text": "With a short blade, strike a Holtzman shield. Outcomes range from no effect to bypassing and disabling the shield for 1d4 or 2d4 turns. Three uses per long rest."
          }
        ],
        "background": "Samurai is a term that has been passed down from feudal Japan on Terra Prime, and has taken on new meaning throughout the centuries. Their training leads them to only strike when absolutely necessary, often preferring surrender to taking their opponent's life.\n\nSamurai gain their proficiency through years of training and patience. Samurai are specialists of long blades and experts with short blades, being able to deal exacting strikes and excel in slashing and piercing damage. With precise strikes they can disable a Holtzman shield in a single blow. This trained specialist is paramount when dealing with advanced shields."
      }
    ]
  },
  {
    "name": "Field Technician",
    "summary": "Field Technicians solve problems with chemistry, companions, explosives, and emergency medical work.",
    "disciplines": [
      {
        "name": "Chemist",
        "summary": "A field crafter who can synthesize toxins and create dangerous chemical tools on the fly.",
        "primaryWeapon": "Combustibles",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Focus"
        ],
        "bonusSkill": "Chemistry",
        "persona": [
          "Ruthless",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Improvised Toxin Grenade",
            "type": "Action >>",
            "text": "Create an Improved Toxin Grenade during an excursion and roll 1d10 for quality. Twice per Field Recovery."
          },
          {
            "name": "Mad Scientist",
            "type": "Trait",
            "text": "When crafting a chemical item, increase quality by 2 and produce a second item of the same quality without extra materials."
          }
        ],
        "background": "Often spending most of their time in a lab, Chemists work for long hours creating their perfect concoction. When drafted into a battlefield, they will find whatever components they need to synthesize toxins. Trained Chemists can clear an entire garrison with a single toxin grenade. When not on the battlefield, you may find a Chemist holed up in a vehicle creating something with a bit of an edge."
      },
      {
        "name": "Beast Tamer",
        "summary": "A creature handler who can pacify hostile beasts and benefit from a companion's senses.",
        "primaryWeapon": "Light Firearms",
        "primaryAttributes": [
          "Dexterity",
          "Focus"
        ],
        "bonusAttributes": [
          "Charisma",
          "Perception"
        ],
        "bonusSkill": "Train Creature",
        "persona": [
          "Empathetic",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Overriding Dominance",
            "type": "Action >>",
            "text": "Roll Train Creature + Charisma against a hostile creature. Outcomes range from no effect to pacified, allied, or tamed for the encounter."
          },
          {
            "name": "Enhanced Senses",
            "type": "Trait",
            "text": "With a creature companion summoned, you may use the companion's Perception modifier for tracking, detection, or perception rolls."
          }
        ],
        "background": "Beast Tamers are known for being able to confront wild creatures that attack them, either pacifying them or having the creature turn on its allies. Tamers are usually on less developed worlds finding their next companion."
      },
      {
        "name": "Demolitionist",
        "summary": "An explosive specialist who disarms bombs and turns structural weaknesses into bigger blasts.",
        "primaryWeapon": "Light Firearms",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Focus"
        ],
        "bonusSkill": "Explosives",
        "persona": [
          "Ruthless",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Knack for Disarming",
            "type": "Trait",
            "text": "Add Explosives skill level to disarming rolls against explosives."
          },
          {
            "name": "Sense Structural Weakness",
            "type": "Trait",
            "text": "When placing explosives on artillery, drones, or vehicles with the mechanical trait, add 1d4 explosive damage per Explosives level."
          },
          {
            "name": "Explosives go Boom!",
            "type": "Trait",
            "text": "Gain +2d6 damage with explosives, and add Explosives level to attack rolls using explosive weapons or ammunition."
          }
        ],
        "background": "Demolitionists are explosive experts. Watching things go boom is a favorite pastime of Demolitionists. In the distance you can hear the explosions of nitroglycerin with foliage bursting various directions. While in the field Demolitionists are treated with caution as it is unknown when you will hear explosions."
      },
      {
        "name": "Combat Medic",
        "summary": "A battlefield healer who keeps allies fighting with emergency stims and medical equipment.",
        "primaryWeapon": "Light Firearms",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Wisdom"
        ],
        "bonusSkill": "Healing Touch",
        "persona": [
          "Empathetic",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Trained Medic",
            "type": "Trait",
            "text": "Your time treating patients has given you real world experience. Administering medicine and treating wounds is something you can do quickly. You gain +3 to Medicine checks. You gain an additional hit point of healing for each level of Medicine that you take."
          },
          {
            "name": "Emergency Stim",
            "type": "Reaction",
            "text": "Administer urgent aid when an ally is attacked or wounded, giving them a chance to keep fighting."
          }
        ],
        "background": "Combat Medics are deployed with the Assault Corps of the military for the Galactic Federation. Most of the time Stormtroopers are brought to the on site medical facility where combat medics treat wounds that are gained in battles. Every so often when moving the forward base, Combat Medics are required to operate in the field with their brethren. When their brethren are attacked and wounded, quick thinking the Combat Medic administers stims giving their allies a chance to keep fighting and secure the area.\n\nAfter their tour of duty, Combat Medics usually transition to the private sector medical industry. If they are unable to secure employment, venturing into the gray markets is the next choice of employment for the Combat Medic."
      }
    ]
  },
  {
    "name": "Marksman",
    "summary": "Marksmen leave their mark with projectile weapons and often specialize in a favored style of firearm or bow.",
    "disciplines": [
      {
        "name": "Sniper",
        "summary": "A long-range combatant who sets up, hides, and strikes targets moving through chosen lanes.",
        "primaryWeapon": "Long Arms",
        "primaryAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusSkill": "Long Arms",
        "persona": [
          "Ruthless",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Camouflaged",
            "type": "Trait",
            "text": "With active camouflage, strikes against your target are considered off-guard."
          },
          {
            "name": "Extended Range",
            "type": "Trait",
            "text": "With a long arm equipped, gain +20m range on strikes."
          }
        ],
        "background": "Snipers are renowned for their patience and ability to operate in extreme conditions for extended periods of time. As soon as a Sniper accepts a contract, they will wait for their target to arrive before firing a singular decisive shot. Their patience often leads them to landing juicy contracts that pay them very well for their time out in the field. Snipers are the prime candidates of fixers who work for corporations who want a job done quickly and unseen. In a team environment they provide covering fire for teammates picking off any targets that dare to engage."
      },
      {
        "name": "Ranger",
        "summary": "A versatile medium-range attacker whose flexibility comes from specialized arrows.",
        "primaryWeapon": "Bow",
        "primaryAttributes": [
          "Dexterity",
          "Agility"
        ],
        "bonusAttributes": [
          "Charisma",
          "Dexterity"
        ],
        "bonusSkill": "Bows",
        "persona": [
          "Empathetic",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Successive Arrows",
            "type": "Action >>",
            "text": "With a bow equipped, fire three declared arrows. Attacks count toward attack penalty, but the penalty applies after the action completes. Three uses per Field Recovery."
          }
        ],
        "background": "Prior to becoming a Ranger, many individuals have tried to get their five minutes of fame on the Galactic Video Feed. It is unknown what drives these individuals to become Rangers, but there is an uncanny correlation between influencers who become Rangers. The Galactic Federation tolerates these unruly individuals due to the combined successive effort of the Ranger's Guild to combat ecological terror. Rangers have helped maintain ecological order within national parks throughout the centuries.\n\nDuring their free time they are often found in taverns having a good time boasting stories of wild adventures they have been on, that is if they are to be believed. One common legend states that a lone ranger successfully captivated a dragon on charisma alone before taking its hoard of treasures. The Galactic Federation does not condone such acts and exercises the right to exile any individual that partakes in such act."
      },
      {
        "name": "Stormtrooper",
        "summary": "A trained soldier who keeps moving between cover while firing assault rifles.",
        "primaryWeapon": "Assault Rifles",
        "primaryAttributes": [
          "Dexterity",
          "Reaction"
        ],
        "bonusAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusSkill": "Assault Rifles",
        "persona": [
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Run & Gun",
            "type": "Trait",
            "text": "With an assault rifle equipped, making an attack roll while sprinting does not end your sprint."
          },
          {
            "name": "Momentum",
            "type": "Trait",
            "text": "When sprinting, roll 2d4 and add the result in meters rounded up to your sprint distance."
          }
        ],
        "background": "The Military is under the direct orders of the appointed Federation Commander. The Assault Corps is one of the branches of the Military Division. Stormtroopers in the Assault Corps are the first line of defense against incursions into Federation territory.\n\nDuring a Stormtrooper's tour of duty they often see species from uncharted regions. Per the Galactic Federation, Chisnoids should be avoided at any cost. Coming into contact with a Chisnoid, the order for retreat is immediately given. Countless numbers of Stormtroopers have been Uplifted and lost to the Chisnoid threat.\n\nA rare occurrence is coming across an extra-dimensional being. Any Stormtrooper who has come across one of these phantasms says that it is a death sentence. Creatures of fire, mana, shadow, and dreams haunt the Stormtroopers that have encountered them."
      },
      {
        "name": "Shocktrooper",
        "summary": "A heavy-weapons specialist suited to explosive encounters, suppressive fire, and battlefield hardware.",
        "primaryWeapon": "Heavy Machine Guns",
        "primaryAttributes": [
          "Strength",
          "Reaction"
        ],
        "bonusAttributes": [
          "Strength",
          "Focus"
        ],
        "bonusSkill": "Heavy Machine Guns",
        "persona": [
          "Ruthless",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Braced Firing",
            "type": "Trait",
            "text": "If you have not moved this round, add +3 to attack rolls."
          },
          {
            "name": "This is My Weapon Now!",
            "type": "Action >>",
            "text": "Take control of or repurpose a stationary weapon or drone emplacement against your enemies."
          }
        ],
        "background": "Shocktroopers are part of the Galactic Federation's Military. Tours of duty may have included planetary invasion or riot control. The foils of destruction lead them to be called to an explosive combat encounter turning the tide of a battle at a moment's notice. Once in combat they lay down suppressive fire and dismount stationary drones that enemies have laid down. Upon picking up the drone, you can hear the cackling laugh as they turn the once stationary weapon on their enemies. Once a term has completed Shocktroopers often sign up for corporate conflicts."
      }
    ]
  },
  {
    "name": "Amplifier",
    "summary": "Amplifiers enhance themselves and allies while inhibiting enemies with specialized intrinsic magic.",
    "disciplines": [
      {
        "name": "Synergist",
        "summary": "A team-focused caster who enhances allies, debuffs enemies, and manipulates tempo.",
        "primaryWeapon": "Afflictions",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Focus",
          "Wisdom"
        ],
        "bonusSkill": "Haste",
        "persona": [
          "Individual",
          "Ruthless"
        ],
        "abilities": [
          {
            "name": "Expanded Synergy",
            "type": "Ability",
            "text": "When casting a spell with the buff trait on an ally, also apply it to yourself or another ally at half mana cost rounded up. Three uses per Field Recovery."
          },
          {
            "name": "Efficient Afflictions",
            "type": "Trait",
            "text": "Spells with the debuff trait gain +1 effective level, without exceeding maximum spell level."
          }
        ],
        "background": "Synergists often work in teams. Their abilities to enhance allies and inhibit their targets leaves every organization and group wanting a Synergist.\n\nA Synergist usually learns to tap into magic from a moment of extreme desperation. The fear that they experience lends to them being able to feel the strings of magic. Upon feeling the strings for the first time, reality around them appears to move at an affiau's pace. This fear that they have manifested has the Synergist become ruthless, either standing up for whatever personal cause they may have or for their own benefit. Since the onset of magic there have been increasing reports of law officials meeting their untimely demise."
      },
      {
        "name": "Augmenter",
        "summary": "A self-enhancing caster who adapts by augmenting core abilities with magic.",
        "primaryWeapon": "Varies",
        "primaryAttributes": [
          "Intelligence",
          "Wisdom"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Strength"
        ],
        "bonusSkill": "Resist Damage",
        "persona": [
          "Empathetic",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Enhanced Augmentation",
            "type": "Trait",
            "text": "When casting an augmentation spell on yourself, choose Potency, Duration, or Duplication. Only one enhanced augmentation can be active at a time."
          }
        ],
        "background": "Augmenters split off from early Berserkers. Instead of using their rage to enhance their abilities they learned to use magic. This shift in philosophy made them much more adaptable to situations by augmenting their core abilities.\n\nAugmenters shift their focus from melee attacks to ranged assaults using augmentation magic. New Augmenters start by learning to resist damage. The path to becoming experienced is arduous for the Augmenter. An experienced Augmenter is a nightmare in the living flesh. The Galactic Federation sends these individuals as one or two person teams to deal with discrete issues. Before knowing what has happened, encampments lay in ruin with the best guess that it was done by someone that was unable to handle their cyberware."
      }
    ]
  },
  {
    "name": "Cleric",
    "summary": "Clerics are devout religious advocates who heal, defend, spread faith, and sometimes enforce doctrine.",
    "disciplines": [
      {
        "name": "Priest",
        "summary": "A holy support caster focused on healing allies and damaging undead with vitality.",
        "primaryWeapon": "Staff",
        "primaryAttributes": [
          "Wisdom",
          "Focus"
        ],
        "bonusAttributes": [
          "Intelligence",
          "Wisdom"
        ],
        "bonusSkill": "Healing Touch",
        "persona": [
          "Collectivist",
          "Empathetic"
        ],
        "abilities": [
          {
            "name": "Pray",
            "type": "Sustained Action >>",
            "text": "Chant in prayer, consuming 10 stamina each combat round. Heal creatures within 10m for 2d8 + Wisdom HP at the end of your turn; undead instead take vitality damage with a Wisdom save."
          }
        ],
        "background": "Priests are often respected members of clergy to their religions. When not preoccupied with their holy duties, a Priest can often be found within their community healing the sick and wounded. These individuals are often considered paragons within their communities, housing the unfortunate, and caring for those in need."
      },
      {
        "name": "Adjudicator",
        "summary": "An offensive church warrior who fights at the front with a great hammer and divine protection.",
        "primaryWeapon": "Great Hammer",
        "primaryAttributes": [
          "Strength",
          "Intelligence"
        ],
        "bonusAttributes": [
          "Strength",
          "Wisdom"
        ],
        "bonusSkill": "Divine Bolt",
        "persona": [
          "Ruthless",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Divine Veil",
            "type": "Ability",
            "text": "Become immune to non-lethal physical damage for 1d4 rounds. After it fades, roll 2d10 days before your deity answers again."
          }
        ],
        "background": "Adjudicators are feared warriors of the churches that they represent. When a religious crusade is declared, Adjudicators are the harbingers of destruction in their deity's name. If the population does not convert to the church's religion, Adjudicators suppress or decimate anyone who does not submit.\n\nThe Galactic Federation allows adjudicators to carry out their duties under the proclamation of religious freedom. This has resulted in multiple planetary systems operating under a theological monarchy. As long as resources and credits are sent to the Galactic Federation, theological dynasties are free to operate as they will.\n\nThe Galactic Federation does its best to maintain peace with theological planetary systems as to not become strained into a holy war with Adjudicators. The Galactic Federation keeps the status quo for the time being."
      }
    ]
  },
  {
    "name": "Conjurer",
    "summary": "Conjurers call spirits, illusions, phantasms, and other willing entities into reality.",
    "disciplines": [
      {
        "name": "Summoner",
        "summary": "A spirit caller who summons beings for tasks, reconnaissance, and combat assistance.",
        "primaryWeapon": "Foci",
        "primaryAttributes": [
          "Wisdom",
          "Focus"
        ],
        "bonusAttributes": [
          "Intelligence",
          "Wisdom"
        ],
        "bonusSkill": "Summon Eidolon",
        "persona": [
          "Individual",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Established Connection",
            "type": "Trait",
            "text": "When summoning a spirit, gain +1 to the summoning roll for every five character levels."
          },
          {
            "name": "Innate Connection",
            "type": "Trait",
            "text": "Reduce the number of actions required to summon a spirit by one."
          }
        ],
        "background": "Hunted by theological institutions, Summoners are always on the run. Their ability to summon entities from other dimensions have been declared heresy by a majority of theological institutions.\n\nThe Grand Church of Elatashi declared that all acts of summoning the dead unethical and heresy in 138 GE. After the declaration Summoners have been running from the pursuit of Holy Clerics sent by the Grand Church. Most Summoners operate on their own. Occasionally they will operate within a group that they can trust. That trust does not come easy from a Summoner as they place their life in the hands of allies."
      },
      {
        "name": "Illusionist",
        "summary": "A caster who creates illusions and phantasms to misdirect, frighten, and influence enemies.",
        "primaryWeapon": "Light Firearms",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Agility",
          "Intelligence"
        ],
        "bonusSkill": "Conjure Illusion",
        "persona": [
          "Individual",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Signature Illusions",
            "type": "Trait",
            "text": "Choose a favored illusion type. Gain +2 to Illusion rolls with that type, and extend duration by +1 round for every ten character levels."
          },
          {
            "name": "Unnerved",
            "type": "Trait",
            "text": "Gain +1 to Wisdom or Perception saves against illusions for every five character levels."
          }
        ],
        "background": "Illusionists often wander the streets on their lonesome. While they are tolerated more than the summoner, there is still significant disdain for summoners with many using their illusions to survive in the corporate zones that they travel. It is only a matter of when, not if an illusionist is caught by corporate law enforcement. This could be for something like trying to steal food to survive. Using illusions to have the security detail run into what appears a full team is usually enough for the illusionist to make their escape to survive another day."
      }
    ]
  },
  {
    "name": "Druid",
    "summary": "Druids commune with nature and stabilize Aether disrupted by corporations and reckless magic users.",
    "disciplines": [
      {
        "name": "Shapeshifter",
        "summary": "A fauna-form specialist who attacks, intimidates, communicates, and navigates as animals.",
        "primaryWeapon": "Animal Forms",
        "primaryAttributes": [
          "Wisdom",
          "Strength"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Wisdom"
        ],
        "bonusSkill": "Fauna Speak",
        "persona": [
          "Individual",
          "Criminal"
        ],
        "abilities": [
          {
            "name": "Commune with Fauna",
            "type": "Trait",
            "text": "Communicate with fauna as if speaking your native language, limited by your current form."
          },
          {
            "name": "Hastened Shapeshifting",
            "type": "Trait",
            "text": "When shifting into animal form, roll 1d6 and reduce the action point cost by the result."
          }
        ],
        "background": "Druids that shapeshift are generally known as Shapeshifters to the rest of the galaxy. Their ability to shift their form comes natural to them. They have been known to take the forms of smaller critters to even portraying something as large as a greater dragon.\n\nShapeshifters take fauna forms to communicate with other fauna gleaning information that otherwise may not have been noticed. They also use their fauna forms to increase their senses preparing for danger, before danger can come to the enclave. A shapeshifter will lay down their life for their community. Fear bleeds into the eyes of those that dare to attack."
      },
      {
        "name": "Cultivator",
        "summary": "An arbormancy caster who uses flora to control movement, cause conditions, and defend enclaves.",
        "primaryWeapon": "Staff",
        "primaryAttributes": [
          "Intelligence",
          "Wisdom"
        ],
        "bonusAttributes": [
          "Agility",
          "Intelligence"
        ],
        "bonusSkill": "Reading of Roots",
        "persona": [
          "Empathetic",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Resplendent Flora",
            "type": "Ability",
            "text": "When flora is available, gain +10 to attack rolls for floral abilities and spells, plus 1d6 floral damage for every five character levels. Once per long rest."
          },
          {
            "name": "Green Thumb",
            "type": "Trait",
            "text": "When casting a spell with the floral trait, gain +1 to the attack roll for every five character levels."
          }
        ],
        "background": "Druids that are Cultivators generally stay within the established enclave. Their abilities are used to provide for the enclave nourishment and defense from intruders if it is ever needed. On the rare occasion that a Cultivator does leave the enclave, it is usually due to being exiled. Druids do not tolerate unnecessary violence of their craft unless absolutely necessary. Cultivators that leave their enclave are generally labeled as ecological terrorists as they swarm areas with vines, plants, and other flora."
      }
    ]
  },
  {
    "name": "Elemental Adept",
    "summary": "Elemental Adepts train in schools of elemental magic to alter reality through water, earth, fire, air, steel, or all elements.",
    "disciplines": [
      {
        "name": "Geo Adept",
        "summary": "A geomancer who alters the ground for crowd control and defensive magic.",
        "primaryWeapon": "Geo Magic",
        "primaryAttributes": [
          "Intelligence",
          "Strength"
        ],
        "bonusAttributes": [
          "Agility",
          "Intelligence"
        ],
        "bonusSkill": "Reading of Stone",
        "persona": [
          "Individual",
          "Ruthless"
        ],
        "abilities": [
          {
            "name": "Geo Affinity",
            "type": "Trait",
            "text": "Geo spells gain +5 to attack rolls, +1 more every 10 levels, and +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "Geo Adepts hail from the planet Kadion. With its vast mountainous ranges, steep ravines, and endless deserts Kadions quickly adapted to the terrain before their agricultural revolution. The first Geo Adepts used their abilities to carve out sections of the soil to make way for small buildings.\n\nAs geomancy became more known, the villages erupted into what is known as the Thousand Year War. Geomancy was used to slaughter entire villages as landslides were created. What remained of the four great houses of Kadion, each taking one of the major continents at the end of the war. With the treaty signed, each great house revered using Geomancy as a sacred art. Students must pass exams from all houses to be granted the rank of adept."
      },
      {
        "name": "Aqueous Adept",
        "summary": "A hydromancer who changes the flow and shape of water-based liquids.",
        "primaryWeapon": "Hydro Magic",
        "primaryAttributes": [
          "Intelligence",
          "Dexterity"
        ],
        "bonusAttributes": [
          "Agility",
          "Intelligence"
        ],
        "bonusSkill": "Reading of Water",
        "persona": [
          "Empathetic",
          "Collectivist"
        ],
        "abilities": [
          {
            "name": "Hydro Affinity",
            "type": "Trait",
            "text": "Hydro spells gain +5 to attack rolls, +1 more every 10 levels, and +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "Aqueous Adepts originated from the water planet Renviea. The need to prevent the ever increasing ocean levels and river levels found its inhabitants at risk of extinction. When all hope seemed lost, the forgotten hero of Renviea stood on the Spire Coast. The history books lie blank for what happened that day other than it being the turning moment for the people of Renviea. The day lives in legend as the moment that ensured survivals into what is known as the Thousand Year War.\n\nThe people of Renviea have since then learned to connect with their homeworld, guided by the ebbs and flows of the fervent hydro energy connections within the celestial body. As of this day they live in a harmonic relationship with the planet."
      },
      {
        "name": "Air Adept",
        "summary": "An aeromancer who changes wind with a light touch for close-range augmentation and long-range attacks.",
        "primaryWeapon": "Aero Magic",
        "primaryAttributes": [
          "Intelligence",
          "Reaction"
        ],
        "bonusAttributes": [
          "Dexterity",
          "Focus"
        ],
        "bonusSkill": "Air Strike",
        "persona": [
          "Collectivist",
          "Lawful"
        ],
        "abilities": [
          {
            "name": "Air Affinity",
            "type": "Trait",
            "text": "Aero spells gain +5 to attack rolls, +1 more every 10 levels, and +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "During the early ages, knowledge of magic was commonplace on Cetera. Nomadic culture was common place on Cetera for millennia with the Ceteran nomads traveling with the local fauna over vast plains and oceans, often relocating multiple times during a solar year. Not much history is known about the ancient Ceterans due to their nomadic culture.\n\nThe Air Adepts of Cetera have been at odds for the planet's known history with two dominant cultures. The cultures became known as the Abbian Nation and Narian Nation. The Abbian Air adepts hold steadfast to their morals that aeromancy should not be used for harm, only to defend one's community. Narian Air Adepts pursue that the power of magic is theirs to command.\n\nThe two nations have been locked steadfast into the Eternal Conflict of Aeromancy. Millennia has passed with the two nations fighting leaving the once beautiful planet in ruins. What is known as The Fracture, split Cetera in half with the boundaries of the nations. The two halves move together around their sun to this day."
      },
      {
        "name": "Flame Adept",
        "summary": "A pyromancer who shapes sparks and flame into volatile offense.",
        "primaryWeapon": "Pyro Magic",
        "primaryAttributes": [
          "Intelligence",
          "Agility"
        ],
        "bonusAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusSkill": "Firebolt",
        "persona": [
          "Individual",
          "Ruthless"
        ],
        "abilities": [
          {
            "name": "Fire Affinity",
            "type": "Trait",
            "text": "Pyro spells gain +5 to attack rolls, +1 more every 10 levels, and +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "The art of Flame Adepts was developed on the planet of Ezuna. The landmasses of Ezuna are primarily covered with steppes and volcanic ranges. Ezuna was a peaceful planet where its inhabitants sparked the flames of pyromancy to enhance their quality of life. Where once warmth was acquired, basic needs were met. The agricultural and Industrial revolutions of Ezuna occurred effectively overnight. Control and manipulation of fire allowed them to adapt and develop at an accelerated pace compared to species.\n\nLong term peace was albeit, temporary. The overlord, Draegan Rathmore, brought terror to any who crossed his path. Rathmore believed that the power of the flame only belong to those who were strong enough to wield it for the ultimate power. Destruction followed wherever Rathmore went, striking down any lesser overlord who did not swear complete fealty to him. After 10 years of Rathmore's razing of provinces, the lesser firelords began the Fire Crusades of Ezuna. United under a single banner Rathmore took the crown, only to be succeeded by his firstborn son. Rathmore II upon taken the throne instructed that all healthy first born son's must enlist in the Flame Adept Army of Ezuna."
      },
      {
        "name": "Versatile Adept",
        "summary": "A rare master of all elements who adapts to any encounter and blends elements in complex spells.",
        "primaryWeapon": "Elemental Magic",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Intelligence",
          "Dexterity"
        ],
        "bonusSkill": "Elemental Spell",
        "persona": [
          "Ruthless",
          "Individual"
        ],
        "abilities": [
          {
            "name": "Elemental Frenzy",
            "type": "Ability",
            "text": "Increase potency of elemental spells you cast by 1d4 until the end of your next turn. At level 10 and every 10 levels thereafter, increase damage by 1d4 and duration by one round. Once per long rest."
          },
          {
            "name": "Elemental Affinity",
            "type": "Trait",
            "text": "At level 5 and every 5 levels thereafter, spells you cast gain +1d4 elemental damage for each elemental trait on the spell."
          }
        ],
        "background": "Versatile Adepts are rare elemental adepts that master all the elements. It is said that when one masters all the elements that they are able to connect with past Versatile Adepts. The Versatile Adept's strength comes from being able to adapt to any encounter.\n\nExperienced Versatile Adepts greatest strength is seen in a select few when reaching mastery of multiple elements and creating spells that merge elements with exhilarating complexity. Thorne Lawson is legend among Versatile Adepts. It is said that with the snap of his fingers, he can call down flaming comets and level an entire battlefield."
      },
      {
        "name": "Steel Adept",
        "summary": "A metalmancer who bends steel and metal into magical offense and defense.",
        "primaryWeapon": "Metal Magic",
        "primaryAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusAttributes": [
          "Intelligence",
          "Focus"
        ],
        "bonusSkill": "Metal Pinions",
        "persona": [
          "Empathetic",
          "Lawful"
        ],
        "abilities": [
          {
            "name": "Metal Affinity",
            "type": "Trait",
            "text": "Metal spells gain +5 to attack rolls, +1 more every 10 levels, and +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "Metalmancy was once believed to have been an impossible task. Legends say that a blind Geo Adept who was so aligned with the fabric of reality learned to bend and wield the magic of metal at the age of 16. The art of metalmancy being passed down in her family for generations. Once the Great Houses of Kadion became aware of metalmancy, it was declared as blasphemy, a perversion of geomancy. Anyone who dared to use metalmancy was to be sentenced to death.\n\nThe Four Great Houses of Kadion united against this perversion of geomancy hunting down anyone suspected of using metalmancy. 100 years of genocide left the remaining Steel Adepts few in number. As a last attempt, they left the planet using their forbidden art.\n\nMetalmancy and Steel Adepts have since then thrived on the planet of Azuno. With geomancy and metalmancy at the tips of their fingers, entire cities of Steel were erected covering the entire planet over the course of a few centuries. The people of Azuno consider their way of life safe given their technological advances that were achieved over a short period of time."
      }
    ]
  },
  {
    "name": "Magus",
    "summary": "Magus are magic users who learned their arts through non-conventional means. These outcasts are often scrutinized more than their Magic Archetype counterparts, but their craft gives them experience with less approved magic.",
    "disciplines": [
      {
        "name": "Blood Mage",
        "summary": "Blood Mages utilize their own blood to amplify their magic and spells. Their spells cast are primarily offensive magic.",
        "primaryWeapon": "Blood Magic",
        "primaryAttributes": ["Intelligence", "Wisdom"],
        "bonusAttributes": ["Focus", "Intelligence"],
        "bonusSkill": "Blood Bolt",
        "persona": ["Criminal"],
        "abilities": [
          {
            "name": "Tainted Blood",
            "type": "Trait",
            "text": "Your blood has been tainted with aether after countless spells casted with blood magic. Spells casted with blood magic are more potent. Spells casted with the blood magic deal additional +1d4 unsuspected damage at level 5 and every 5 levels thereafter."
          }
        ],
        "background": "Blood Mages are despised and hunted down for execution by the Galactic Federation and The Grand Church of Elatashi. After destroying their phylactery Blood Mages have historically brought rampant destruction across sectors of the galaxy.\n\nThis subset of magic was forbidden after atrocities entered real-space and brought ruin to the galaxy. After the fall of the Galactic Empire, legends say that the remaining survivors slaughtered the intruders and sent them back from whence they came. The vaults that held the forbidden art was lost in the centuries of rampant destruction and violence.\n\nIn 29 GE the lost vaults were uncovered on Oiruta. The return of Blood Magic brought once again brought beings from the dimension of hell to ravage real-space. The Planet Oiruta was quickly overwhelmed as demons, infernal beasts, and other hellspawn wreaked havoc across the planet. May mercy be upon us."
      },
      {
        "name": "Sorcerer",
        "summary": "Sorcerers wield unapproved elemental magic through raw talent and force of will.",
        "primaryWeapon": "Geo Magic",
        "primaryAttributes": ["Intelligence", "Strength"],
        "bonusAttributes": ["Agility", "Intelligence"],
        "bonusSkill": "Reality Bolt",
        "persona": ["Individual", "Ruthless"],
        "abilities": [
          {
            "name": "Geo Affinity",
            "type": "Trait",
            "text": "You have a natural affinity for Geo Magic and may have been able to connect and feel the innate connections of the soil early in life. When casting a spell that has the Geo trait, gain +5 to attack rolls when attempting to strike a target. Your attack bonus increases an additional +1 for every 10 character levels. Additionally, when you cast a spell with the Geo trait, gain an additional +1d8 damage at level 5 and every 5 levels thereafter."
          }
        ]
      }
    ]
  }
];

/** PDF-verified Persona Index modifiers, keyed by profession and discipline. */
export const VEILRUNNER_PERSONA_INDEX_MODIFIERS = Object.freeze({
  "Berserker:Warrior": ["+5 Ruthless", "+5 Criminal"],
  "Berserker:Reaver": ["+5 Ruthless", "+5 Individual"],
  "Gymnast:Runner": ["+5 Individual", "+5 Criminal"],
  "Gymnast:Acrobat": ["+5 Empathetic", "+5 Individual"],
  "Martial Artist:Monk": ["+5 Collectivist", "+5 Empathetic"],
  "Martial Artist:Fist Fighter": ["+5 Ruthless", "+5 Individual"],
  "Vanguard:Shield Guardian": ["+5 Ruthless", "+5 Collectivist"],
  "Vanguard:Paladin": ["+5 Empathetic", "+5 Collectivist"],
  "Duelist:Assassin": ["+5 Individual", "+5 Ruthless"],
  "Duelist:Samurai": ["+5 Empathetic", "+5 Collectivist"],
  "Field Technician:Chemist": ["+5 Ruthless", "+5 Individual"],
  "Field Technician:Beast Tamer": ["+5 Empathetic", "+5 Lawful"],
  "Field Technician:Demolitionist": ["+5 Ruthless", "+5 Individual"],
  "Field Technician:Combat Medic": ["+5 Empathetic", "+5 Lawful"],
  "Marksman:Sniper": ["+5 Ruthless", "+5 Criminal"],
  "Marksman:Ranger": ["+5 Empathetic", "+5 Criminal"],
  "Marksman:Stormtrooper": ["+10 Collectivist"],
  "Marksman:Shocktrooper": ["+10 Collectivist"],
  "Amplifier:Synergist": ["+5 Individual", "+5 Ruthless"],
  "Amplifier:Augmenter": ["+5 Empathetic", "+5 Individual"],
  "Cleric:Priest": ["+5 Collectivist", "+5 Empathetic"],
  "Cleric:Adjudicator": ["+5 Ruthless", "+5 Collectivist"],
  "Conjurer:Summoner": ["+5 Individual", "+5 Criminal"],
  "Conjurer:Illusionist": ["+5 Individual", "+5 Criminal"],
  "Druid:Shapeshifter": ["+5 Individual", "+5 Criminal"],
  "Druid:Cultivator": ["+5 Empathetic", "+5 Collectivist"],
  "Elemental Adept:Geo Adept": ["+5 Individual", "+5 Ruthless"],
  "Elemental Adept:Aqueous Adept": ["+5 Empathetic", "+5 Collectivist"],
  "Elemental Adept:Air Adept": ["+5 Collectivist", "+5 Lawful"],
  "Elemental Adept:Flame Adept": ["+5 Individual", "+5 Ruthless"],
  "Elemental Adept:Versatile Adept": ["+5 Ruthless", "+5 Individual"],
  "Elemental Adept:Steel Adept": ["+5 Empathetic", "+5 Lawful"],
  "Magus:Blood Mage": ["+10 Criminal"],
  "Magus:Sorcerer": ["+5 Individual", "+5 Ruthless"]
});

export function professionDisciplineOptions() {
  return VEILRUNNER_PROFESSIONS.flatMap(profession =>
    profession.disciplines.map(discipline => ({
      value: `${profession.name} - ${discipline.name}`,
      label: `${profession.name} - ${discipline.name}`,
      profession: profession.name,
      discipline: discipline.name
    }))
  );
}

export function findDiscipline(professionName, disciplineName) {
  const profession = VEILRUNNER_PROFESSIONS.find(entry => entry.name === professionName);
  if (!profession) return null;
  const discipline = profession.disciplines.find(entry => entry.name === disciplineName);
  return discipline ? { profession, discipline } : null;
}
