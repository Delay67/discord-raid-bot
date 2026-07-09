const test = require("node:test");
const assert = require("node:assert/strict");
const {
  summarizeFavoritePandas,
  summarizeRedPandaBombs
} = require("../src/services/redPandaStore");

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

test("summarizes top favorite pandas by score for a guild", () => {
  const favorites = {
    scores: {
      "guild-1:a.jpg": { guildId: "guild-1", media: "a.jpg", score: 3 },
      "guild-1:b.jpg": { guildId: "guild-1", media: "b.jpg", score: 5 },
      "guild-1:c.jpg": { guildId: "guild-1", media: "c.jpg", score: 5 },
      "guild-2:z.jpg": { guildId: "guild-2", media: "z.jpg", score: 10 },
      "guild-1:zero.jpg": { guildId: "guild-1", media: "zero.jpg", score: 0 }
    }
  };

  const leaders = summarizeFavoritePandas(favorites, "guild-1", 2);

  assert.deepEqual(leaders.map(({ media, score }) => ({ media, score })), [
    { media: "b.jpg", score: 5 },
    { media: "c.jpg", score: 5 }
  ]);
});
