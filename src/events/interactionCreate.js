const { Events } = require("discord.js");
const { channelId } = require("../config");
const { recordCommand } = require("../services/activityStats");
const { scheduleInteractionCleanup } = require("../services/cleanup");
const { isUserIgnored } = require("../services/botSettings");
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

function getUserLabel(user) {
  return `${user.tag || user.username} (${user.id})`;
}

function logCommandUsage(interaction) {
  const details = interaction.commandLogDetails;
  const redPandaDetails =
    interaction.commandName === "redpanda" && details
      ? ` | Image: ${details.image || "none"} | Math.random(): ${details.randomValue}`
      : "";

  console.log(
    `Command: /${interaction.commandName} | Used by: ${getUserLabel(interaction.user)}${redPandaDetails}`
  );
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

function getCommandAllowedChannelId(command) {
  if (command.allowedChannelId) {
    return command.allowedChannelId;
  }

  return command.allowAnyChannel ? null : channelId;
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    if (
      interaction.user &&
      isUserIgnored(interaction.guildId, interaction.user.id) &&
      interaction.commandName !== "ignore"
    ) {
      return;
    }

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
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);

        if (!command?.autocomplete) {
          return;
        }

        try {
          await command.autocomplete(interaction);
        } catch (error) {
          console.error(error);
        }
      }

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

    const allowedChannelId = getCommandAllowedChannelId(command);

    if (allowedChannelId && interaction.channelId !== allowedChannelId) {
      logCommandUsage(interaction, "blocked-channel", {
        reason: `Expected ${allowedChannelId}`
      });
      await interaction.reply({
        content: `Please use bot commands in <#${allowedChannelId}>.`,
        ephemeral: true
      });
      return;
    }

    const startedAt = Date.now();

    try {
      await command.execute(interaction);
      recordCommand(interaction);
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

module.exports.getCommandAllowedChannelId = getCommandAllowedChannelId;
