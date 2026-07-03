const assert = require("node:assert/strict");
const test = require("node:test");
const {
  findRelevantKnowledge,
  loadKnowledge
} = require("../src/services/lostArkKnowledge");

test("loads uniquely identified knowledge entries", () => {
  const entries = loadKnowledge();
  assert.ok(entries.length >= 10);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);

  for (const entry of entries) {
    assert.ok(entry.topic);
    assert.ok(entry.status);
    assert.match(entry.updatedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(entry.content);
    assert.match(entry.source, /^https:\/\//);
  }
});

test("retrieves Serca facts for raid questions", () => {
  const context = findRelevantKnowledge("what item level is Serca hard mode?");
  assert.match(context, /Shadow Raid: Serca/);
  assert.match(context, /Hard 1730/);
});

test("distinguishes announced roadmap content from live content", () => {
  const context = findRelevantKnowledge("is Warpweaver live yet?");
  assert.match(context, /ANNOUNCED-NOT-LIVE/);
  assert.match(context, /not live/i);
});

test("returns a safe fallback for unrelated questions", () => {
  assert.match(findRelevantKnowledge("quantum banana taxation"), /No matching/);
});
