const { Client, Collection } = require("discord.js");
const { discordClientOptions } = require("./discordClientOptions");
const { loadCommands } = require("./loaders/commands");
const { loadEvents } = require("./loaders/events");
const { token, validateEnvironment } = require("./config");

validateEnvironment();

const client = new Client(discordClientOptions);

client.commands = new Collection();

loadCommands(client);
loadEvents(client);

client.login(token);
