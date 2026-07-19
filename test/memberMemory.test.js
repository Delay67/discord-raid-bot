const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getGuildMemberIds,
  getMemberMemories,
  upsertMemberMemories
} = require("../src/services/memberMemory");

test("persists and updates memories per guild member", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "member-memory-"));
  const filePath = path.join(directory, "memory.json");
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  upsertMemberMemories("guild-a", "user-a", [
    { key: "main class", value: "Gunlancer" }
  ], filePath);
  upsertMemberMemories("guild-a", "user-a", [
    { key: "main_class", value: "Artist" }
  ], filePath);

  assert.deepEqual(getMemberMemories("guild-a", "user-a", filePath), [
    { key: "main_class", value: "Artist" }
  ]);
  assert.deepEqual(getMemberMemories("guild-a", "other-user", filePath), []);
  assert.deepEqual(getGuildMemberIds("guild-a", filePath), ["user-a"]);
});

test("rejects obvious sensitive memory fields", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "member-memory-"));
  const filePath = path.join(directory, "memory.json");
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  upsertMemberMemories("guild-a", "user-a", [
    { key: "email", value: "person@example.com" },
    { key: "api_key", value: "secret: abc123" }
  ], filePath);

  assert.deepEqual(getMemberMemories("guild-a", "user-a", filePath), []);
});

test("deletes an existing memory by exact normalized key", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "member-memory-"));
  const filePath = path.join(directory, "memory.json");
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  upsertMemberMemories("guild-a", "user-a", [
    { key: "main_class", value: "Bard" },
    { key: "burger_preference", value: "no onions" }
  ], filePath);
  const applied = upsertMemberMemories("guild-a", "user-a", [
    { operation: "delete", key: "burger preference" }
  ], filePath);

  assert.equal(applied, 1);
  assert.deepEqual(getMemberMemories("guild-a", "user-a", filePath), [
    { key: "main_class", value: "Bard" }
  ]);
});

test("ignores deletion requests for keys that do not exist", (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "member-memory-"));
  const filePath = path.join(directory, "memory.json");
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  upsertMemberMemories("guild-a", "user-a", [
    { key: "main_class", value: "Bard" }
  ], filePath);

  assert.equal(upsertMemberMemories("guild-a", "user-a", [
    { operation: "delete", key: "missing_note" }
  ], filePath), 0);
  assert.deepEqual(getMemberMemories("guild-a", "user-a", filePath), [
    { key: "main_class", value: "Bard" }
  ]);
});
