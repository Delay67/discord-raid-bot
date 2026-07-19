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
        "`/overlap name:Ghonty`",
        "Shows who that player is grouped with most often.",
        "",
        "`/schedule`",
        "Shows the current raid schedule image.",
        "",
        "`/redpanda`",
        "Shows a random red panda image or gif.",
        "",
        "`/health`",
        "Shows bot uptime, raid counts, and red panda media counts.",
        "",
        "`/server-stats period:Week`",
        "Shows overall message and red panda stats.",
        "",
        "`/topchatter period:Week`",
        "Shows the top chatters for the selected period.",
        "",
        "`/toppanda past-7-days`",
        "Shows who requested the most red pandas.",
        "",
        "`/favoritepandas`",
        "Shows the most frogblushed red panda images.",
        "",
        "`/pandahighroller`",
        "Shows the top red panda bomb proccers and latest winner.",
        "",
        "`/commands`",
        "Shows this command list."
      ].join("\n"),
      ephemeral: true
    });
  }
};
