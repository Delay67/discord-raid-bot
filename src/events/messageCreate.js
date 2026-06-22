const { Events } = require("discord.js");
const { channelId } = require("../config");
const { recordMessage } = require("../services/activityStats");
const { deleteMessage } = require("../services/cleanup");

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.system && !message.author.bot && message.guildId) {
      recordMessage(message);
    }

    if (message.channelId !== channelId || message.system || message.pinned) {
      return;
    }

    if (!message.author.bot) {
      await deleteMessage(message);
    }
  }
};
