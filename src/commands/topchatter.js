const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getCurrentStats } = require("../services/activityStats");

function addPeriodOption(command) {
  return command.addStringOption((option) =>
    option
      .setName("period")
      .setDescription("Stats period")
      .setRequired(true)
      .addChoices(
        { name: "Week", value: "week" },
        { name: "Month", value: "month" },
        { name: "Year", value: "year" }
      )
  );
}

function getPeriodLabel(period) {
  return {
    month: "This Month",
    week: "This Week",
    year: "This Year"
  }[period];
}

function formatTopUsers(users) {
  if (users.length === 0) {
    return "No messages tracked yet.";
  }

  return users
    .slice(0, 10)
    .map((user, index) => `${index + 1}. ${user.label} - ${user.count}`)
    .join("\n");
}

module.exports = {
  data: addPeriodOption(
    new SlashCommandBuilder()
      .setName("topchatter")
      .setDescription("Show the top chatters for a period.")
  ),

  async execute(interaction) {
    const period = interaction.options.getString("period", true);
    const stats = getCurrentStats(period);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x4f8cff)
          .setTitle(`Top Chatters - ${getPeriodLabel(period)}`)
          .setDescription(`Total messages tracked: ${stats.messages.total}`)
          .addFields({
            name: "Leaderboard",
            value: formatTopUsers(stats.messages.users)
          })
      ]
    });
  }
};
