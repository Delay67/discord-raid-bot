// Compact, conservative class facts. Build labels are included for community vocabulary;
// exact rotations, Ark Grid nodes and balance rankings remain patch-sensitive.
const classEntries = [
  {
    id: "berserker",
    title: "Berserker — verified class overview",
    keywords: ["berserker", "mayhem", "berserker technique", "burst mode", "bloody rush", "dark rush"],
    text: `Berserker is a male Warrior advanced class using a greatsword. He is a melee DPS with strong stagger and a Fury identity that enables Burst Mode. Established build labels are Mayhem, which maintains a transformed low-HP style, and Berserker's Technique, which builds Fury for burst windows. Verified skills include Finish Strike, Hell Blade, Tempest Slash, Sword Storm, Overdrive, Brave Slash, Red Dust, Mountain Crash, Wind Blade and Shoulder Charge. Bloody Rush and Dark Rush are identity-related attacks. Berserk Fury and Chain of Vengeance are Awakening skills.`
  },
  {
    id: "paladin",
    title: "Paladin — verified class overview",
    keywords: ["paladin", "holy aura", "blessed aura", "judgment", "holy sword", "executor sword", "wrath of god", "heavenly blessings"],
    text: `Paladin is a male Warrior advanced class using a sword and holy tome. In group content he is primarily a support, providing branding, attack buffs, shields, damage reduction and healing through Holy Aura; he is not a conventional healer who spams targeted heals. His identity uses the Piety Meter for Sacred Executioner or Holy Aura. Blessed Aura is the established support build label and Judgment the DPS label, though DPS Paladin is generally not the expected raid-support setup. Verified skills include Light Shock, Sword of Justice, Holy Sword, Executor's Sword, Wrath of God, Heavenly Blessings, Godsent Law, Holy Protection, Charge and Light of Judgment. Alithanes's Judgment and Alithanes's Light are Awakening skills.`
  },
  {
    id: "slayer",
    title: "Slayer — verified class overview",
    keywords: ["slayer", "predator", "punisher", "fury meter", "bloodlust", "brutal impact", "volcanic eruption"],
    text: `Slayer is a female Warrior advanced class using a greatsword. She is a melee back-attack DPS whose Fury Meter enables Burst Mode and Bloodlust. Established build labels are Predator, a fast sustained style, and Punisher, a Specialization-oriented burst style. Verified skills include Brutal Impact, Volcanic Eruption, Guillotine, Furious Claw, Final Blow, Wild Stomp, Ground Smash, Mountain Cleave, Punishing Draw, Flash Blade and Wild Rush. Bloodlust is her Burst Mode identity attack. Guillotine is a Slayer skill; Guillotine Swing belongs to Souleater, so do not conflate them.`
  },
  {
    id: "valkyrie",
    title: "Valkyrie — verified class overview",
    keywords: ["valkyrie", "release light", "light of the faithful", "final splendor", "justice", "starlight", "protection", "holy blade"],
    text: `Valkyrie is a female Warrior advanced class using a one-handed sword and Faith Gauge. She can be built as a raid support or DPS. Her identity skills are Release Light (Z) for offensive support and Light of the Faithful (X) for immediate recovery; the DPS path centers burst around Final Splendor. Her skills are categorized as Justice, Starlight and Protection. Verified current names include Final Splendor, Release Light, Light of the Faithful, Requiem Rain, Requiem Ash, Execution of Revelation and Meteor Strike. Do not describe her as merely a gender-swapped Paladin: her identity delivery and faster combat flow differ.`
  },
  {
    id: "wardancer",
    title: "Wardancer — verified class overview",
    keywords: ["wardancer", "first intention", "esoteric skill enhancement", "esoteric orb", "winds whisper", "roar of courage"],
    text: `Wardancer is a female Martial Artist advanced class using elemental martial arts. She is a mobile melee DPS with valuable party synergy and an Esoteric Orb identity. Established build labels are First Intention, which forgoes Esoteric skills, and Esoteric Skill Enhancement, which spends orbs on Esoteric attacks. Verified skills include Wind's Whisper, Roar of Courage, Energy Combustion, Moon Flash Kick, Sweeping Kick, Flash Heat Fang, Sky Shattering Blow, Lightning Kick, Esoteric Skill: Blast Formation, Call of the Wind God and Azure Dragon's Supreme Fist.`
  },
  {
    id: "scrapper",
    title: "Scrapper — verified class overview",
    keywords: ["scrapper", "taijutsu", "shock training", "stamina", "shock", "battering fists", "iron cannon blow"],
    text: `Scrapper is a female Martial Artist advanced class using heavy gauntlets. She is a durable melee/back-attack DPS with strong stagger and destruction. Her identity balances yellow Stamina and green Shock resources. Established build labels are Ultimate Skill: Taijutsu for fast Stamina-skill pressure and Shock Training for slower, heavier Shock skills. Verified skills include Battering Fists, Iron Cannon Blow, Explosive Fist, Dragon Advent, Earthquake Chain, Roundup Sweep, Death Rattle, Supernova, Chain Destruction Fist, Potent Rising Fist, Charging Blow and Fierce Tiger Strike.`
  },
  {
    id: "soulfist",
    title: "Soulfist — verified class overview",
    keywords: ["soulfist", "robust spirit", "energy overflow", "hype", "world decimation", "spirit bomb", "merciless pummel"],
    text: `Soulfist is a female Martial Artist advanced class mixing melee attacks with ranged energy. Her identity is Hype, which temporarily amplifies combat and has multiple levels. Established build labels are Robust Spirit, built around high-impact Hype 3 windows, and Energy Overflow, a sustained low-energy style. Verified skills include Merciless Pummel, Energy Blast, Force Orb, Heavenly Squash, Crippling Barrier, Shadowbreaker, Lightning Palm, Celestial Palm, Tempest Blast and Flash Step. World Decimation—commonly called Spirit Bomb—is an Awakening skill; Annihilating Ray is the other Awakening.`
  },
  {
    id: "glaivier",
    title: "Glaivier — verified class overview",
    keywords: ["glaivier", "control", "pinnacle", "flurry", "focus stance", "red stance", "blue stance", "spear"],
    text: `Glaivier is a female Martial Artist advanced class using a spear/glaive and a Dual Meter. She can switch between blue Flurry stance and red Focus stance. Established build labels are Pinnacle, which uses stance swapping, and Control, which locks out Focus stance for a blue-skill style. Verified skills include Shackling Blue Dragon, Half Moon Slash, Raging Dragon Slash, Wheel of Blades, Chain Slash, Flash Kick, Vault, Thrust of Destruction, Red Dragon's Horn, Starfall Pounce, Spiraling Spear and 4-Headed Dragon.`
  },
  {
    id: "striker",
    title: "Striker — verified class overview",
    keywords: ["striker", "deathblow", "esoteric flurry", "esoteric orb", "lightning tiger strike", "tiger emerges"],
    text: `Striker is a male Martial Artist advanced class using elemental martial arts. He is a melee back-attack DPS who builds Esoteric Orbs and spends them on Esoteric skills. Established build labels are Deathblow for larger orb-consuming burst and Esoteric Flurry for a faster Esoteric cycle. Verified skills include Lightning Tiger Strike, Tiger Emerges, Blast Formation, Call of the Wind God, Sweeping Kick, Moon Flash Kick, Lightning Whisper, Sky Shattering Blow, Storm Dragon Awakening, Violent Tiger and Phoenix Advent.`
  },
  {
    id: "breaker",
    title: "Breaker — verified class overview",
    keywords: ["breaker", "brawl king storm", "asuras path", "asura", "stamina", "shock", "eye of the storm"],
    text: `Breaker is a male Martial Artist advanced class using heavy gauntlets. He is a durable front-attack DPS with Stamina and Shock energy plus a Tenacious Power identity resource. Established build labels are Brawl King Storm, centered on identity burst and powerful Shock skills, and Asura's Path, centered on sustained front-facing punches and Asura State. Verified skills include Eye of the Storm, Falling Star, Fist of the Wind God, Brawl King's Advance, Explosive Fist, Celestial Force Barrage, Hundred Fists, Crater Strike, Shoulder Charge and Defensive Speculation. Brawl King Twelve Forms: Falling Blossoms and Violent Waves are identity attacks.`
  },
  {
    id: "gunslinger",
    title: "Gunslinger — verified class overview",
    keywords: ["gunslinger", "peacemaker", "time to hunt", "handgun", "shotgun", "rifle", "target down", "focused shot"],
    text: `Gunslinger is a female Gunner advanced class who normally swaps among handgun, shotgun and rifle stances. Established build labels are Peacemaker/Pacifist for three-weapon play and Time to Hunt for a handgun-and-rifle style without shotgun. Verified skills include Target Down, Focused Shot, Sharpshooter, Dual Buckshot, Shotgun Rapid Fire, Catastrophe, Perfect Shot, Bullet Rain, Meteor Stream, Spiral Tracker, Dexterous Shot, Quick Step, Peacekeeper and Last Request. Eye of Twilight and High-Caliber HE Bullet are Awakening skills.`
  },
  {
    id: "deadeye",
    title: "Deadeye — verified class overview",
    keywords: ["deadeye", "enhanced weapon", "pistoleer", "handgun", "shotgun", "rifle", "shotgun rapid fire"],
    text: `Deadeye is a male Gunner advanced class who swaps among handgun, shotgun and rifle stances. He is distinct from Gunslinger and many shotgun attacks strongly reward close-range back attacks. Established build labels are Enhanced Weapon for multi-weapon shotgun-focused play and Pistoleer/Handgun Enhancement for handgun-only play. Verified skills include Shotgun Rapid Fire, Shotgun Dominator, Last Request, Sign of Apocalypse, Cruel Tracker, Equilibrium, Quick Shot, Meteor Stream, AT02 Grenade, Somersault Shot, Enforce Execution, Spiral Flame and Bursting Flare.`
  },
  {
    id: "artillerist",
    title: "Artillerist — verified class overview",
    keywords: ["artillerist", "barrage enhancement", "firepower enhancement", "barrage mode", "homing barrage", "air raid", "flamethrower"],
    text: `Artillerist is a male Gunner advanced class using a heavy launcher. He is a durable ranged DPS who builds Firepower/Barrage resources and can enter a stationary Barrage Mode. Established build labels are Barrage Enhancement for turret-mode burst and Firepower Enhancement for a more mobile normal-skill style. Verified skills include Homing Barrage, Air Raid, Flamethrower, Gravity Explosion, Multiple Rocket Launcher, Forward Barrage, Enhanced Shell, Napalm Shot, Energy Field, Summon Turret and Pressurized Heatbomb. Barrage Mode skills include Barrage: Focus Fire, Barrage: Energy Cannon and Barrage: Howitzer.`
  },
  {
    id: "sharpshooter",
    title: "Sharpshooter — verified class overview",
    keywords: ["sharpshooter", "death strike", "loyal companion", "silverhawk", "snipe", "charged shot"],
    text: `Sharpshooter is a male Gunner advanced class using a mechanical bow and the Silverhawk identity companion. He is a ranged DPS with mobility and sustained or burst options. Established build labels are Death Strike, which consumes the hawk for a damage window, and Loyal Companion, which emphasizes Silverhawk uptime. Verified skills include Snipe, Charged Shot, Arrow Wave, Sharpshooter, Hawk Shot, Atomic Arrow, Arrow Shower, Blade Storm, Moving Slash, Deadly Slash, Evasive Fire and Claymore Mine. Golden Eye and Fenrir's Messenger are Awakening skills.`
  },
  {
    id: "machinist",
    title: "Machinist — verified class overview",
    keywords: ["machinist", "scouter", "evolutionary legacy", "arthetinean skill", "hypersync", "drone", "annihilation mode"],
    text: `Machinist—often called Scouter from the Korean name—is a male Gunner advanced class using an SMG, drone and Hypersync suit. Established build labels are Evolutionary Legacy for transformation/Hypersync play and Arthetinean Skill for normal, drone and joint skills without relying on transformation. Verified skills include Annihilation Mode, Mobile Shot, Avalanche, Energy Buster, Strategic Fire, Command: Baby Drones, Command: Raid Missile, Command: Carpet, Command: Blockade, Fiery Escape and Overcharged Battery. Hypersync skills include Comet Strike, Slugshot, Laser Blade and Echelon Beam.`
  },
  {
    id: "bard",
    title: "Bard — verified class overview",
    keywords: ["bard", "desperate salvation", "true courage", "serenade", "sonic vibration", "heavenly tune", "sound shock"],
    text: `Bard is a female Mage advanced class using a harp. She is primarily a raid support who builds Serenade Meter bubbles and spends them on Serenade of Courage for party damage or Serenade of Salvation for healing. Desperate Salvation is the established support build label; True Courage is the DPS label but DPS Bard is not the normal raid-support role. Verified skills include Sound Shock, Sonatina, Harp of Rhythm, Heavenly Tune, Sonic Vibration, Guardian Tune, Wind of Music, Prelude of Storm, Rhapsody of Light, Soundholic and Stigma. Symphonia and Oratorio are Awakening skills.`
  },
  {
    id: "sorceress",
    title: "Sorceress — verified class overview",
    keywords: ["sorceress", "igniter", "reflux", "arcane rupture", "doomsday", "punishing strike", "explosion"],
    text: `Sorceress is a female Mage advanced class using elemental spells. Her Magick Meter enables Arcane Rupture or Blink. Established build labels are Igniter for meter-building burst windows and Reflux for sustained casting while Arcane Rupture is disabled. Verified skills include Doomsday, Punishing Strike, Explosion, Rime Arrow, Esoteric Reaction, Frost's Call, Seraphic Hail, Reverse Gravity, Blaze, Inferno, Elegian's Touch, Squall and Lightning Vortex. Enviska's Might and Apocalypse Call are Awakening skills.`
  },
  {
    id: "arcanist",
    title: "Arcanist — verified class overview",
    keywords: ["arcanist", "arcana", "empress grace", "order emperor", "card deck", "celestial rain", "secret garden"],
    text: `Arcanist—also called Arcana—is a female Mage advanced class using magical cards. Her identity draws random tarot cards with distinct effects. Skills are commonly discussed as yellow Normal, blue Stacking and red Ruin skills. Established build labels are Empress's Grace for building stacks and detonating them with Ruin skills, and Order of the Emperor for Normal-skill/card cycling. Verified skills include Celestial Rain, Secret Garden, Serendipity, Four of a Kind, Return, Call of Destiny, Scratch Dealer, Spiral Edge, Quadra Accelerate, Stream of Edge, Dark Resurrection, Evoke and Checkmate.`
  },
  {
    id: "summoner",
    title: "Summoner — verified class overview",
    keywords: ["summoner", "master summoner", "communication overflow", "ancient elemental", "akir", "maririn", "shurdi"],
    text: `Summoner is a female Mage advanced class who commands spirits and stores Ancient Energy to invoke Ancient Elementals. Established build labels are Master Summoner for powerful Ancient Elemental summons and Communication Overflow for sustained normal summons, though current Ark Passive labels may differ. Verified skills and summons include Ancient Spear, Akir, Phoenix, Osh, Alimaji, Jahia & Ligheas, Maririn, Pauru, Shurdi, Elcid, Sticky Moss Swamp, Earth Collapse, Electric Storm, Steed Charge and Water Elemental. Kelsion is an Awakening summon.`
  },
  {
    id: "deathblade",
    title: "Deathblade — verified class overview",
    keywords: ["deathblade", "remaining energy", "surge", "death orb", "maelstrom", "soul absorber", "blitz rush"],
    text: `Deathblade is a female Assassin advanced class using three blades. She is a mobile melee/back-attack DPS who fills Death Orbs, enters Death Trance and uses Deathblade Surge. Established build labels are Remaining Energy for frequent identity cycles and Surge for building stacks toward a large Surge hit. Verified skills include Deathblade Surge, Soul Absorber, Blitz Rush, Void Strike, Blade Dance, Moonlight Sonic, Turning Slash, Earth Cleaver, Spincutter, Dark Axel, Maelstrom, Wind Cut and Surprise Attack.`
  },
  {
    id: "shadowhunter",
    title: "Shadowhunter — verified class overview",
    keywords: ["shadowhunter", "demonic impulse", "perfect suppression", "demonize", "demonic slash", "demon vision"],
    text: `Shadowhunter is a female Assassin advanced class using demonic weapons and a Shadowburst Meter. She can transform through Demonize or remain in human form. Established build labels are Demonic Impulse for transformation play and Perfect Suppression for a non-transform build that spends meter. Verified human skills include Demonic Slash, Demon Vision, Demon's Grip, Howl, Decimate, Thrust Impact, Cruel Cutter, Demolition, Sharpened Cut and Rising Claw. Demon-form skills include Ruining Rush, Death Claw, Gore Bleeding, Destruction, Leaping Blow and Blood Massacre.`
  },
  {
    id: "reaper",
    title: "Reaper — verified class overview",
    keywords: ["reaper", "lunar voice", "hunger", "persona", "chaos mode", "swoop", "rage spear"],
    text: `Reaper is a female Assassin advanced class using a dagger. She is a highly mobile melee/back-attack DPS whose identity supports Persona and Chaos modes. Her skills are categorized as Dagger, Shadow and Swoop. Established build labels are Lunar Voice for Persona-amplified Swoop attacks and Hunger for sustained Chaos Mode. Verified skills include Rage Spear, Glowing Brand, Dance of Fury, Silent Rage, Nightmare, Shadow Vortex, Distortion, Call of the Knife, Black Mist, Shadow Trap, Spirit Catch and Spinning Dagger.`
  },
  {
    id: "souleater",
    title: "Souleater — verified class overview",
    keywords: ["souleater", "full moon harvester", "nights edge", "deathlord", "soul stone", "vestige", "guillotine swing"],
    text: `Souleater is a female Assassin advanced class using a scythe. Her identity uses Soul Stones and an Edge Meter to enter Deathlord Mode. Established build labels are Full Moon Harvester for Deathlord burst and Night's Edge for sustained cycling that does not enter Deathlord in the same way. Verified skills include Vestige, Guillotine Swing, Reaper's Scythe, Lethal Spinning, Soul Drain, Lunatic Edge, Rusted Nail, Astaros, Death Order, Spectral Coffin, Gluttony and Harvest. Guillotine Swing belongs to Souleater, not Slayer.`
  },
  {
    id: "artist",
    title: "Artist — verified class overview",
    keywords: ["artist", "full bloom", "recurrence", "harmony orb", "sunrise", "moonfall", "sun well", "sunsketch"],
    text: `Artist is a female Specialist advanced class using a paintbrush. She is primarily a raid support who builds Harmony Meter orbs and spends them on Sunrise for healing or Moonfall for party damage. Full Bloom is the established support build label; Recurrence is the DPS label but DPS Artist is not the normal raid-support role. Verified skills include Paint: Sun Well, Paint: Sunsketch, Paint: Door of Illusion, Paint: Drawing Orchids, Paint: Starry Night, Paint: Pouncing Tiger, Paint: Crane Wing, Stroke: Hopper, Stroke: One Stroke, Stroke: Sprinkle and Stroke: Upward Stroke.`
  },
  {
    id: "aeromancer",
    title: "Aeromancer — verified class overview",
    keywords: ["aeromancer", "drizzle", "wind fury", "sun shower", "weather skill", "umbrella skill", "piercing wind"],
    text: `Aeromancer is a female Specialist advanced class using an umbrella and weather magic. Her identity consumes Raindrop Meter to activate Sun Shower. Established build labels are Drizzle for weather-skill casting and Wind Fury for a faster umbrella/melee style. Verified skills include Piercing Wind, Wiping Wind, Scorching Sun, Strong Wind, Whirlpool, Tornado Dance, Wind Gimlet, Rage, Downward Strike, Spread, Rainstorm, Spring Breeze and Fly. Sun Shower is the identity state, not a generic heal.`
  },
  {
    id: "wildsoul",
    title: "Wildsoul — verified class overview",
    keywords: ["wildsoul", "wild impulse", "phantom beast awakening", "bear", "fox", "shapeshift", "swish bear", "digger bear"],
    text: `Wildsoul is a female Specialist advanced class using mystical scrolls and animal spirits. Her three-part identity supports Bear, Fox and Phantom Beast Awakening forms. Recognized playstyles are Wild Instincts/Wild Impulse for Specialization-based Bear/Fox transformation burst and Phantom Beast Awakening for faster non-transformation skill cycling. Bear form emphasizes power and durability; Fox form is faster. Verified skills include Rolling Wheel, Swish Bear, Digger Bear, Growling Bear, Boulder Bear, Fox Flame, Fox Leap, Fox Illusion, Ursine Windup, Forbidden Sorcery: Ripping Bear and Forbidden Sorcery: Fox Star Rainstorm.`
  },
  {
    id: "guardianknight",
    title: "Guardianknight — verified class overview",
    keywords: ["guardianknight", "dragonknight", "embereth", "halberd", "incarnation", "manifestation", "abaddons flame", "avenging spear"],
    text: `Guardianknight is a female Warrior advanced class released in the West on February 4, 2026. Dragonknight was its pre-release working name; Guardianknight is the official Western name. She uses a halberd and fills the Embereth Orb Gauge, then enters Incarnation state to gain speed and empowered Incarnation skills using the power of Guardian Embereth. Skill categories include Normal, Manifest/Manifestation and Incarnation. Verified current skill names include Abaddon's Flame, Avenging Spear, Blazing Flash, Wing Lash, Rending Finisher, Guillotine Spin and Frenzy Sweep. Do not confuse Guardianknight with Gunlancer despite both being Warriors.`
  }
];

module.exports = { classEntries };
