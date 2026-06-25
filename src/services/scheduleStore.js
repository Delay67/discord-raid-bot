const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const schedulePath = path.join(dataDirectory, "schedule.json");
const amsterdamTimeZone = "Europe/Amsterdam";

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(schedulePath)) {
    fs.writeFileSync(schedulePath, "{}\n", "utf8");
  }
}

function readSchedule() {
  ensureStore();

  const contents = fs.readFileSync(schedulePath, "utf8");
  return JSON.parse(contents);
}

function writeSchedule(schedule) {
  ensureStore();
  fs.writeFileSync(schedulePath, `${JSON.stringify(schedule, null, 2)}\n`, "utf8");
}

function getAmsterdamDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: amsterdamTimeZone,
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
    month: Number(values.month),
    weekday: weekdays[values.weekday],
    year: Number(values.year)
  };
}

function formatAmsterdamDateKey(date) {
  const parts = getAmsterdamDateParts(date);
  return [
    parts.year,
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function getAmsterdamWeekKey(date = new Date()) {
  const parts = getAmsterdamDateParts(date);
  const mondayNoonUtc = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day - (parts.weekday - 1), 12)
  );

  return formatAmsterdamDateKey(mondayNoonUtc);
}

function setScheduleImage({ attachment, plannedMessage, uploadedBy }) {
  const previousSchedule = readSchedule();
  const postedSchedules = previousSchedule.postedSchedules || [];
  const schedule = {
    url: attachment.url,
    name: attachment.name,
    contentType: attachment.contentType,
    uploadedBy,
    uploadedAt: new Date().toISOString(),
    postedSchedules
  };

  if (plannedMessage) {
    schedule.plannedChannelId = plannedMessage.channelId;
    schedule.plannedMessageId = plannedMessage.id;
    schedule.plannedPostedAt = plannedMessage.createdAt.toISOString();
    schedule.postedSchedules = [
      ...postedSchedules,
      {
        channelId: plannedMessage.channelId,
        messageId: plannedMessage.id,
        postedAt: plannedMessage.createdAt.toISOString(),
        weekKey: getAmsterdamWeekKey(plannedMessage.createdAt)
      }
    ];
  }

  writeSchedule(schedule);
  return schedule;
}

function updatePostedSchedules(postedSchedules) {
  const schedule = readSchedule();
  schedule.postedSchedules = postedSchedules;
  writeSchedule(schedule);
  return schedule;
}

module.exports = {
  getAmsterdamWeekKey,
  readSchedule,
  setScheduleImage,
  updatePostedSchedules
};
