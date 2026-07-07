const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getTopPandaStats } = require("../services/activityStats");

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function formatTopUsers(users) {
  if (users.length === 0) {
    return "No red pandas served yet.";
  }

  return users
    .slice(0, 10)
    .map((user, index) => `${index + 1}. ${user.label} - ${user.count}`)
    .join("\n");
}

function getSelection(interaction) {
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "year") {
    const year = interaction.options.getInteger("year", true);
    return { label: String(year), type: "year", year };
  }

  if (subcommand === "month") {
    const month = interaction.options.getInteger("month", true);
    return {
      label: `${months[month - 1]} ${new Date().getFullYear()}`,
      month,
      type: "month"
    };
  }

  return {
    "all-time": { label: "All Time", type: "all" },
    "past-7-days": { label: "Past 7 Days", type: "past7" },
    "past-30-days": { label: "Past 30 Days", type: "past30" }
  }[subcommand];
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("toppanda")
    .setDescription("Show who requested the most red pandas for a period.")
    .addSubcommand((command) => command
      .setName("all-time")
      .setDescription("Show the all-time leaderboard."))
    .addSubcommand((command) => command
      .setName("year")
      .setDescription("Show the leaderboard for a specific year.")
      .addIntegerOption((option) => option
        .setName("year")
        .setDescription("Year, such as 2026")
        .setMinValue(2020)
        .setMaxValue(2100)
        .setRequired(true)))
    .addSubcommand((command) => command
      .setName("month")
      .setDescription("Show a month from the current year.")
      .addIntegerOption((option) => option
        .setName("month")
        .setDescription("Month of the current year")
        .setRequired(true)
        .addChoices(...months.map((name, index) => ({ name, value: index + 1 })))))
    .addSubcommand((command) => command
      .setName("past-7-days")
      .setDescription("Show the leaderboard for the past 7 days."))
    .addSubcommand((command) => command
      .setName("past-30-days")
      .setDescription("Show the leaderboard for the past 30 days.")),

  async execute(interaction) {
    const selection = getSelection(interaction);
    const stats = getTopPandaStats(selection, interaction.guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xd95f43)
          .setTitle(`Top Red Panda Requesters - ${selection.label}`)
          .setDescription(`Red pandas served: ${stats.redpandas.total}`)
          .addFields({
            name: "Leaderboard",
            value: formatTopUsers(stats.redpandas.users)
          })
      ]
    });
  }
};
