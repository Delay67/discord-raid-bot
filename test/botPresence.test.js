const assert = require("node:assert/strict");
const test = require("node:test");
const { ActivityType } = require("discord.js");
const {
  LLM_DISABLED_STATUS,
  LLM_ENABLED_STATUS,
  updateLlmPresence
} = require("../src/services/botPresence");

function createClient() {
  const calls = [];

  return {
    calls,
    user: {
      setPresence(presence) {
        calls.push(presence);
      }
    }
  };
}

test("uses the awake custom status when LLM mode is enabled", () => {
  const client = createClient();

  updateLlmPresence(client, true);

  assert.deepEqual(client.calls, [
    {
      activities: [
        {
          name: LLM_ENABLED_STATUS,
          state: "Hello!",
          type: ActivityType.Custom
        }
      ],
      status: "online"
    }
  ]);
});

test("uses the sleeping custom status when LLM mode is disabled", () => {
  const client = createClient();

  updateLlmPresence(client, false);

  assert.equal(client.calls[0].activities[0].state, "I'm sleeping");
  assert.equal(client.calls[0].activities[0].name, LLM_DISABLED_STATUS);
});
