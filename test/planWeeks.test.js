const assert = require("node:assert/strict");
const test = require("node:test");
const { getPlanningWeekDate, shouldChoosePlanWeek, visiblePlanWeeks } = require("../src/services/planWeeks");
const { getCurrentRaidWeekDate } = require("../src/services/raidPeriodStore");

test("planning switches at Tuesday 23:59 Amsterdam and uses Wednesday week labels", () => {
  for (const [timestamp, week] of [
    ["2026-07-28T21:58:59Z", "2026-07-22"],
    ["2026-07-28T21:59:00Z", "2026-07-29"],
    ["2026-07-28T22:00:00Z", "2026-07-29"],
    ["2026-07-29T07:59:59Z", "2026-07-29"],
    ["2026-07-29T08:00:00Z", "2026-07-29"],
    ["2026-10-27T22:58:59Z", "2026-10-21"],
    ["2026-10-27T22:59:00Z", "2026-10-28"],
    ["2026-12-29T22:59:00Z", "2026-12-30"]
  ]) assert.equal(getPlanningWeekDate(new Date(timestamp)), week, timestamp);
  assert.deepEqual(visiblePlanWeeks(new Date("2026-12-29T22:59:00Z")), ["2026-12-30", "2027-01-06"]);
});

test("the private reset choice follows Amsterdam Monday/Tuesday, not UTC days", () => {
  assert.equal(shouldChoosePlanWeek(new Date("2026-07-26T21:59:59Z")), false);
  assert.equal(shouldChoosePlanWeek(new Date("2026-07-26T22:00:00Z")), true);
  assert.equal(shouldChoosePlanWeek(new Date("2026-07-28T21:59:59Z")), true);
  assert.equal(shouldChoosePlanWeek(new Date("2026-07-28T22:00:00Z")), false);
});

test("the earlier planning wipe does not move the Wednesday 10:00 roster rollover", () => {
  const beforeRosterReset = new Date("2026-07-29T07:59:59Z");
  assert.equal(getPlanningWeekDate(beforeRosterReset), "2026-07-29");
  assert.equal(getCurrentRaidWeekDate(beforeRosterReset), "2026-07-22");
  assert.equal(getCurrentRaidWeekDate(new Date("2026-07-29T08:00:00Z")), "2026-07-29");
});
