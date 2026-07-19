const { ActivityType } = require("discord.js");
const { isMentionLlmEnabled } = require("./botSettings");

const LLM_ENABLED_STATUS = "Hello!";
const LLM_DISABLED_STATUS = "I'm sleeping";

function updateLlmPresence(client, enabled = isMentionLlmEnabled()) {
  const statusText = enabled ? LLM_ENABLED_STATUS : LLM_DISABLED_STATUS;

  client.user.setPresence({
    activities: [
      {
        name: statusText,
        state: statusText,
        type: ActivityType.Custom
      }
    ],
    status: "online"
  });
}

module.exports = {
  LLM_DISABLED_STATUS,
  LLM_ENABLED_STATUS,
  updateLlmPresence
};
