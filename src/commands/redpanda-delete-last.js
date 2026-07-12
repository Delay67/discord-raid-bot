const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const path = require("node:path");
const {
  deleteLastLocalSelection,
  getLastLocalSelection
} = require("../services/redPandaStore");

const CONFIRM_ID = "redpanda-delete-last:confirm";
const CANCEL_ID = "redpanda-delete-last:cancel";

function confirmationButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CONFIRM_ID)
      .setLabel("Delete file")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(CANCEL_ID)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("redpanda-delete-last")
    .setDescription("Admin: delete the last local red panda file the bot posted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const candidate = getLastLocalSelection();

    if (!candidate.ok) {
      await interaction.reply({
        content: candidate.reason,
        ephemeral: true
      });
      return;
    }

    const { selection } = candidate;
    const fileName = path.basename(selection.file);

    const response = await interaction.reply({
      content: `Delete this red panda file?\n\`${fileName}\`\n\nThis permanently removes the file from the bot's media folder.`,
      components: [confirmationButtons()],
      ephemeral: true,
      fetchReply: true
    });

    let confirmation;

    try {
      confirmation = await response.awaitMessageComponent({
        filter: (button) => button.user.id === interaction.user.id,
        time: 60_000
      });
    } catch {
      await interaction.editReply({
        content: `Deletion timed out. Nothing was deleted.\n\`${fileName}\``,
        components: []
      });
      return;
    }

    if (confirmation.customId === CANCEL_ID) {
      await confirmation.update({
        content: `Deletion cancelled. Nothing was deleted.\n\`${fileName}\``,
        components: []
      });
      return;
    }

    const result = deleteLastLocalSelection(selection.selectedAt);

    if (!result.ok) {
      await confirmation.update({
        content: result.reason,
        components: []
      });
      return;
    }

    console.log(
      `Red panda deleted: ${JSON.stringify({
        file: result.file,
        userId: interaction.user.id,
        userTag: interaction.user.tag
      })}`
    );

    await confirmation.update({
      content: `Deleted last red panda file:\n\`${result.file}\``,
      components: []
    });
  }
};
