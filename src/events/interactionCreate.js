const { Events } = require("discord.js");
const { channelId, cleanupDelayMs } = require("../config");

function scheduleReplyCleanup(interaction) {
  const timeout = setTimeout(async () => {
    try {
      await interaction.deleteReply();
    } catch (error) {
      if (error.code !== 10008 && error.code !== 10062) {
        console.error(error);
      }
    }
  }, cleanupDelayMs);

  timeout.unref?.();
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.channelId !== channelId) {
      await interaction.reply({
        content: `Please use bot commands in <#${channelId}>.`,
        ephemeral: true
      });
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

    try {
      await command.execute(interaction);

      if (interaction.replied || interaction.deferred) {
        scheduleReplyCleanup(interaction);
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
