const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { clearRaids } = require("../services/raidStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-clear")
    .setDescription("Admin: clear all stored raids for the week.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    clearRaids();

    await interaction.reply({
      content: "Cleared all stored raids.",
      ephemeral: true
    });
  }
};
