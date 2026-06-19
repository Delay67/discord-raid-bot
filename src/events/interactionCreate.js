const { Events } = require("discord.js");
const { channelId } = require("../config");
const { scheduleInteractionCleanup } = require("../services/cleanup");
const {
  cancelPendingImport,
  confirmPendingImport
} = require("../services/xlsxImporter");

async function handleRaidUploadButton(interaction) {
  const [, action, importId] = interaction.customId.split(":");
  const result =
    action === "confirm"
      ? await confirmPendingImport(importId, interaction.user.id)
      : await cancelPendingImport(importId, interaction.user.id);

  if (!result.ok) {
    await interaction.reply({
      content: result.message,
      ephemeral: true
    });
    return;
  }

  const content =
    action === "confirm"
      ? `Imported ${result.importedCount} raid(s) from the workbook.`
      : "Raid import cancelled.";

  await interaction.update({
    content,
    components: []
  });
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isButton() && interaction.customId.startsWith("raids-upload:")) {
      try {
        await handleRaidUploadButton(interaction);
      } catch (error) {
        console.error(error);

        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: "Something went wrong while handling that import.",
            ephemeral: true
          });
        }
      }
      return;
    }

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
        !command.skipCleanup &&
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
