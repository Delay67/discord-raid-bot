const assert = require("node:assert/strict");
const test = require("node:test");
const { discordClientOptions } = require("../src/discordClientOptions");

test("globally disables @everyone and @here mass mentions", () => {
  assert.deepEqual(discordClientOptions.allowedMentions.parse, ["users", "roles"]);
  assert.equal(discordClientOptions.allowedMentions.parse.includes("everyone"), false);
});
