const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const settingsPath = path.join(dataDirectory, "bot-settings.json");

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, "{}\n", "utf8");
  }
}

function readSettings() {
  ensureStore();
  return JSON.parse(fs.readFileSync(settingsPath, "utf8"));
}

function writeSettings(settings) {
  ensureStore();
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function isMentionLlmEnabled() {
  const settings = readSettings();
  return settings.mentionLlmEnabled !== false;
}

function setMentionLlmEnabled(enabled, updatedBy) {
  const settings = {
    ...readSettings(),
    mentionLlmEnabled: enabled,
    mentionLlmUpdatedAt: new Date().toISOString(),
    mentionLlmUpdatedBy: updatedBy
  };

  writeSettings(settings);
  return settings;
}

module.exports = {
  isMentionLlmEnabled,
  setMentionLlmEnabled
};
