const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { readRaids } = require("../services/raidStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-list")
    .setDescription("Admin: list all stored raids for this week.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const raids = readRaids();

    if (raids.length === 0) {
      await interaction.reply({
        content: "No raids have been added yet.",
        ephemeral: true
      });
      return;
    }

    const lines = raids.map((raid, index) => {
      const dpsCount = raid.members.filter((member) => member.role === "DPS").length;
      const supportCount = raid.members.filter(
        (member) => member.role === "Support"
      ).length;

      return `${index + 1}. ${raid.color} ${raid.name} ${raid.difficulty} - ${dpsCount} DPS, ${supportCount} Support`;
    });

    await interaction.reply({
      content: lines.join("\n"),
      ephemeral: true
    });
  }
};
