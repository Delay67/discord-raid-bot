const assert = require("node:assert/strict");
const test = require("node:test");
const { getPlanningWeekDate, shouldChoosePlanWeek, visiblePlanWeeks } = require("../src/services/planWeeks");
const { getCurrentRaidWeekDate } = require("../src/services/raidPeriodStore");

test("scheduled plans expire at 01:00 Amsterdam the following day across seasons and DST", () => {
  const { isPlanExpired } = require("../src/services/planWeeks");
  for (const [week, day, before, after] of [
    ["2026-07-22", "Thursday", "2026-07-23T22:59:59Z", "2026-07-23T23:00:00Z"],
    ["2026-12-23", "Thursday", "2026-12-24T23:59:59Z", "2026-12-25T00:00:00Z"],
    ["2026-10-21", "Sunday", "2026-10-25T23:59:59Z", "2026-10-26T00:00:00Z"],
    ["2026-03-25", "Sunday", "2026-03-29T22:59:59Z", "2026-03-29T23:00:00Z"]
  ]) {
    const plan = { week, day };
    assert.equal(isPlanExpired(plan, new Date(before)), false);
    assert.equal(isPlanExpired(plan, new Date(after)), true);
  }
  assert.equal(isPlanExpired({ week: "2026-07-29", day: "Thursday" }, new Date("2026-07-24T12:00:00Z")), false);
  assert.equal(isPlanExpired({ week: "2026-07-22" }, new Date("2026-07-24T12:00:00Z")), false);
});

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
