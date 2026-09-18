const { timeZone } = require("./raidPeriodStore");
const planWeekdays = ["Wednesday", "Thursday", "Friday", "Saturday", "Sunday", "Monday", "Tuesday"];

function localParts(now) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(now).map(part => [part.type, part.value]));
}

function addDays(week, days) {
  const date = new Date(`${week}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Planning clears Tuesday at 23:59; week labels remain Wednesday dates.
// This intentionally differs from the roster rollover on Wednesday at 10:00.
function getPlanningWeekDate(now = new Date()) {
  const parts = localParts(now);
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (parts.weekday === "Tue" && parts.hour === "23" && parts.minute === "59") {
    return addDays(date, 1);
  }
  const daysSinceWednesday = { Wed: 0, Thu: 1, Fri: 2, Sat: 3, Sun: 4, Mon: 5, Tue: 6 };
  return addDays(date, -daysSinceWednesday[parts.weekday]);
}

function shouldChoosePlanWeek(now = new Date()) {
  return ["Mon", "Tue"].includes(localParts(now).weekday);
}

function visiblePlanWeeks(now = new Date()) {
  const current = getPlanningWeekDate(now);
  return [current, addDays(current, 7)];
}

module.exports = { addDays, getPlanningWeekDate, shouldChoosePlanWeek, visiblePlanWeeks, planWeekdays };
