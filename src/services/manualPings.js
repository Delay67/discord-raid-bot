const fs = require("node:fs");
const path = require("node:path");
const store = require("./raidPeriodStore");
const file = path.join(process.env.RAID_BOT_DATA_DIRECTORY || path.join(__dirname, "..", "..", "data"), "manual-pings.json");
function readOverrides() {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return {}; throw error; }
}
function getWeek(week, now) {
  if (!["current", "next"].includes(week)) throw new Error("Choose current or next week.");
  return week === "next" ? store.getNextRaidWeekDate(now) : store.getCurrentRaidWeekDate(now);
}
function getManualPings(week, now = new Date()) {
  return readOverrides()[getWeek(week, now)];
}
function getPings(week, now = new Date()) {
  const manual = getManualPings(week, now);
  if (Array.isArray(manual)) return manual;
  if (week === "next") {
    const prepared = store.readPreparedRaidWeek();
    if (prepared?.targetDate === getWeek(week, now) && Array.isArray(prepared.raids) && Array.isArray(prepared.kazerosReminders)) return prepared.kazerosReminders;
  }
  return store.readCurrentKazerosReminders();
}
function editPing(action, week, reminder, now = new Date()) {
  const date = getWeek(week, now);
  const matches = (entry) => entry.weekday === reminder.weekday && entry.startTime === reminder.startTime && entry.raid.toLowerCase() === reminder.raid.toLowerCase();
  const existing = getPings(week, now);
  const reminders = existing.filter((entry) => !matches(entry));
  if (action === "remove" && reminders.length === existing.length) return false;
  if (action === "set") reminders.push(reminder);
  const overrides = readOverrides();
  for (const key of Object.keys(overrides)) if (key < store.getCurrentRaidWeekDate(now)) delete overrides[key];
  overrides[date] = reminders;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + "." + process.pid + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(overrides, null, 2) + "\n");
  fs.renameSync(temporary, file);
  return true;
}
module.exports = { editPing, getManualPings, getPings };
