const { runRaidWeekRollover } = require("./raidPeriodStore");

const resetTimeZone = "Europe/Amsterdam";
const resetWeekday = 3;
const resetHour = 10;
const resetMinute = 0;

function getTimeZoneParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: resetTimeZone,
    weekday: "short",
    year: "numeric"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdays = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7
  };

  return {
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    month: Number(values.month),
    second: Number(values.second),
    weekday: weekdays[values.weekday],
    year: Number(values.year)
  };
}

function isResetMinute(date) {
  const parts = getTimeZoneParts(date);

  return (
    parts.weekday === resetWeekday &&
    parts.hour === resetHour &&
    parts.minute === resetMinute
  );
}

function getNextResetDate(now = new Date()) {
  const start = new Date(now.getTime() + 60 * 1000);
  start.setUTCSeconds(0, 0);

  for (let minutes = 0; minutes <= 8 * 24 * 60; minutes += 1) {
    const candidate = new Date(start.getTime() + minutes * 60 * 1000);

    if (isResetMinute(candidate)) {
      return candidate;
    }
  }

  throw new Error("Could not calculate the next weekly raid reset time.");
}

function startWeeklyRaidResetScheduler() {
  const startupResult = runRaidWeekRollover();
  console.log(`Raid week rollover startup check: ${JSON.stringify(startupResult)}`);

  function scheduleNextReset() {
    const nextReset = getNextResetDate();
    const delayMs = nextReset.getTime() - Date.now();
    const timeout = setTimeout(() => {
      const result = runRaidWeekRollover();
      console.log(`Weekly raid rollover ran: ${JSON.stringify(result)}`);
      scheduleNextReset();
    }, delayMs);

    timeout.unref?.();
    console.log(`Next weekly raid reset scheduled for ${nextReset.toISOString()} (${resetTimeZone}).`);
  }

  scheduleNextReset();
}

module.exports = {
  getNextResetDate,
  startWeeklyRaidResetScheduler
};
