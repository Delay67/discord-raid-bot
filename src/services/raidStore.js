const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const raidsPath = path.join(dataDirectory, "raids.json");

function ensureStore() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }

  if (!fs.existsSync(raidsPath)) {
    fs.writeFileSync(raidsPath, "[]\n", "utf8");
  }
}

function readRaids() {
  ensureStore();

  const contents = fs.readFileSync(raidsPath, "utf8");
  return JSON.parse(contents);
}

function writeRaids(raids) {
  ensureStore();
  fs.writeFileSync(raidsPath, `${JSON.stringify(raids, null, 2)}\n`, "utf8");
}

function normalizePlayerName(name) {
  return name.trim().split("-")[0].trim().toLowerCase();
}

function parseMembers(value, role) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      name,
      lookupName: normalizePlayerName(name),
      role
    }));
}

function addRaid({ color, name, difficulty, dps, supports, createdBy }) {
  const raids = readRaids();
  const raid = {
    id: `${Date.now()}`,
    color: color.trim(),
    name: name.trim(),
    difficulty: difficulty.trim(),
    members: [
      ...parseMembers(dps, "DPS"),
      ...parseMembers(supports, "Support")
    ],
    createdBy,
    createdAt: new Date().toISOString()
  };

  raids.push(raid);
  writeRaids(raids);

  return raid;
}

function clearRaids() {
  writeRaids([]);
}

function resetRaidsToTodo({ resetBy = "weekly-reset" } = {}) {
  const raids = readRaids();
  let resetCount = 0;
  const resetAt = new Date().toISOString();

  const updatedRaids = raids.map((raid) => {
    if ((raid.status || "TODO") !== "DONE") {
      return raid;
    }

    resetCount += 1;

    const {
      completedAt,
      completedBy,
      ...rest
    } = raid;

    return {
      ...rest,
      status: "TODO",
      resetAt,
      resetBy
    };
  });

  if (resetCount > 0) {
    writeRaids(updatedRaids);
  }

  return {
    resetCount,
    totalCount: raids.length
  };
}

function getRaidStats() {
  const raids = readRaids();
  const stats = raids.reduce(
    (counts, raid) => {
      const status = raid.status || "TODO";
      counts.total += 1;
      counts.byStatus[status] = (counts.byStatus[status] || 0) + 1;
      counts.byColor[raid.color] = (counts.byColor[raid.color] || 0) + 1;
      return counts;
    },
    {
      byColor: {},
      byStatus: {},
      total: 0
    }
  );

  return stats;
}

function getColorSuggestions(query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const colors = [...new Set(readRaids().map((raid) => raid.color))].sort((left, right) =>
    left.localeCompare(right)
  );

  return colors
    .filter((color) => color.toLowerCase().includes(normalizedQuery))
    .slice(0, 25);
}

function getPlayerSuggestions(query = "") {
  const normalizedQuery = normalizePlayerName(query);
  const players = new Map();

  for (const raid of readRaids()) {
    for (const member of raid.members) {
      if (!players.has(member.lookupName)) {
        players.set(member.lookupName, member.name);
      }
    }
  }

  return [...players.entries()]
    .filter(([lookupName, name]) => {
      if (!normalizedQuery) {
        return true;
      }

      return lookupName.includes(normalizedQuery) || name.toLowerCase().includes(normalizedQuery);
    })
    .map(([, name]) => name)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 25);
}

function completeRaids({ color, raidName, completedBy }) {
  const normalizedColor = color.trim().toLowerCase();
  const normalizedRaidName = raidName?.trim().toLowerCase();
  const raids = readRaids();
  let matchedCount = 0;
  let completedCount = 0;
  const completedAt = new Date().toISOString();

  const updatedRaids = raids.map((raid) => {
    const matchesColor = raid.color.toLowerCase() === normalizedColor;
    const matchesRaidName =
      !normalizedRaidName || raid.name.toLowerCase() === normalizedRaidName;

    if (!matchesColor || !matchesRaidName) {
      return raid;
    }

    matchedCount += 1;

    if ((raid.status || "TODO") === "DONE") {
      return raid;
    }

    completedCount += 1;

    return {
      ...raid,
      status: "DONE",
      completedBy,
      completedAt
    };
  });

  if (completedCount > 0) {
    writeRaids(updatedRaids);
  }

  return {
    completedCount,
    matchedCount
  };
}

function lookupRaids(playerName) {
  const normalizedName = normalizePlayerName(playerName);
  const raids = readRaids();

  return raids
    .map((raid) => {
      const matches = raid.members.filter(
        (member) => member.lookupName === normalizedName
      );

      if (matches.length === 0) {
        return null;
      }

      const roleCounts = matches.reduce((counts, member) => {
        counts[member.role] = (counts[member.role] || 0) + 1;
        return counts;
      }, {});

      return {
        raid,
        roleCounts
      };
    })
    .filter(Boolean);
}

function findComboRaids(playerNames) {
  const normalizedNames = playerNames.map(normalizePlayerName);
  const raids = readRaids();

  return raids.filter((raid) => {
    const raidMemberNames = new Set(raid.members.map((member) => member.lookupName));
    return normalizedNames.every((name) => raidMemberNames.has(name));
  });
}

module.exports = {
  addRaid,
  clearRaids,
  completeRaids,
  findComboRaids,
  getColorSuggestions,
  getPlayerSuggestions,
  getRaidStats,
  lookupRaids,
  normalizePlayerName,
  readRaids,
  resetRaidsToTodo
};
