const { Client, Collection, GatewayIntentBits } = require("discord.js");
const { loadCommands } = require("./loaders/commands");
const { loadEvents } = require("./loaders/events");
const { token, validateEnvironment } = require("./config");

validateEnvironment();

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.commands = new Collection();

loadCommands(client);
loadEvents(client);

client.login(token);
