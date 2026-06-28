const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { publishSchedule } = require("../services/schedulePublisher");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-set")
    .setDescription("Admin: upload the current raid schedule image.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("Raid schedule image")
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment("image", true);

    if (!attachment.contentType?.startsWith("image/")) {
      await interaction.reply({
        content: "Please upload an image file.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({
      ephemeral: true
    });

    const cleanupResult = await publishSchedule(
      interaction.client,
      attachment,
      interaction.user.id
    );

    await interaction.editReply(
      [
        "Schedule image updated and pinned in the planned times channel.",
        `Deleted ${cleanupResult.deletedCount} earlier schedule post(s) from this week.`,
        `Unpinned ${cleanupResult.unpinnedCount} older schedule post(s).`
      ].join("\n")
    );
  }
};
