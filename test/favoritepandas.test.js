const assert = require("node:assert/strict");
const test = require("node:test");
const { createImagePayload, formatScore } = require("../src/commands/favoritepandas");

test("formats favorite panda scores as points", () => {
  assert.equal(formatScore(1), "1 point");
  assert.equal(formatScore(2), "2 points");
});

test("creates a single favorite panda message payload without media filenames in text", () => {
  const payload = createImagePayload([
    { media: "https://example.com/generic-file-name.jpg", score: 5 },
    { media: "https://example.com/another-file-name.jpg", score: 3 },
    { media: "https://example.com/third-file-name.jpg", score: 1 }
  ]);

  assert.equal(payload.embeds.length, 3);
  assert.equal(payload.files.length, 0);

  const embeds = payload.embeds.map((embed) => embed.toJSON());
  assert.deepEqual(embeds.map((embed) => embed.title), [
    "#1 - 5 points",
    "#2 - 3 points",
    "#3 - 1 point"
  ]);
  const visibleText = embeds
    .flatMap((embed) => [embed.title, embed.description, ...(embed.fields || []).map((field) => field.value)])
    .filter(Boolean)
    .join("\n");
  assert.equal(visibleText.includes("generic-file-name"), false);
});
