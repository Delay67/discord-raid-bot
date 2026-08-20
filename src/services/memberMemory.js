const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const memoryPath = path.join(dataDirectory, "member-memory.json");
const maxMemoriesPerMember = 30;
const maxMemoryValueLength = 240;
const maxLoggedValueLength = 80;
const blockedKeyPattern = /(?:address|bank|card|contact|credential|diagnosis|email|health|medical|password|phone|secret|token)/i;
const blockedValuePatterns = [
  /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/i,
  /\b(?:\d[ -]*?){13,19}\b/,
  /\b(?:api[_ -]?key|password|secret|token)\b\s*[:=]/i
];

function createEmptyStore() {
  return { guilds: {}, version: 1 };
}
//test
function readStore(filePath = memoryPath) {
  if (!fs.existsSync(filePath)) return createEmptyStore();

  const store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  store.guilds ||= {};
  return store;
}

function writeStore(store, filePath = memoryPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  fs.renameSync(temporaryPath, filePath);
}

function getMemberRecord(store, guildId, userId) {
  return store.guilds[guildId]?.members?.[userId] || null;
}

function getMemberMemories(guildId, userId, filePath = memoryPath) {
  const record = getMemberRecord(readStore(filePath), guildId, userId);

  if (!record?.memories) return [];

  return Object.entries(record.memories)
    .sort(([, left], [, right]) => left.updatedAt.localeCompare(right.updatedAt))
    .map(([key, memory]) => ({ key, value: memory.value }));
}

function getGuildMemberIds(guildId, filePath = memoryPath) {
  const members = readStore(filePath).guilds[guildId]?.members;
  return members ? Object.keys(members) : [];
}

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
}

function normalizeUpdate(update) {
  const key = normalizeKey(update?.key);
  const operation = String(update?.operation || "set").toLowerCase();

  if (!key || blockedKeyPattern.test(key)) return null;
  if (["delete", "remove"].includes(operation)) {
    return { key, operation: "delete" };
  }

  const value = String(update?.value || "").replace(/\s+/g, " ").trim()
    .slice(0, maxMemoryValueLength);

  if (
    !value ||
    blockedValuePatterns.some((pattern) => pattern.test(value))
  ) {
    return null;
  }
  return { key, operation: "set", value };
}

function compactLoggedValue(value) {
  const text = String(value || "");
  return text.length > maxLoggedValueLength
    ? `${text.slice(0, maxLoggedValueLength - 3)}...`
    : text;
}

function logMemoryMutation(logger, { guildId, userId, source, ...mutation }) {
  logger("[member-memory]", JSON.stringify({
    guildId,
    userId,
    source,
    ...mutation
  }));
}

function upsertMemberMemories(
  guildId,
  userId,
  updates,
  filePathOrOptions = memoryPath,
  suppliedOptions = {}
) {
  const filePath = typeof filePathOrOptions === "string" ? filePathOrOptions : memoryPath;
  const options = typeof filePathOrOptions === "string" ? suppliedOptions : filePathOrOptions;
  const source = String(options?.source || "unspecified");
  const logger = options?.logger || console.log;
  const normalizedUpdates = updates.map(normalizeUpdate).filter(Boolean);
  if (!guildId || !userId || normalizedUpdates.length === 0) return 0;

  const store = readStore(filePath);
  store.guilds[guildId] ||= { members: {} };
  store.guilds[guildId].members ||= {};
  const record = store.guilds[guildId].members[userId] ||= { memories: {} };
  record.memories ||= {};

  let appliedUpdates = 0;
  const mutations = [];
  for (const update of normalizedUpdates) {
    if (update.operation === "delete") {
      if (Object.hasOwn(record.memories, update.key)) {
        const oldValue = record.memories[update.key].value;
        delete record.memories[update.key];
        appliedUpdates += 1;
        mutations.push({
          action: "deleted",
          key: update.key,
          oldValue: compactLoggedValue(oldValue)
        });
      }
      continue;
    }

    const previous = record.memories[update.key];
    if (previous?.value === update.value) continue;
    record.memories[update.key] = {
      updatedAt: new Date().toISOString(),
      value: update.value
    };
    appliedUpdates += 1;
    mutations.push({
      action: previous ? "updated" : "added",
      key: update.key,
      ...(previous ? { oldValue: compactLoggedValue(previous.value) } : {}),
      value: compactLoggedValue(update.value)
    });
  }

  const entries = Object.entries(record.memories)
    .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt));
  for (const [key, memory] of entries.slice(maxMemoriesPerMember)) {
    mutations.push({
      action: "deleted",
      key,
      oldValue: compactLoggedValue(memory.value),
      reason: "capacity"
    });
  }
  record.memories = Object.fromEntries(entries.slice(0, maxMemoriesPerMember));
  if (appliedUpdates > 0) {
    writeStore(store, filePath);
    for (const mutation of mutations) {
      logMemoryMutation(logger, { guildId, userId, source, ...mutation });
    }
  }
  return appliedUpdates;
}

module.exports = {
  getGuildMemberIds,
  getMemberMemories,
  upsertMemberMemories
};
