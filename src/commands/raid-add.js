const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { addRaid } = require("../services/raidStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-add")
    .setDescription("Admin: add a fixed raid group for this week.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Group color, such as Red, Orange, Green, or Purple")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("raid")
        .setDescription("Raid name, such as Serca or Cathedral")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("difficulty")
        .setDescription("Raid difficulty, such as Nightmare, Hard, 2, or 3")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("dps")
        .setDescription("Comma-separated DPS members")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("supports")
        .setDescription("Comma-separated support members")
        .setRequired(false)
    ),

  async execute(interaction) {
    const raid = addRaid({
      color: interaction.options.getString("color", true),
      name: interaction.options.getString("raid", true),
      difficulty: interaction.options.getString("difficulty", true),
      dps: interaction.options.getString("dps", true),
      supports: interaction.options.getString("supports") || "",
      createdBy: interaction.user.id
    });

    const dpsCount = raid.members.filter((member) => member.role === "DPS").length;
    const supportCount = raid.members.filter(
      (member) => member.role === "Support"
    ).length;

    await interaction.reply({
      content: `Added ${raid.color} ${raid.name} ${raid.difficulty} with ${dpsCount} DPS and ${supportCount} Support.`,
      ephemeral: true
    });
  }
};
