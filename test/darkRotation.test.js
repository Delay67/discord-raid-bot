const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parsePlayers, nextCall } = require("../src/services/darkRotation");

test("custom names keep their order and rotate for three rounds", () => {
  const names = parsePlayers("Alice, Bob, Eye-vrin");
  assert.deepEqual(names, ["Alice", "Bob", "Eye-vrin"]);
  assert.equal(nextCall(names, 0).text, "Dark Alice");
  assert.equal(nextCall(names, 3).text, "Dark Alice");
  assert.equal(nextCall(names, 5).text, "Dark Eye-vrin. 3 darks left");
  assert.equal(nextCall(names, 8).text, "Dark Eye-vrin. No darks left");
  assert.deepEqual(nextCall(names, 9), { text: "No darks left", used: 9 });
});

test("reject empty names, control characters, and oversized rosters", () => {
  for (const names of ["", "Alice,,Bob", "A\nB", "x".repeat(61), Array(25).fill("A").join(",")]) {
    assert.throws(() => parsePlayers(names));
  }
  assert.throws(() => nextCall([], 0));
});
