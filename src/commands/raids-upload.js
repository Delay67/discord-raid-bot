const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { createPendingImport } = require("../services/xlsxImporter");

function isWorkbookAttachment(attachment) {
  return attachment.name.toLowerCase().endsWith(".xlsx");
}

function formatRaidPreview(raids) {
  const lines = raids.map((raid, index) => {
    const members = raid.members
      .map((member) => `${member.name} (${member.role})`)
      .join(", ");

    return `${index + 1}. ${raid.color} ${raid.name} ${raid.difficulty} - ${members}`;
  });

  const preview = lines.join("\n");

  if (preview.length <= 1600) {
    return preview;
  }

  const truncatedLines = [];
  let length = 0;

  for (const line of lines) {
    if (length + line.length + 1 > 1500) {
      break;
    }

    truncatedLines.push(line);
    length += line.length + 1;
  }

  truncatedLines.push(`...and ${lines.length - truncatedLines.length} more.`);
  return truncatedLines.join("\n");
}

function createConfirmationButtons(importId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raids-upload:confirm:${importId}`)
      .setLabel("Confirm Import")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`raids-upload:cancel:${importId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("raids-upload")
    .setDescription("Admin: upload an .xlsx raid sheet and refresh the raid database.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption((option) =>
      option
        .setName("file")
        .setDescription("The .xlsx workbook with the Serca+Cath sheet")
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment("file", true);

    if (!isWorkbookAttachment(attachment)) {
      await interaction.reply({
        content: "Please upload an `.xlsx` workbook.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const pendingImport = await createPendingImport(attachment, interaction.user.id);
      const preview = formatRaidPreview(pendingImport.raids);

      await interaction.editReply({
        content: [
          `Parsed ${pendingImport.raids.length} raid(s) from \`${attachment.name}\`.`,
          "",
          "Review the preview, then confirm or cancel:",
          "",
          "```text",
          preview,
          "```"
        ].join("\n"),
        components: [createConfirmationButtons(pendingImport.importId)]
      });
    } catch (error) {
      console.error(error);
      await interaction.editReply(
        "I could not parse that workbook. Check the bot logs for the importer error."
      );
    }
  }
};
