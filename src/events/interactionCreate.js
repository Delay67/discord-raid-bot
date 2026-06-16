const { Events } = require("discord.js");
const { channelId } = require("../config");
const { scheduleInteractionCleanup } = require("../services/cleanup");

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      await interaction.reply({
        content: "I do not know how to handle that command yet.",
        ephemeral: true
      });
      return;
    }

    if (!command.allowAnyChannel && interaction.channelId !== channelId) {
      await interaction.reply({
        content: `Please use bot commands in <#${channelId}>.`,
        ephemeral: true
      });
      return;
    }

    try {
      await command.execute(interaction);

      if (
        interaction.channelId === channelId &&
        (interaction.replied || interaction.deferred)
      ) {
        scheduleInteractionCleanup(interaction);
      }
    } catch (error) {
      console.error(error);

      const response = {
        content: "Something went wrong while running that command.",
        ephemeral: true
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(response);
      } else {
        await interaction.reply(response);
      }
    }
  }
};
