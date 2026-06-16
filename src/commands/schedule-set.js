const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { setScheduleImage } = require("../services/scheduleStore");

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

    setScheduleImage({
      attachment,
      uploadedBy: interaction.user.id
    });

    await interaction.reply({
      content: "Schedule image updated.",
      ephemeral: true
    });
  }
};
