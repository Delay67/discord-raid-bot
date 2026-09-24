const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { PermissionFlagsBits } = require("discord.js");

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "checkpings-"));
process.env.RAID_BOT_DATA_DIRECTORY = directory;
process.env.KAZEROS_DISCORD_IDS = "Delay:123456789012345678";
const command = require("../src/commands/checkpings");
const monday = new Date("2026-09-21T12:00:00Z");
const reminder = { weekday: "Wednesday", startTime: "20:00", raid: "Finale HM", members: ["Delay", "Jan"] };
const write = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value));

test.beforeEach(() => {
  for (const name of fs.readdirSync(directory)) fs.unlinkSync(path.join(directory, name));
});
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

test("reports missing current and prepared reminders without creating files", () => {
  const report = command.getPingReport(monday).join("\n");
  assert.match(report, /Current week — 2026-09-16 \(0 reminders\)/);
  assert.match(report, /Upcoming week — 2026-09-23 \(0 reminders\)/);
  assert.match(report, /No prepared import saved/);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test("reads saved current and upcoming reminders without changing completion or preparation data", () => {
  write("raids.json", [{ id: "completed", status: "DONE" }]);
  write("kazeros-reminders.json", [reminder]);
  write("raids-prepared.json", { targetDate: "2026-09-23", raids: [], kazerosReminders: [reminder] });
  const before = fs.readdirSync(directory).map((name) => [name, fs.readFileSync(path.join(directory, name), "utf8")]);
  const report = command.getPingReport(monday).join("\n");
  assert.match(report, /Current week — 2026-09-16 \(1 reminders\)/);
  assert.match(report, /Upcoming week — 2026-09-23 \(1 reminders\)/);
  assert.match(report, /Wednesday 19:30 — Finale HM starts at 20:00/);
  assert.match(report, /no Discord ping mapping for: Jan\./);
  assert.match(report, /activates Wednesday at 10:00/);
  for (const [name, contents] of before) assert.equal(fs.readFileSync(path.join(directory, name), "utf8"), contents);
});

test("does not label a stale preparation as upcoming", () => {
  write("raids-prepared.json", { targetDate: "2026-09-16", raids: [], kazerosReminders: [reminder] });
  const report = command.getPingReport(monday).join("\n");
  assert.match(report, /not valid for the upcoming week \(target: 2026-09-16\)/);
  assert.doesNotMatch(report, /Wednesday 19:30/);
});

test("distinguishes a prepared roster with no reminders", () => {
  write("raids-prepared.json", { targetDate: "2026-09-23", raids: [] });
  const report = command.getPingReport(monday).join("\n");
  assert.match(report, /Prepared import saved/);
  assert.match(report, /Upcoming week — 2026-09-23 \(0 reminders\)/);
});

test("large reports fit private Discord messages", () => {
  write("kazeros-reminders.json", Array.from({ length: 80 }, () => reminder));
  const pages = command.getPingReport(monday);
  assert.ok(pages.length > 1);
  assert.ok(pages.every((page) => page.length <= 2000));
});

test("requires Manage Server at registration and runtime", async () => {
  assert.equal(command.data.toJSON().default_member_permissions, String(PermissionFlagsBits.ManageGuild));
  let response;
  await command.execute({ guildId: "guild", memberPermissions: { has: () => false }, reply: async (value) => { response = value; } });
  assert.equal(response.ephemeral, true);
  assert.match(response.content, /need Manage Server/);
});

test("admin report is private and cannot ping members", async () => {
  const responses = [];
  await command.execute({
    guildId: "guild",
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    deferReply: async (value) => responses.push(value),
    editReply: async (value) => responses.push(value)
  });
  assert.equal(responses[0].ephemeral, true);
  assert.deepEqual(responses[1].allowedMentions, { parse: [] });
});
