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

function getIgnoredUserIds(guildId, settings = readSettings()) {
  if (!guildId) return [];

  const ids = settings.ignoredUserIdsByGuild?.[guildId];
  return Array.isArray(ids) ? ids.map(String) : [];
}

function isUserIgnored(guildId, userId) {
  return getIgnoredUserIds(guildId).includes(String(userId));
}

function toggleIgnoredUser(guildId, userId, updatedBy) {
  if (!guildId) {
    throw new Error("Ignored users can only be changed inside a server.");
  }

  const settings = readSettings();
  const ignoredUserIds = new Set(getIgnoredUserIds(guildId, settings));
  const normalizedUserId = String(userId);
  const ignored = !ignoredUserIds.has(normalizedUserId);

  if (ignored) {
    ignoredUserIds.add(normalizedUserId);
  } else {
    ignoredUserIds.delete(normalizedUserId);
  }

  settings.ignoredUserIdsByGuild = {
    ...settings.ignoredUserIdsByGuild,
    [guildId]: [...ignoredUserIds]
  };
  settings.ignoredUsersUpdatedAt = new Date().toISOString();
  settings.ignoredUsersUpdatedBy = String(updatedBy);
  writeSettings(settings);

  return ignored;
}

module.exports = {
  getIgnoredUserIds,
  isMentionLlmEnabled,
  isUserIgnored,
  setMentionLlmEnabled,
  toggleIgnoredUser
};
