const assert = require("node:assert/strict");
const test = require("node:test");

test("mytimes sends every summary page privately for the invoking member", async () => {
  const servicePath = require.resolve("../src/services/raidPlans");
  const actual = require(servicePath);
  require.cache[servicePath].exports = { ...actual, getMyTimes: owner => {
    assert.deepEqual(owner, { guildId: "guild", userId: "member" });
    return ["first page", "second page"];
  } };
  let command;
  try { command = require("../src/commands/mytimes"); }
  finally { require.cache[servicePath].exports = actual; }
  assert.equal(command.data.toJSON().name, "mytimes");
  assert.equal(command.data.toJSON().dm_permission, false);
  const sent = [];
  await command.execute({
    guildId: "guild", user: { id: "member" },
    deferReply: async payload => assert.equal(payload.ephemeral, true),
    editReply: async payload => sent.push(payload),
    followUp: async payload => {
      assert.equal(payload.ephemeral, true);
      sent.push(payload);
    }
  });
  assert.deepEqual(sent.map(payload => payload.content), ["first page", "second page"]);
  for (const payload of sent) assert.deepEqual(payload.allowedMentions, { parse: [] });
});
