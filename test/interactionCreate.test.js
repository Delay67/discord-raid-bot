const assert = require("node:assert/strict");
const test = require("node:test");
const { getCommandAllowedChannelId } = require("../src/events/interactionCreate");
const redPandaCommand = require("../src/commands/redpanda");

test("/redpanda is limited to the red panda channel", () => {
  assert.equal(
    getCommandAllowedChannelId(redPandaCommand),
    "1524831008531157114"
  );
});

test("any-channel commands remain unrestricted", () => {
  assert.equal(getCommandAllowedChannelId({ allowAnyChannel: true }), null);
});
