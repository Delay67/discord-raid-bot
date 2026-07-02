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
