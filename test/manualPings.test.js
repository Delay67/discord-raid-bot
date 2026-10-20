const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "manual-pings-"));
process.env.RAID_BOT_DATA_DIRECTORY = directory;
const { editPing, getPings } = require("../src/services/manualPings");
const store = require("../src/services/raidPeriodStore");
const { checkKazerosReminders } = require("../src/services/kazerosReminderScheduler");
const { getPingReport } = require("../src/commands/checkpings");
const now = new Date("2026-09-21T12:00:00Z");
const base = { weekday: "Friday", startTime: "20:00", raid: "Finale HM", members: ["Delay"] };
test.beforeEach(() => { for (const name of fs.readdirSync(directory)) fs.rmSync(path.join(directory, name), { recursive: true, force: true }); store.writeCurrentKazerosReminders([base]); });
test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
test("removal is limited to the selected week and leaves imported schedules intact", () => {
  assert.equal(editPing("remove", "current", base, now), true);
  assert.deepEqual(getPings("current", now), []);
  assert.deepEqual(getPings("next", now), [base]);
  assert.deepEqual(store.readCurrentKazerosReminders(), [base]);
  assert.equal(editPing("remove", "current", base, now), false);
});
test("upcoming edits preserve prepared raid data and activate at reset, then expire", () => {
  store.writePreparedRaids([{ id: "raid", status: "TODO" }], { kazerosReminders: [] }, now);
  const before = fs.readFileSync(path.join(directory, "raids-prepared.json"), "utf8");
  editPing("set", "next", base, now);
  editPing("set", "next", { ...base, members: ["Jan"] }, now);
  assert.equal(getPings("next", now).length, 1);
  assert.deepEqual(getPings("current", now), [base]);
  assert.equal(fs.readFileSync(path.join(directory, "raids-prepared.json"), "utf8"), before);
  assert.match(getPingReport(now).join("\n"), /Manual schedule saved/);
  store.runRaidWeekRollover(now);
  const reset = new Date("2026-09-23T08:00:00Z");
  store.runRaidWeekRollover(reset);
  assert.deepEqual(getPings("current", reset)[0].members, ["Jan"]);
  assert.deepEqual(getPings("current", new Date("2026-09-30T08:00:00Z")), []);
});
test("scheduler respects removal and sends a manually added reminder only once", async () => {
  const due = new Date("2026-09-18T17:35:00Z");
  const messages = [];
  const client = { channels: { fetch: async () => ({ isTextBased: () => true, send: async message => messages.push(message) }) } };
  editPing("remove", "current", base, due);
  await checkKazerosReminders(client, due);
  assert.equal(messages.length, 0);
  editPing("set", "current", base, due);
  await checkKazerosReminders(client, due);
  await checkKazerosReminders(client, due);
  assert.equal(messages.length, 1);
});
test("commands require Manage Server, private replies, and valid inputs", async () => {
  const command = require("../src/commands/setping");
  const { PermissionFlagsBits } = require("discord.js");
  assert.equal(command.data.toJSON().default_member_permissions, String(PermissionFlagsBits.ManageGuild));
  require("../src/commands/removeping").data.toJSON();
  const responses = [];
  const interaction = { guildId: "guild", memberPermissions: { has: () => false }, reply: async value => responses.push(value) };
  await command.execute(interaction);
  assert.match(responses[0].content, /Manage Server/);
  interaction.memberPermissions.has = () => true;
  const options = { week: "next", day: "Friday", time: "25:00", raid: "Finale HM", members: "Delay" };
  interaction.options = { getString: key => options[key] };
  await command.execute(interaction);
  assert.match(responses[1].content, /HH:MM/);
  options.time = "20:00";
  await command.execute(interaction);
  assert.match(responses[2].content, /saved/);
  assert.ok(responses.every(value => value.ephemeral && value.allowedMentions.parse.length === 0));
});

for (const week of ["current", "next"]) {
  test("removeping clears all raids on a day in " + week + " week only", async () => {
    const otherRaid = { ...base, startTime: "22:00", raid: "Another raid" };
    const otherDay = { ...base, weekday: "Saturday" };
    const reminders = [base, otherRaid, otherDay];
    store.writeCurrentKazerosReminders(reminders);
    const command = require("../src/commands/removeping");
    const options = command.data.toJSON().options;
    assert.deepEqual(options.map(o => [o.name, o.required]), [["week", true], ["day", true]]);
    // Fail if the command attempts to read any absent raid or time option.
    const replies = [];
    const interaction = {
      guildId: "guild", memberPermissions: { has: () => true },
      options: { getString: key => { assert.ok(["week", "day"].includes(key)); return key === "week" ? week : "Friday"; } },
      reply: async value => replies.push(value)
    };
    // Use real time for the command's week selection.
    await command.execute(interaction);
    assert.deepEqual(getPings(week), [otherDay]);
    assert.deepEqual(getPings(week === "current" ? "next" : "current"), reminders);
    assert.deepEqual(store.readCurrentKazerosReminders(), reminders);
    assert.match(replies[0].content, /All reminders removed/);
    assert.equal(replies[0].ephemeral, true);
    assert.deepEqual(replies[0].allowedMentions, { parse: [] });
    await command.execute(interaction);
    assert.match(replies[1].content, /No reminders found/);
  });
}
