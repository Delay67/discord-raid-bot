const {
  ActionRowBuilder,
  AttachmentBuilder,
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
  return raids.map((raid, index) => {
    const members = raid.members
      .map((member) => `${member.name} (${member.role})`)
      .join(", ");

    return `${index + 1}. ${raid.color} ${raid.name} ${raid.difficulty} - ${members}`;
  }).join("\n");
}

function formatRaidSummary(raids) {
  const grouped = new Map();

  for (const raid of raids) {
    const key = raid.color;
    grouped.set(key, (grouped.get(key) || 0) + 1);
  }

  return [...grouped.entries()]
    .map(([color, count]) => `${color}: ${count}`)
    .join("\n");
}

function createPreviewAttachment(preview) {
  return new AttachmentBuilder(Buffer.from(preview, "utf8"), {
    name: "raid-import-preview.txt"
  });
}

function formatPreviewMessage({ attachmentName, raids, summary }) {
  return [
    `Parsed ${raids.length} raid(s) from \`${attachmentName}\`.`,
    "",
    "Summary by color:",
    "```text",
    summary,
    "```",
    "Open `raid-import-preview.txt` for the full parsed preview, then confirm or cancel."
  ].join("\n");
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
      const summary = formatRaidSummary(pendingImport.raids);

      await interaction.editReply({
        content: formatPreviewMessage({
          attachmentName: attachment.name,
          raids: pendingImport.raids,
          summary
        }),
        files: [createPreviewAttachment(preview)],
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
