const assert = require("node:assert/strict");
const test = require("node:test");
const {
  isReminderDue,
  parseDiscordIdMap
} = require("../src/services/kazerosReminderScheduler");

const reminder = {
  weekday: "Wednesday",
  startTime: "17:00",
  raid: "Cath",
  members: ["Nona", "Mawino", "Itelin"]
};

test("Kazeros reminder is due during the 30-minute Amsterdam window", () => {
  assert.equal(isReminderDue(reminder, new Date("2026-07-29T14:29:00Z")), false);
  assert.equal(isReminderDue(reminder, new Date("2026-07-29T14:30:00Z")), true);
  assert.equal(isReminderDue(reminder, new Date("2026-07-29T14:45:00Z")), true);
  assert.equal(isReminderDue(reminder, new Date("2026-07-29T15:00:00Z")), false);
});

test("Kazeros reminder does not run on another weekday", () => {
  assert.equal(isReminderDue(reminder, new Date("2026-07-30T14:30:00Z")), false);
});

test("Discord IDs are parsed from private environment-style configuration", () => {
  const ids = parseDiscordIdMap("Nona:12345678901234567, Nonna:12345678901234567, Jan:98765432109876543");
  assert.equal(ids.get("nona"), "12345678901234567");
  assert.equal(ids.get("nonna"), "12345678901234567");
  assert.equal(ids.get("jan"), "98765432109876543");
});
