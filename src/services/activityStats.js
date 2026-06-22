const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const statsPath = path.join(dataDirectory, "activity-stats.json");
const periods = ["week", "month", "year"];

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(statsPath)) {
    fs.writeFileSync(statsPath, `${JSON.stringify({ periods: {} }, null, 2)}\n`, "utf8");
  }
}

function readStats() {
  ensureStore();
  return JSON.parse(fs.readFileSync(statsPath, "utf8"));
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
  if (period === "week") {
    return getIsoWeek(date);
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

function getBucket(stats, period, key) {
  stats.periods[period] ||= {};
  stats.periods[period][key] ||= createBucket();
  return stats.periods[period][key];
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

function updateCurrentBuckets(updateBucket) {
  const stats = readStats();
  const now = new Date();

  for (const period of periods) {
    updateBucket(getBucket(stats, period, getPeriodKey(period, now)));
  }

  writeStats(stats);
}

function recordMessage(message) {
  updateCurrentBuckets((bucket) => {
    bucket.messages.total += 1;
    incrementUser(bucket.messages.users, message.author);
  });
}

function recordCommand(interaction) {
  updateCurrentBuckets((bucket) => {
    bucket.commands.total += 1;
    bucket.commands.byName[interaction.commandName] =
      (bucket.commands.byName[interaction.commandName] || 0) + 1;
    incrementUser(bucket.commands.users, interaction.user);
  });
}

function recordRedPanda(interaction, source) {
  updateCurrentBuckets((bucket) => {
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

function getCurrentStats(period) {
  const stats = readStats();
  const key = getPeriodKey(period);
  const bucket = stats.periods[period]?.[key] || createBucket();

  return {
    commands: {
      byName: sortCounts(bucket.commands.byName),
      total: bucket.commands.total,
      users: sortUsers(bucket.commands.users)
    },
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

function replaceMessageStats(messageStatsByPeriod) {
  const stats = readStats();

  for (const period of periods) {
    stats.periods[period] ||= {};

    for (const bucket of Object.values(stats.periods[period])) {
      bucket.messages = {
        total: 0,
        users: {}
      };
    }

    for (const [key, messages] of Object.entries(messageStatsByPeriod[period] || {})) {
      const bucket = getBucket(stats, period, key);
      bucket.messages = messages;
    }
  }

  writeStats(stats);
}

module.exports = {
  getPeriodKey,
  getCurrentStats,
  recordCommand,
  recordMessage,
  recordRedPanda,
  replaceMessageStats
};
