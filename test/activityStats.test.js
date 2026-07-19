const assert = require("node:assert/strict");
const test = require("node:test");
const { getPastDayKeys, getPeriodKey } = require("../src/services/activityStats");

test("creates daily activity keys", () => {
  assert.equal(getPeriodKey("day", new Date(2026, 0, 5)), "2026-01-05");
});

test("builds rolling day keys across month and year boundaries", () => {
  assert.deepEqual(getPastDayKeys(3, new Date(2026, 0, 1)), [
    "2026-01-01",
    "2025-12-31",
    "2025-12-30"
  ]);
});
