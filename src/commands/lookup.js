const { SlashCommandBuilder } = require("discord.js");
const { lookupRaids } = require("../services/raidStore");

function formatLookupResult(result) {
  const { raid, roleCounts } = result;
  const roleText = Object.entries(roleCounts)
    .map(([role, count]) => `x${count} ${role}`)
    .join(", ");

  return `${raid.color} ${raid.name} ${raid.difficulty} ${roleText}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("lookup")
    .setDescription("Find which raids a player is included in this week.")
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Player name, such as Ghonty")
        .setRequired(true)
    ),

  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    const results = lookupRaids(name);

    if (results.length === 0) {
      await interaction.reply(`No raids found for ${name}.`);
      return;
    }

    await interaction.reply(results.map(formatLookupResult).join("\n"));
  }
};
