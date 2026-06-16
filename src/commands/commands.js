const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("commands")
    .setDescription("Show public bot commands and how to use them."),

  async execute(interaction) {
    await interaction.reply(
      [
        "**Available commands**",
        "",
        "`/lookup name:Ghonty`",
        "Shows every raid that player is included in this week.",
        "",
        "`/schedule`",
        "Shows the current raid schedule image.",
        "",
        "`/commands`",
        "Shows this command list."
      ].join("\n")
    );
  }
};
