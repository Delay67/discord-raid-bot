const { SlashCommandBuilder } = require("discord.js");
const { formatGroupedRaidResults } = require("../services/raidFormatter");
const { findComboRaids } = require("../services/raidStore");

function parseNames(value) {
  return value
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function formatComboResult(raid) {
  return `${raid.color} ${raid.name}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("combo")
    .setDescription("Find raids where a player is grouped with every listed player.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Main player name, such as Ghonty")
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName("with")
        .setDescription("Other player names separated by spaces or commas, such as Vierazy Phil")
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    const withNames = parseNames(interaction.options.getString("with", true));
    const allNames = [name, ...withNames];
    const results = findComboRaids(allNames);

    if (results.length === 0) {
      await interaction.reply(`No raids found with ${allNames.join(", ")}.`);
      return;
    }

    await interaction.reply(formatGroupedRaidResults(results, formatComboResult));
  }
};
