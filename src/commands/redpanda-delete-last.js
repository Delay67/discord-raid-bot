const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { deleteLastLocalSelection } = require("../services/redPandaStore");

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("redpanda-delete-last")
    .setDescription("Admin: delete the last local red panda file the bot posted.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const result = deleteLastLocalSelection();

    if (!result.ok) {
      await interaction.reply({
        content: result.reason,
        ephemeral: true
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

    await interaction.reply({
      content: `Deleted last red panda file:\n\`${result.file}\``,
      ephemeral: true
    });
  }
};
