const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const lastSelectionPath = path.join(dataDirectory, "redpanda-last.json");
const selectionHistoryPath = path.join(dataDirectory, "redpanda-history.json");
const bombHistoryPath = path.join(dataDirectory, "redpanda-bombs.json");

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function readLastSelection() {
  if (!fs.existsSync(lastSelectionPath)) {
    return null;
  }

  const contents = fs.readFileSync(lastSelectionPath, "utf8");
  return JSON.parse(contents);
}

function writeLastSelection(selection) {
  ensureDataDirectory();
  fs.writeFileSync(lastSelectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
}

function readSelectionHistory() {
  if (!fs.existsSync(selectionHistoryPath)) {
    return [];
  }

  try {
    const history = JSON.parse(fs.readFileSync(selectionHistoryPath, "utf8"));
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.warn(`Could not read red panda selection history: ${error.message}`);
    return [];
  }
}

function getRecentlySentMedia(since) {
  const cutoff = since.getTime();

  return readSelectionHistory().filter(
    (selection) =>
      selection.media && new Date(selection.sentAt).getTime() >= cutoff
  );
}

function rememberSentMedia(media) {
  const cutoff = Date.now() - 3 * 60 * 60 * 1000;
  const history = readSelectionHistory().filter(
    (selection) => new Date(selection.sentAt).getTime() >= cutoff
  );
  const sentAt = new Date().toISOString();

  history.push(...media.map((item) => ({ media: item, sentAt })));
  ensureDataDirectory();
  fs.writeFileSync(selectionHistoryPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

function rememberLastLocalSelection(interaction, file) {
  writeLastSelection({
    channelId: interaction.channelId,
    file,
    guildId: interaction.guildId,
    selectedAt: new Date().toISOString(),
    userId: interaction.user.id,
    userTag: interaction.user.tag
  });
}

function readBombHistory() {
  if (!fs.existsSync(bombHistoryPath)) {
    return [];
  }

  try {
    const history = JSON.parse(fs.readFileSync(bombHistoryPath, "utf8"));
    return Array.isArray(history) ? history : [];
  } catch (error) {
    console.warn(`Could not read red panda bomb history: ${error.message}`);
    return [];
  }
}

function rememberRedPandaBomb(interaction) {
  const history = readBombHistory();

  history.push({
    guildId: interaction.guildId,
    procAt: new Date().toISOString(),
    userId: interaction.user.id,
    userTag: interaction.user.tag
  });
  ensureDataDirectory();
  fs.writeFileSync(bombHistoryPath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

function summarizeRedPandaBombs(history, guildId) {
  const bombs = history
    .filter((bomb) => bomb.guildId === guildId && bomb.userId && bomb.procAt)
    .sort((left, right) => new Date(right.procAt) - new Date(left.procAt));
  const users = new Map();

  for (const bomb of bombs) {
    const current = users.get(bomb.userId);
    users.set(bomb.userId, {
      count: (current?.count || 0) + 1,
      userId: bomb.userId,
      userTag: current?.userTag || bomb.userTag
    });
  }

  return {
    latest: bombs[0] || null,
    leaders: [...users.values()]
      .sort((left, right) => right.count - left.count || left.userId.localeCompare(right.userId))
      .slice(0, 3),
    total: bombs.length
  };
}

function getRedPandaBombStats(guildId) {
  return summarizeRedPandaBombs(readBombHistory(), guildId);
}

function clearLastSelection() {
  if (fs.existsSync(lastSelectionPath)) {
    fs.unlinkSync(lastSelectionPath);
  }
}

function deleteLastLocalSelection() {
  const selection = readLastSelection();

  if (!selection?.file) {
    return {
      ok: false,
      reason: "No local red panda selection has been recorded yet."
    };
  }

  if (!fs.existsSync(selection.file)) {
    clearLastSelection();
    return {
      ok: false,
      reason: `The last selected file no longer exists: ${selection.file}`
    };
  }

  fs.unlinkSync(selection.file);
  clearLastSelection();

  return {
    file: selection.file,
    ok: true
  };
}

module.exports = {
  deleteLastLocalSelection,
  getRecentlySentMedia,
  getRedPandaBombStats,
  rememberRedPandaBomb,
  rememberSentMedia,
  rememberLastLocalSelection,
  summarizeRedPandaBombs
};
