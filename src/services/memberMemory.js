const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const memoryPath = path.join(dataDirectory, "member-memory.json");
const maxMemoriesPerMember = 30;
const maxMemoryValueLength = 240;
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

function normalizeUpdate(update) {
  const key = String(update?.key || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);
  const value = String(update?.value || "").replace(/\s+/g, " ").trim()
    .slice(0, maxMemoryValueLength);

  if (
    !key ||
    !value ||
    blockedKeyPattern.test(key) ||
    blockedValuePatterns.some((pattern) => pattern.test(value))
  ) {
    return null;
  }
  return { key, value };
}

function upsertMemberMemories(guildId, userId, updates, filePath = memoryPath) {
  const normalizedUpdates = updates.map(normalizeUpdate).filter(Boolean);
  if (!guildId || !userId || normalizedUpdates.length === 0) return 0;

  const store = readStore(filePath);
  store.guilds[guildId] ||= { members: {} };
  store.guilds[guildId].members ||= {};
  const record = store.guilds[guildId].members[userId] ||= { memories: {} };
  record.memories ||= {};

  for (const update of normalizedUpdates) {
    record.memories[update.key] = {
      updatedAt: new Date().toISOString(),
      value: update.value
    };
  }

  const entries = Object.entries(record.memories)
    .sort(([, left], [, right]) => right.updatedAt.localeCompare(left.updatedAt));
  record.memories = Object.fromEntries(entries.slice(0, maxMemoriesPerMember));
  writeStore(store, filePath);
  return normalizedUpdates.length;
}

module.exports = {
  getMemberMemories,
  upsertMemberMemories
};
