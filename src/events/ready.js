const { Events } = require("discord.js");
const { updateLlmPresence } = require("../services/botPresence");
const { startWeeklyRaidResetScheduler } = require("../services/weeklyRaidReset");

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`Logged in as ${client.user.tag}`);
    updateLlmPresence(client);
    startWeeklyRaidResetScheduler();
  }
};
