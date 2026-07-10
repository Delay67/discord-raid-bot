const { GatewayIntentBits, Partials } = require("discord.js");

const discordClientOptions = {
  // Never allow message content containing @everyone or @here to become a
  // mass mention. This client-wide default applies to sends, replies, edits,
  // follow-ups, and generated LLM responses.
  allowedMentions: {
    parse: ["users", "roles"]
  },
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
};

module.exports = { discordClientOptions };
