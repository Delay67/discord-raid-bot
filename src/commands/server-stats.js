const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getCurrentStats } = require("../services/activityStats");

function formatTopUsers(users, emptyText) {
  if (users.length === 0) {
    return emptyText;
  }

  return users
    .slice(0, 10)
    .map((user, index) => `${index + 1}. ${user.label} - ${user.count}`)
    .join("\n");
}

function getPeriodLabel(period) {
  return {
    all: "All Time",
    month: "This Month",
    week: "This Week",
    year: "This Year"
  }[period];
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("server-stats")
    .setDescription("Show server activity stats and red panda numbers.")
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("Stats period")
        .setRequired(true)
        .addChoices(
          { name: "Week", value: "week" },
          { name: "Month", value: "month" },
          { name: "Year", value: "year" },
          { name: "All Time", value: "all" }
        )
    ),

  async execute(interaction) {
    const period = interaction.options.getString("period", true);
    const stats = getCurrentStats(period, interaction.guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf0a030)
          .setTitle(`Server Stats - ${getPeriodLabel(period)}`)
          .setDescription(`Period key: ${stats.key}`)
          .addFields(
            {
              name: "Totals",
              value: [
                `Messages: ${stats.messages.total}`,
                `Red pandas served: ${stats.redpandas.total}`
              ].join("\n")
            },
            {
              name: "Top Chatters",
              value: formatTopUsers(stats.messages.users, "No messages tracked yet."),
              inline: true
            },
            {
              name: "Top Red Panda Requesters",
              value: formatTopUsers(stats.redpandas.users, "No red pandas served yet."),
              inline: true
            }
          )
      ]
    });
  }
};
