const fs = require("node:fs");
const path = require("node:path");
const { channelId } = require("../config");
const {
  getCurrentRaidWeekDate,
  readCurrentKazerosReminders,
  timeZone
} = require("./raidPeriodStore");

const dataDirectory =
  process.env.RAID_BOT_DATA_DIRECTORY || path.join(__dirname, "..", "..", "data");
const sentPath = path.join(dataDirectory, "kazeros-reminders-sent.json");
const remindersInFlight = new Set();
function readSent() {
  try {
    return JSON.parse(fs.readFileSync(sentPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function markSent(key) {
  fs.mkdirSync(dataDirectory, { recursive: true });
  const sent = readSent();
  sent[key] = new Date().toISOString();
  const temporaryPath = `${sentPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(sent, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, sentPath);
}

function getLocalParts(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
    weekday: "long"
  }).formatToParts(now);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function isReminderDue(reminder, now = new Date()) {
  const local = getLocalParts(now);
  if (local.weekday !== reminder.weekday) return false;

  const [startHour, startMinute] = reminder.startTime.split(":").map(Number);
  const nowMinutes = Number(local.hour) * 60 + Number(local.minute);
  const startMinutes = startHour * 60 + startMinute;
  return nowMinutes >= startMinutes - 30 && nowMinutes < startMinutes;
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDiscordIdMap(value = process.env.KAZEROS_DISCORD_IDS) {
  const ids = new Map();
  for (const entry of String(value || "").split(",")) {
    const separator = entry.indexOf(":");
    if (separator === -1) continue;

    const name = normalizeName(entry.slice(0, separator));
    const id = entry.slice(separator + 1).trim();
    if (name && /^\d{17,20}$/.test(id)) {
      ids.set(name, id);
    }
  }
  return ids;
}

async function sendReminder(client, reminder, weekDate) {
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    throw new Error("The configured Discord channel cannot receive Kazeros reminders.");
  }

  const configuredIds = parseDiscordIdMap();
  const resolved = [];
  const unresolved = [];
  for (const name of reminder.members) {
    const id = configuredIds.get(normalizeName(name));
    if (id && !resolved.some((entry) => entry.id === id)) {
      resolved.push({ id, name });
    } else if (!id) {
      unresolved.push(name);
    }
  }

  const roster = [
    ...resolved.map((member) => `<@${member.id}>`),
    ...unresolved.map((name) => `**${name}**`)
  ].join(" ");
  const unresolvedNote = unresolved.length
    ? `\nCould not match to Discord: ${unresolved.join(", ")}`
    : "";

  await channel.send({
    allowedMentions: { users: resolved.map((member) => member.id) },
    content: `${roster}\n**${reminder.raid}** starts in 30 minutes at ${reminder.startTime} Amsterdam time.${unresolvedNote}`
  });

  return `${weekDate}:${reminder.weekday}:${reminder.startTime}:${reminder.raid}`;
}

async function checkKazerosReminders(client, now = new Date()) {
  const weekDate = getCurrentRaidWeekDate(now);
  const sent = readSent();

  for (const reminder of readCurrentKazerosReminders()) {
    const key = `${weekDate}:${reminder.weekday}:${reminder.startTime}:${reminder.raid}`;
    if (sent[key] || remindersInFlight.has(key) || !isReminderDue(reminder, now)) continue;

    remindersInFlight.add(key);
    try {
      await sendReminder(client, reminder, weekDate);
      markSent(key);
      console.log(`Sent Kazeros reminder ${key}.`);
    } finally {
      remindersInFlight.delete(key);
    }
  }
}

function startKazerosReminderScheduler(client) {
  if (parseDiscordIdMap().size === 0) {
    console.warn(
      "KAZEROS_DISCORD_IDS is empty; Kazeros reminders will show names but cannot ping members."
    );
  }
  const runCheck = () => checkKazerosReminders(client).catch(console.error);
  runCheck();
  const interval = setInterval(runCheck, 30 * 1000);
  interval.unref?.();
  console.log("Kazeros reminder scheduler started.");
}

module.exports = {
  checkKazerosReminders,
  isReminderDue,
  parseDiscordIdMap,
  startKazerosReminderScheduler
};
