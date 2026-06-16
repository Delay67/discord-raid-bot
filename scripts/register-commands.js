const { REST, Routes } = require("discord.js");
const { token, validateEnvironment } = require("../src/config");
const { getCommandData } = require("../src/loaders/commands");

validateEnvironment();

const commands = getCommandData();
const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const application = await rest.get(Routes.oauth2CurrentApplication());

  console.log(`Registering ${commands.length} global command(s).`);

  await rest.put(Routes.applicationCommands(application.id), {
    body: commands
  });

  console.log("Slash commands registered.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
