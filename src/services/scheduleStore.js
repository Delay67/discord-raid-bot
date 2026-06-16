const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const schedulePath = path.join(dataDirectory, "schedule.json");

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

function setScheduleImage({ attachment, uploadedBy }) {
  const schedule = {
    url: attachment.url,
    name: attachment.name,
    contentType: attachment.contentType,
    uploadedBy,
    uploadedAt: new Date().toISOString()
  };

  writeSchedule(schedule);
  return schedule;
}

module.exports = {
  readSchedule,
  setScheduleImage
};
