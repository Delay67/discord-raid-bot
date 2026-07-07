const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const statsPath = path.join(dataDirectory, "activity-stats.json");
const periods = ["day", "week", "month", "year", "all"];

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(statsPath)) {
    fs.writeFileSync(statsPath, `${JSON.stringify({ guilds: {} }, null, 2)}\n`, "utf8");
  }
}

function readStats() {
  ensureStore();
  const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));

  stats.guilds ||= {};

  return stats;
}

function writeStats(stats) {
  ensureStore();
  fs.writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
}

function getIsoWeek(date) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

  return `${utcDate.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function getPeriodKey(period, date = new Date()) {
  if (period === "all") {
    return "all-time";
  }

  if (period === "week") {
    return getIsoWeek(date);
  }

  if (period === "day") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  if (period === "month") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  return `${date.getFullYear()}`;
}

function createBucket() {
  return {
    commands: {
      byName: {},
      total: 0,
      users: {}
    },
    messages: {
      total: 0,
      users: {}
    },
    redpandas: {
      sources: {},
      total: 0,
      users: {}
    }
  };
}

function getGuildStats(stats, guildId) {
  stats.guilds[guildId] ||= {
    periods: {}
  };

  return stats.guilds[guildId];
}

function getBucket(stats, guildId, period, key) {
  const guildStats = getGuildStats(stats, guildId);

  guildStats.periods[period] ||= {};
  guildStats.periods[period][key] ||= createBucket();
  return guildStats.periods[period][key];
}

function getUserLabel(user) {
  return user.tag || user.username || user.id;
}

function incrementUser(users, user) {
  users[user.id] ||= {
    count: 0,
    label: getUserLabel(user)
  };
  users[user.id].count += 1;
  users[user.id].label = getUserLabel(user);
}

function updateCurrentBuckets(guildId, updateBucket) {
  if (!guildId) {
    return;
  }

  const stats = readStats();
  const now = new Date();

  for (const period of periods) {
    updateBucket(getBucket(stats, guildId, period, getPeriodKey(period, now)));
  }

  writeStats(stats);
}

function recordMessage(message) {
  updateCurrentBuckets(message.guildId, (bucket) => {
    bucket.messages.total += 1;
    incrementUser(bucket.messages.users, message.author);
  });
}

function recordCommand(interaction) {
  updateCurrentBuckets(interaction.guildId, (bucket) => {
    bucket.commands.total += 1;
    bucket.commands.byName[interaction.commandName] =
      (bucket.commands.byName[interaction.commandName] || 0) + 1;
    incrementUser(bucket.commands.users, interaction.user);
  });
}

function recordRedPanda(interaction, source) {
  updateCurrentBuckets(interaction.guildId, (bucket) => {
    bucket.redpandas.total += 1;
    bucket.redpandas.sources[source] = (bucket.redpandas.sources[source] || 0) + 1;
    incrementUser(bucket.redpandas.users, interaction.user);
  });
}

function sortCounts(entries) {
  return Object.entries(entries)
    .sort(([, left], [, right]) => right - left)
    .map(([name, count]) => ({ count, name }));
}

function sortUsers(users) {
  return Object.entries(users)
    .map(([id, user]) => ({
      count: user.count,
      id,
      label: user.label
    }))
    .sort((left, right) => right.count - left.count);
}

function mergeBuckets(buckets) {
  const merged = createBucket();

  for (const bucket of buckets) {
    merged.redpandas.total += bucket?.redpandas?.total || 0;

    for (const [source, count] of Object.entries(bucket?.redpandas?.sources || {})) {
      merged.redpandas.sources[source] = (merged.redpandas.sources[source] || 0) + count;
    }

    for (const [id, user] of Object.entries(bucket?.redpandas?.users || {})) {
      merged.redpandas.users[id] ||= { count: 0, label: user.label || id };
      merged.redpandas.users[id].count += user.count || 0;
      merged.redpandas.users[id].label = user.label || merged.redpandas.users[id].label;
    }
  }

  return merged;
}

function getPastDayKeys(days, date = new Date()) {
  return Array.from({ length: days }, (_, offset) => {
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
    return getPeriodKey("day", day);
  });
}

function getTopPandaStats(selection, guildId, date = new Date()) {
  const stats = readStats();
  const periodsByType = stats.guilds[guildId]?.periods || {};
  let bucket;
  let key;

  if (selection.type === "all") {
    key = "all-time";
    bucket = periodsByType.all?.[key];
  } else if (selection.type === "year") {
    key = String(selection.year);
    bucket = periodsByType.year?.[key];
  } else if (selection.type === "month") {
    key = `${date.getFullYear()}-${String(selection.month).padStart(2, "0")}`;
    bucket = periodsByType.month?.[key];
  } else {
    const days = selection.type === "past30" ? 30 : 7;
    const keys = getPastDayKeys(days, date);
    key = `${keys.at(-1)} to ${keys[0]}`;
    bucket = mergeBuckets(keys.map((dayKey) => periodsByType.day?.[dayKey]));
  }

  const redpandas = bucket?.redpandas || createBucket().redpandas;
  return {
    key,
    redpandas: {
      sources: sortCounts(redpandas.sources),
      total: redpandas.total,
      users: sortUsers(redpandas.users)
    }
  };
}

function getCurrentStats(period, guildId) {
  const stats = readStats();
  const key = getPeriodKey(period);
  const guildStats = stats.guilds[guildId] || { periods: {} };
  const bucket = guildStats.periods[period]?.[key] || createBucket();

  return {
    commands: {
      byName: sortCounts(bucket.commands.byName),
      total: bucket.commands.total,
      users: sortUsers(bucket.commands.users)
    },
    guildId,
    key,
    messages: {
      total: bucket.messages.total,
      users: sortUsers(bucket.messages.users)
    },
    period,
    redpandas: {
      sources: sortCounts(bucket.redpandas.sources),
      total: bucket.redpandas.total,
      users: sortUsers(bucket.redpandas.users)
    }
  };
}

function replaceMessageStats(guildId, messageStatsByPeriod) {
  const stats = readStats();
  const guildStats = getGuildStats(stats, guildId);

  for (const period of periods) {
    guildStats.periods[period] ||= {};

    for (const bucket of Object.values(guildStats.periods[period])) {
      bucket.messages = {
        total: 0,
        users: {}
      };
    }

    for (const [key, messages] of Object.entries(messageStatsByPeriod[period] || {})) {
      const bucket = getBucket(stats, guildId, period, key);
      bucket.messages = messages;
    }
  }

  writeStats(stats);
}

function migrateAllTimeMessageStats() {
  const stats = readStats();
  const results = [];

  for (const [guildId, guildStats] of Object.entries(stats.guilds)) {
    const yearlyBuckets = Object.values(guildStats.periods?.year || {});
    const allTimeMessages = {
      total: 0,
      users: {}
    };

    for (const bucket of yearlyBuckets) {
      allTimeMessages.total += bucket.messages?.total || 0;

      for (const [userId, userStats] of Object.entries(bucket.messages?.users || {})) {
        allTimeMessages.users[userId] ||= {
          count: 0,
          label: userStats.label || userId
        };
        allTimeMessages.users[userId].count += userStats.count || 0;
        allTimeMessages.users[userId].label = userStats.label || allTimeMessages.users[userId].label;
      }
    }

    const bucket = getBucket(stats, guildId, "all", "all-time");
    bucket.messages = allTimeMessages;
    results.push({
      guildId,
      total: allTimeMessages.total,
      users: Object.keys(allTimeMessages.users).length
    });
  }

  writeStats(stats);
  return results;
}

module.exports = {
  getPastDayKeys,
  getPeriodKey,
  getCurrentStats,
  getTopPandaStats,
  migrateAllTimeMessageStats,
  recordCommand,
  recordMessage,
  recordRedPanda,
  replaceMessageStats
};
