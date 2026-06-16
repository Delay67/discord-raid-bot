const fs = require("node:fs");
const path = require("node:path");

function loadCommands(client) {
  const commandsPath = path.join(__dirname, "..", "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if (!command.data || !command.execute) {
      console.warn(`Skipped ${file}: command must export data and execute.`);
      continue;
    }

    client.commands.set(command.data.name, command);
  }
}

function getCommandData() {
  const commandsPath = path.join(__dirname, "..", "commands");
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));

  return commandFiles.map((file) => {
    const command = require(path.join(commandsPath, file));
    return command.data.toJSON();
  });
}

module.exports = {
  loadCommands,
  getCommandData
};
