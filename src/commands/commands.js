const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Show public bot commands and how to use them."),

  async execute(interaction) {
    await interaction.reply({
      content: [
        "**Available commands**",
        "",
        "`/lookup name:Ghonty`",
        "Shows every raid that player is included in this week.",
        "",
        "`/combo name:Ghonty with:Vierazy Phil`",
        "Shows raids where the player is grouped with every listed player.",
        "",
        "`/schedule`",
        "Shows the current raid schedule image.",
        "",
        "`/redpanda`",
        "Shows a random red panda image or gif.",
        "",
        "`/commands`",
        "Shows this command list."
      ].join("\n"),
      ephemeral: true
    });
  }
};
