const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { toggleIgnoredUser } = require("../services/botSettings");

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("ignore")
    .setDescription("Admin: toggle whether the bot ignores a user.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to ignore or stop ignoring")
        .setRequired(true)
    ),

  async execute(interaction) {
    const user = interaction.options.getUser("user", true);
    const ignored = toggleIgnoredUser(
      interaction.guildId,
      user.id,
      interaction.user.id
    );

    await interaction.reply({
      content: ignored
        ? `I will now ignore ${user}.`
        : `I will no longer ignore ${user}.`,
      ephemeral: true,
      allowedMentions: { users: [] }
    });
  }
};
