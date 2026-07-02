const knowledgeUpdatedAt = "2026-07-03";

// This is a compact grounding set for the Western (Amazon Games) version.
// Time-sensitive facts are dated so the model does not confuse live and announced content.
// Primary update sources:
// https://www.playlostark.com/en-us/game/releases/the-shadows-rise
// https://www.playlostark.com/en-us/game/releases/the-twilight-isle
// https://www.playlostark.com/en-us/news/articles/lost-ark-2026-roadmap-part-3
const entries = [
  {
    id: "game-identity",
    alwaysInclude: true,
    title: "Lost Ark identity and vocabulary",
    keywords: ["lost ark", "arkesia", "mmorpg", "raid", "gate", "wipe", "stagger", "counter"],
    text: `Lost Ark is Smilegate RPG's isometric action MMORPG, published by Amazon Games in the West. It is not a generic turn-based RPG or survival game. Combat uses eight equipped combat skills plus identity, awakening/hyper awakening and battle items. Common encounter terms include gate, stagger check, counter, destruction/weak point, part break, sidereal, clash, Just Guard, front attack, back attack, Hit Master, support, DPS, party synergy, identity gauge and battle workshop. A "bus" is a paid carry; "reclear" means prior clear experience; "prog" means learning/progression; "jail" means being stuck in a gate after the group breaks up.`
  },
  {
    id: "combat-party",
    title: "Party composition and combat roles",
    keywords: ["party", "support", "dps", "bard", "paladin", "artist", "valkyrie", "synergy", "brand", "buff", "yearning"],
    text: `Standard 8-player raids use two parties of four, usually one support and three DPS per party. Four-player content usually uses one support and three DPS. Supports maintain a brand/debuff on the boss, attack buffs and shields or healing; they are not conventional damage dealers. The established support advanced classes are Bard, Paladin and Artist, with Valkyrie also having a support-oriented path. Party synergies, positional requirements, stagger, weak point and counters matter when composing a group. Do not describe Lost Ark with a classic tank/healer/DPS trinity: Gunlancer is durable and brings utility, but bosses generally do not use a standard aggro-tank system.`
  },
  {
    id: "builds-and-stats",
    title: "Character builds and gearing language",
    keywords: ["build", "gear", "stats", "engraving", "ark passive", "ark grid", "gem", "elixir", "transcendence", "bracelet", "card", "quality"],
    text: `A Lost Ark build is class- and archetype-specific. Relevant layers can include combat stats (Crit, Specialization and Swiftness are the main DPS stats), engravings, skill points, tripods, runes, gems, cards, weapon quality, bracelets, elixirs, transcendence, Ark Passive and—at the current Western endgame—Ark Grid. Never recommend generic RPG stats such as strength, intelligence or vitality without tying them to an actual Lost Ark system. Exact best-in-slot builds and damage breakpoints are patch-sensitive; ask for the advanced class, build/archetype and region/patch when those are missing.`
  },
  {
    id: "roster-progression",
    title: "Roster and progression basics",
    keywords: ["roster", "alt", "main", "honing", "item level", "ilvl", "gold", "silver", "una", "chaos dungeon", "guardian raid", "stronghold", "powerpass", "express"],
    text: `Progression is split between character-specific and roster-wide systems. Players commonly have a main and several alts. Item level is primarily raised through honing; materials and gold restrictions may be bound to character or roster. Daily/weekly activities, raids, Una's Tasks, events, stronghold research, powerpasses and express events support progression. Gold-earning limits, raid rewards, material names and event eligibility change often, so do not invent exact values. In the live July 3, 2026 Western version, the Content Guide is available from Alt+Q and organizes current End Content and Core Content.`
  },
  {
    id: "classes-current",
    title: "Western advanced classes available by July 3, 2026",
    keywords: ["class", "classes", "warrior", "mage", "martial artist", "gunner", "assassin", "specialist", "slayer", "breaker", "souleater", "wildsoul", "valkyrie", "guardianknight", "dragonknight", "recommend"],
    text: `Lost Ark uses base-class families and advanced classes. Long-established Western advanced classes include Berserker, Destroyer, Gunlancer, Paladin, Slayer; Striker, Wardancer, Scrapper, Soulfist, Glaivier, Breaker; Gunslinger, Artillerist, Deadeye, Sharpshooter, Machinist; Bard, Sorceress, Arcanist, Summoner; Shadowhunter, Deathblade, Reaper, Souleater; Artist, Aeromancer and Wildsoul. Newer 2025–2026 Western additions include Valkyrie and Guardianknight, and the February 2026 Dragonknight. Class recommendations must be based on preferred role, positional play, pace, complexity and investment—not generic fantasy archetypes. "Warpweaver" is only a working name for an announced September 2026 class and is not live on July 3.`
  },
  {
    id: "raid-lineage",
    title: "Major raid progression and names",
    keywords: ["argos", "valtan", "vykas", "kakul", "clown", "brelshaza", "kayangel", "akkan", "ivory tower", "thaemine", "echidna", "behemoth", "aegir", "kazeros", "raid list"],
    text: `Major Western endgame encounters over the game's life include Argos; Legion Raids Valtan, Vykas, Kakul-Saydon and Brelshaza; Abyssal content such as Kayangel and Ivory Tower; Akkan; Thaemine; Echidna; Behemoth; and the Kazeros sequence. Later Kazeros-era content includes Aegir, Brelshaza, Act 3: Night of Storms and Darkness, Act 4: Fortress of Destruction, and Denouement: Final Day. Older raids can remain relevant through solo modes, events or progression, but should not automatically be called the current top endgame. Gate counts, entry levels, gold and available modes have changed across patches; use dated knowledge or qualify the answer.`
  },
  {
    id: "serca-live",
    title: "Shadow Raid: Serca — live April 15, 2026",
    keywords: ["serca", "shadow raid", "witch of pain", "corvus", "brawl", "brave hearts", "agony thorn", "destined tremor", "nightmare"],
    text: `Shadow Raid: Serca, Witch of Pain is live in the Western version. It is four-player content with two gates: Serca followed by Corvus Tul Rak. Entry levels are Normal 1710, Hard 1730 and Nightmare 1740, after the guide quest [Unlock] Notice: Shadow Raid and the main quest Inherited Will. Its Brawl system moves the party into a timed three-stage space after a successful stagger. Shadow Raids use a shared resurrection pool, but one-shot party wipes still fail the attempt. Hard and Nightmare award Agony Thorn for Tier 4 Upper Ancient Destined Tremor gear and upper honing materials; Normal gives Fragmented Agony Thorn for exchange. Shadow of Corvus Tul Rak is a craftable Shadow Skill battle item unlocked through Gate 2 achievements. Frontier mode does not apply.`
  },
  {
    id: "horizon-live",
    title: "Horizon Cathedral — live June 17, 2026",
    keywords: ["horizon", "cathedral", "cadarum", "graced shard", "abyssal dungeon", "stage 1", "stage 2", "stage 3"],
    text: `Horizon Cathedral is a live four-player Abyssal Dungeon in the Cadarum Isles. It has three stages with two gates each; entry counts are shared across stages. Stage item levels are 1700, 1720 and 1750. It requires the Cadarum story and main quest After the Resonance Stops. Revives are unlimited with a 10-second cooldown but consume a Phoenix Plume or 10 Crystals; a full party wipe fails the attempt. Gate clears give Graced Shards, Ark Grid Cores and character-bound gold. It shares weekly gold limits and bonus-reward counts with other endgame content.`
  },
  {
    id: "current-progression-2026",
    title: "Current Tier 4 Upper activities — July 3, 2026",
    keywords: ["tier 4", "t4", "upper", "chaos rift", "haal", "hourglass", "afterimage", "content guide", "astrogem", "core", "current endgame"],
    text: `As of July 3, 2026 in the Western version, current systems/content include Tier 4 Upper progression, Destined Tremor gear, Ark Grid Cores and Astrogems, Shadow Raid Serca, Chaos Rift, Haal's Hourglass, Guardian's Afterimage, Paradise Season 3, Kazeros raids and Horizon Cathedral. Chaos Rift is solo content at item level 1730+ sharing Aura of Resonance and Rest Bonus with Chaos Dungeon/Kurzan Frontline and awarding upper honing materials and Astrogems. The Content Guide (Alt+Q) lists suitable End Content and Core Content by item level. Exact optimal Ark Grid nodes, Astrogems and class balance are highly patch-specific.`
  },
  {
    id: "july-events-live",
    title: "Live progression events on July 3, 2026",
    keywords: ["event", "express", "twilight road", "mokoko bootcamp", "powerpass", "returning", "new player", "catch up"],
    text: `The June 10–September 16, 2026 Western progression events are live: Kazeros Challenge Express targets item level 1640–1701 characters and supports honing through 1700; Twilight Road provides milestones from 1700 to 1730; Mokoko Bootcamp covers Horizon Cathedral, Kazeros Raids and Serca and marks eligible new/returning players up to item level 1720; a South Rimeria Event Trixion Pass is claimable through September 16. Event details and eligibility should be checked in-game because dates and restrictions are time-sensitive.`
  },
  {
    id: "announced-july-2026",
    title: "Announced July 15, 2026 update — not live on July 3",
    keywords: ["july update", "extreme", "act 1 extreme", "paradise season 4", "solo act 4", "solo denouement", "matchmaking serca", "upcoming"],
    text: `The July 2026 Western update is announced for July 15 and is NOT live as of this knowledge date. It is planned to add Kazeros Act 1 Extreme (Aegir) for eight players at Normal 1720, Hard 1750 and Nightmare 1770; one roster clear shared across difficulties, individual revival in Normal/Hard but not Nightmare. Also announced: Paradise Season 4; Solo Mode for Kazeros Act 4 and Denouement; and an accessible Serca matchmaking mode with unlimited revives and no full-party-wipe condition. Do not describe these as currently available before July 15.`
  },
  {
    id: "future-roadmap-2026",
    title: "Later 2026 roadmap — announced, not live",
    keywords: ["roadmap", "august", "september", "warpweaver", "base camp", "act 2 extreme", "future class"],
    text: `Roadmap items are plans, not live features. August 2026 is planned to bring Kazeros Act 2 Extreme and a server merge. September is planned to bring a new time/space class under the working Western name Warpweaver plus Base Camp, a guided catch-up experience toward item level 1700. Names, dates and details may change before release.`
  },
  {
    id: "region-and-patch",
    title: "Region, patch and uncertainty rules",
    keywords: ["korea", "kr", "western", "global", "na", "euc", "patch", "balance", "release", "when", "current"],
    text: `The Korean and Western versions do not always share release timing, names, tuning or progression systems. Treat this knowledge as Western/Global unless the user explicitly asks about Korea. For current balance, exact class builds, gate mechanics, gold rewards, schedules or market prices, state the knowledge date and avoid guessing. If the local notes do not contain the fact, say so plainly and suggest checking the in-game Content Guide, current official release notes or a current community guide.`
  }
];

module.exports = { entries, knowledgeUpdatedAt };
