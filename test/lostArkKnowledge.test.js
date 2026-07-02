const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getLostArkKnowledge,
  knowledgeUpdatedAt
} = require("../src/services/lostArkKnowledge");

test("always grounds prompts in Lost Ark terminology", () => {
  const result = getLostArkKnowledge("what should I bring?");

  assert.match(result, /Smilegate RPG/);
  assert.match(result, /stagger check/);
});

test("retrieves current Serca facts", () => {
  const result = getLostArkKnowledge("What ilvl is Serca hard and how does brawl work?");

  assert.match(result, /Hard 1730/);
  assert.match(result, /timed three-stage space/);
});

test("marks July roadmap content as not live on the knowledge date", () => {
  const result = getLostArkKnowledge("Is Act 1 Extreme live and what ilvl is it?");

  assert.match(result, /NOT live/);
  assert.match(result, /Normal 1720/);
  assert.equal(knowledgeUpdatedAt, "2026-07-03");
});

test("uses recent context to resolve short follow-ups", () => {
  const result = getLostArkKnowledge("what about hard?", [
    { role: "user", content: "We were discussing Serca requirements" }
  ]);

  assert.match(result, /Shadow Raid: Serca/);
  assert.match(result, /Hard 1730/);
});

test("respects the configured character budget", () => {
  const result = getLostArkKnowledge("Tell me everything about every raid and class", [], 900);

  assert.ok(result.length <= 900);
});

test("retrieves verified Gunlancer facts and explicit false-name guards", () => {
  const result = getLostArkKnowledge("What do you know about Gunlancers?");

  assert.match(result, /Defensive Stance/);
  assert.match(result, /Surge Cannon/);
  assert.match(result, /does not have skills called Cannonball or Cannon Blast/);
});

test("retrieves verified Destroyer terminology", () => {
  const result = getLostArkKnowledge("Tell me about Destroyer skills and builds");

  assert.match(result, /Rage Hammer/);
  assert.match(result, /Perfect Swing/);
  assert.match(result, /Rage of the Beast.*not Destroyer skills/);
});

test("grounds DPS ranking prompts while still allowing the model to answer", () => {
  const result = getLostArkKnowledge("Just raw DPS, give me the top 3");

  assert.match(result, /There is no verified live DPS ranking/);
  assert.match(result, /Do not rank classes/);
});

test("has a dedicated overview for every live Western advanced class", () => {
  const expectedClasses = [
    "Berserker", "Destroyer", "Gunlancer", "Paladin", "Slayer", "Valkyrie",
    "Guardianknight", "Wardancer", "Scrapper", "Soulfist", "Glaivier", "Striker",
    "Breaker", "Gunslinger", "Deadeye", "Artillerist", "Sharpshooter", "Machinist",
    "Bard", "Sorceress", "Arcanist", "Summoner", "Deathblade", "Shadowhunter",
    "Reaper", "Souleater", "Artist", "Aeromancer", "Wildsoul"
  ];

  for (const className of expectedClasses) {
    const result = getLostArkKnowledge(`Tell me about ${className}`);
    assert.match(result, new RegExp(`### ${className} .*verified class overview`, "i"));
  }
});
