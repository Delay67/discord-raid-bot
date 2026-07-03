const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRedPandaBombs } = require("../src/services/redPandaStore");

test("summarizes the top three bomb proccers and latest bomb per guild", () => {
  const history = [
    { guildId: "guild-1", userId: "a", userTag: "A", procAt: "2026-01-01T00:00:00Z" },
    { guildId: "guild-1", userId: "b", userTag: "B", procAt: "2026-02-01T00:00:00Z" },
    { guildId: "guild-1", userId: "a", userTag: "A", procAt: "2026-03-01T00:00:00Z" },
    { guildId: "guild-1", userId: "c", userTag: "C", procAt: "2026-04-01T00:00:00Z" },
    { guildId: "guild-1", userId: "d", userTag: "D", procAt: "2026-05-01T00:00:00Z" },
    { guildId: "guild-2", userId: "z", userTag: "Z", procAt: "2026-06-01T00:00:00Z" }
  ];

  const stats = summarizeRedPandaBombs(history, "guild-1");

  assert.equal(stats.total, 5);
  assert.deepEqual(stats.leaders.map(({ userId, count }) => ({ userId, count })), [
    { userId: "a", count: 2 },
    { userId: "b", count: 1 },
    { userId: "c", count: 1 }
  ]);
  assert.equal(stats.latest.userId, "d");
});
