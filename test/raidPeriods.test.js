const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "raid-periods-"));
process.env.RAID_BOT_DATA_DIRECTORY = testDataDirectory;

const {
  getAvailablePeriods,
  getCurrentRaidWeekDate,
  getNextRaidWeekDate,
  readRaidsForPeriod,
  runRaidWeekRollover,
  writePreparedRaids
} = require("../src/services/raidPeriodStore");
const { getNextResetDate } = require("../src/services/weeklyRaidReset");

test.after(() => {
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});

test("calculates Amsterdam raid weeks and the 10:00 reset across DST", () => {
  assert.equal(getCurrentRaidWeekDate(new Date("2026-07-28T12:00:00Z")), "2026-07-22");
  assert.equal(getNextRaidWeekDate(new Date("2026-07-28T12:00:00Z")), "2026-07-29");
  assert.equal(
    getNextResetDate(new Date("2026-07-28T12:00:00Z")).toISOString(),
    "2026-07-29T08:00:00.000Z"
  );
  assert.equal(
    getNextResetDate(new Date("2026-10-27T12:00:00Z")).toISOString(),
    "2026-10-28T09:00:00.000Z"
  );
});

test("archives current raids and promotes prepared raids at rollover", () => {
  fs.mkdirSync(testDataDirectory, { recursive: true });
  const current = [{ id: "old", status: "DONE", members: [] }];
  const prepared = [{ id: "new", status: "DONE", members: [] }];
  fs.writeFileSync(
    path.join(testDataDirectory, "raids.json"),
    JSON.stringify(current),
    "utf8"
  );

  const firstWednesday = new Date("2026-04-01T08:00:00Z");
  assert.equal(runRaidWeekRollover(firstWednesday).initialized, true);
  assert.equal(writePreparedRaids(prepared, {}, firstWednesday), "2026-04-08");

  const result = runRaidWeekRollover(new Date("2026-04-08T08:00:00Z"));
  assert.equal(result.importedPrepared, true);
  assert.deepEqual(readRaidsForPeriod("2026-04-01"), current);
  assert.equal(readRaidsForPeriod("current")[0].id, "new");
  assert.equal(readRaidsForPeriod("current")[0].status, "TODO");
  assert.equal(readRaidsForPeriod("next"), null);
  assert.deepEqual(
    getAvailablePeriods().map(({ value }) => value),
    ["current", "2026-04-01"]
  );
});
