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

function getCommandOptions(interaction) {
  return interaction.options.data.map((option) => ({
    name: option.name,
    type: option.type,
    value: option.attachment ? option.attachment.name : option.value
  }));
}

function getUserLabel(user) {
  return `${user.tag || user.username} (${user.id})`;
}

function logCommandUsage(interaction, status, details = {}) {
  const payload = {
    channelId: interaction.channelId,
    command: interaction.commandName,
    durationMs: details.durationMs,
    guildId: interaction.guildId,
    options: getCommandOptions(interaction),
    status,
    user: getUserLabel(interaction.user)
  };

  if (details.reason) {
    payload.reason = details.reason;
  }

  console.log(`Command usage: ${JSON.stringify(payload)}`);
}

function logButtonUsage(interaction, status, details = {}) {
  const payload = {
    channelId: interaction.channelId,
    customId: interaction.customId,
    durationMs: details.durationMs,
    guildId: interaction.guildId,
    status,
    user: getUserLabel(interaction.user)
  };

  if (details.reason) {
    payload.reason = details.reason;
  }

  console.log(`Button usage: ${JSON.stringify(payload)}`);
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (interaction.isButton() && interaction.customId.startsWith("raids-upload:")) {
      const startedAt = Date.now();

      try {
        await handleRaidUploadButton(interaction);
        logButtonUsage(interaction, "success", {
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        console.error(error);
        logButtonUsage(interaction, "error", {
          durationMs: Date.now() - startedAt,
          reason: error.message
        });

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
      logCommandUsage(interaction, "unknown-command");
      await interaction.reply({
        content: "I do not know how to handle that command yet.",
        ephemeral: true
      });
      return;
    }

    if (!command.allowAnyChannel && interaction.channelId !== channelId) {
      logCommandUsage(interaction, "blocked-channel", {
        reason: `Expected ${channelId}`
      });
      await interaction.reply({
        content: `Please use bot commands in <#${channelId}>.`,
        ephemeral: true
      });
      return;
    }

    const startedAt = Date.now();

    try {
      await command.execute(interaction);
      logCommandUsage(interaction, "success", {
        durationMs: Date.now() - startedAt
      });

      if (
        !command.skipCleanup &&
        interaction.channelId === channelId &&
        (interaction.replied || interaction.deferred)
      ) {
        scheduleInteractionCleanup(interaction);
      }
    } catch (error) {
      console.error(error);
      logCommandUsage(interaction, "error", {
        durationMs: Date.now() - startedAt,
        reason: error.message
      });

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
