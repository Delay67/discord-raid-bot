const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");
const { loadCommands } = require("./loaders/commands");
const { loadEvents } = require("./loaders/events");
const { token, validateEnvironment } = require("./config");

validateEnvironment();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildEmojisAndStickers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.commands = new Collection();

loadCommands(client);
loadEvents(client);

client.login(token);
