const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const lastSelectionPath = path.join(dataDirectory, "redpanda-last.json");
const selectionHistoryPath = path.join(dataDirectory, "redpanda-history.json");
const bombHistoryPath = path.join(dataDirectory, "redpanda-bombs.json");
const favoritesPath = path.join(dataDirectory, "redpanda-favorites.json");

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

function readFavorites() {
  if (!fs.existsSync(favoritesPath)) {
    return { messages: {}, scores: {} };
  }

  try {
    const favorites = JSON.parse(fs.readFileSync(favoritesPath, "utf8"));
    return {
      messages: favorites?.messages && typeof favorites.messages === "object"
        ? favorites.messages
        : {},
      scores: favorites?.scores && typeof favorites.scores === "object"
        ? favorites.scores
        : {}
    };
  } catch (error) {
    console.warn(`Could not read red panda favorite history: ${error.message}`);
    return { messages: {}, scores: {} };
  }
}

function writeFavorites(favorites) {
  ensureDataDirectory();
  fs.writeFileSync(favoritesPath, `${JSON.stringify(favorites, null, 2)}\n`, "utf8");
}

function getFavoriteScoreKey(guildId, media) {
  return `${guildId || "dm"}:${media}`;
}

function rememberFavoritePandaMessage(interaction, message, media) {
  if (!message?.id || media.length === 0) {
    return;
  }

  const favorites = readFavorites();

  favorites.messages[message.id] = {
    channelId: interaction.channelId,
    countedUserIds: [],
    guildId: interaction.guildId,
    media,
    postedAt: new Date().toISOString()
  };

  for (const item of media) {
    const key = getFavoriteScoreKey(interaction.guildId, item);
    favorites.scores[key] ||= {
      guildId: interaction.guildId,
      media: item,
      score: 0
    };
  }

  writeFavorites(favorites);
}

function recordFavoritePandaReaction(reaction, user) {
  if (user?.bot) {
    return { ok: false, reason: "bot-reaction" };
  }

  const messageId = reaction?.message?.id;
  const userId = user?.id;

  if (!messageId || !userId) {
    return { ok: false, reason: "missing-reaction-data" };
  }

  const favorites = readFavorites();
  const message = favorites.messages[messageId];

  if (!message) {
    return { ok: false, reason: "unknown-message" };
  }

  message.countedUserIds ||= [];

  if (message.countedUserIds.includes(userId)) {
    return { ok: false, reason: "duplicate-user" };
  }

  message.countedUserIds.push(userId);

  for (const item of message.media || []) {
    const key = getFavoriteScoreKey(message.guildId, item);
    favorites.scores[key] ||= {
      guildId: message.guildId,
      media: item,
      score: 0
    };
    favorites.scores[key].score += 1;
  }

  writeFavorites(favorites);

  return {
    media: message.media || [],
    ok: true
  };
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

function summarizeFavoritePandas(favorites, guildId, limit = 5) {
  return Object.values(favorites.scores || {})
    .filter((entry) => entry.guildId === guildId && entry.score > 0)
    .sort((left, right) => right.score - left.score || left.media.localeCompare(right.media))
    .slice(0, limit);
}

function getFavoritePandaLeaders(guildId, limit = 5) {
  return summarizeFavoritePandas(readFavorites(), guildId, limit);
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
  getFavoritePandaLeaders,
  getRecentlySentMedia,
  getRedPandaBombStats,
  recordFavoritePandaReaction,
  rememberFavoritePandaMessage,
  rememberRedPandaBomb,
  rememberSentMedia,
  rememberLastLocalSelection,
  summarizeFavoritePandas,
  summarizeRedPandaBombs
};
