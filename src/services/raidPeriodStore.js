const fs = require("node:fs");
const path = require("node:path");

const dataDirectory =
  process.env.RAID_BOT_DATA_DIRECTORY || path.join(__dirname, "..", "..", "data");
const raidsPath = path.join(dataDirectory, "raids.json");
const preparedPath = path.join(dataDirectory, "raids-prepared.json");
const archiveDirectory = path.join(dataDirectory, "raid-archives");
const rolloverStatePath = path.join(dataDirectory, "raid-rollover.json");
const timeZone = "Europe/Amsterdam";

function ensureDirectories() {
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.mkdirSync(archiveDirectory, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

function writeJson(filePath, value) {
  ensureDirectories();
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function getAmsterdamParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    weekday: "short",
    year: "numeric"
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function formatDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addUtcDays(dateText, days) {
  const [year, month, day] = dateText.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function getCurrentRaidWeekDate(now = new Date()) {
  const parts = getAmsterdamParts(now);
  const weekdayNumbers = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  let daysSinceWednesday = (weekdayNumbers[parts.weekday] - 3 + 7) % 7;

  if (
    parts.weekday === "Wed" &&
    (Number(parts.hour) < 10 || (Number(parts.hour) === 10 && Number(parts.minute) < 0))
  ) {
    daysSinceWednesday = 7;
  }

  return addUtcDays(formatDate(parts.year, parts.month, parts.day), -daysSinceWednesday);
}

function getNextRaidWeekDate(now = new Date()) {
  return addUtcDays(getCurrentRaidWeekDate(now), 7);
}

function readPreparedRaids() {
  const prepared = readJson(preparedPath, null);
  return prepared?.raids || null;
}

function writePreparedRaids(raids, details = {}, now = new Date()) {
  const targetDate = getNextRaidWeekDate(now);
  writeJson(preparedPath, {
    preparedAt: now.toISOString(),
    targetDate,
    ...details,
    raids
  });
  return targetDate;
}

function clearPreparedRaids() {
  try {
    fs.unlinkSync(preparedPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function listArchiveDates() {
  ensureDirectories();
  return fs.readdirSync(archiveDirectory)
    .map((name) => name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)?.[1])
    .filter(Boolean)
    .sort()
    .reverse();
}

function readRaidsForPeriod(period) {
  if (period === "current") {
    return readJson(raidsPath, []);
  }
  if (period === "next") {
    return readPreparedRaids();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) {
    return readJson(path.join(archiveDirectory, `${period}.json`), null);
  }
  return null;
}

function getAvailablePeriods() {
  const periods = [{ label: "Current Week", value: "current" }];
  if (readPreparedRaids()) {
    periods.push({ label: "Next Week", value: "next" });
  }
  for (const date of listArchiveDates().slice(0, 25 - periods.length)) {
    periods.push({ label: date, value: date });
  }
  return periods;
}

function resetToTodo(raids, resetBy) {
  const resetAt = new Date().toISOString();
  return raids.map((raid) => {
    const { completedAt, completedBy, uncompletedAt, uncompletedBy, ...rest } = raid;
    return { ...rest, status: "TODO", resetAt, resetBy };
  });
}

function runRaidWeekRollover(now = new Date()) {
  ensureDirectories();
  const weekDate = getCurrentRaidWeekDate(now);
  const state = readJson(rolloverStatePath, null);

  // On the first deployment, establish the current week without unexpectedly
  // archiving/resetting data that is already in use.
  if (!state) {
    writeJson(rolloverStatePath, { lastRolloverDate: weekDate });
    return { initialized: true, weekDate };
  }
  if (state.lastRolloverDate === weekDate) {
    return { alreadyRan: true, weekDate };
  }

  const currentRaids = readJson(raidsPath, []);
  const archiveDate = state.lastRolloverDate;
  writeJson(path.join(archiveDirectory, `${archiveDate}.json`), currentRaids);

  const prepared = readJson(preparedPath, null);
  const usePrepared =
    prepared?.targetDate <= weekDate && Array.isArray(prepared?.raids);
  const nextRaids = resetToTodo(usePrepared ? prepared.raids : currentRaids, "weekly-rollover");
  writeJson(raidsPath, nextRaids);
  if (usePrepared) {
    clearPreparedRaids();
  }
  writeJson(rolloverStatePath, { lastRolloverDate: weekDate });

  return {
    archivedCount: currentRaids.length,
    archiveDate,
    importedPrepared: usePrepared,
    totalCount: nextRaids.length,
    weekDate
  };
}

module.exports = {
  getAvailablePeriods,
  getCurrentRaidWeekDate,
  getNextRaidWeekDate,
  readPreparedRaids,
  readRaidsForPeriod,
  runRaidWeekRollover,
  timeZone,
  writePreparedRaids
};
