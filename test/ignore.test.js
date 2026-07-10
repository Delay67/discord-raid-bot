const assert = require("node:assert/strict");
const test = require("node:test");
const { PermissionFlagsBits } = require("discord.js");
const ignoreCommand = require("../src/commands/ignore");
const { getIgnoredUserIds } = require("../src/services/botSettings");

test("/ignore is a Manage Server user toggle available in any channel", () => {
  const data = ignoreCommand.data.toJSON();

  assert.equal(data.name, "ignore");
  assert.equal(data.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
  assert.equal(data.options[0].name, "user");
  assert.equal(data.options[0].required, true);
  assert.equal(ignoreCommand.allowAnyChannel, true);
});

test("ignored users are stored separately for each server", () => {
  const settings = {
    ignoredUserIdsByGuild: {
      guildA: ["one", "two"],
      guildB: ["three"]
    }
  };

  assert.deepEqual(getIgnoredUserIds("guildA", settings), ["one", "two"]);
  assert.deepEqual(getIgnoredUserIds("guildB", settings), ["three"]);
  assert.deepEqual(getIgnoredUserIds("guildC", settings), []);
});
