const { SlashCommandBuilder } = require("discord.js");
const { buildRaidResultsEmbed } = require("../services/raidEmbeds");
const { getPlayerSuggestions, lookupRaids } = require("../services/raidStore");

function groupLookupResults(results) {
  const grouped = new Map();

  for (const { raid, roleCounts } of results) {
    const status = raid.status || "TODO";
    const key = `${status.toLowerCase()}|${raid.color.toLowerCase()}|${raid.name.toLowerCase()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        color: raid.color,
        name: raid.name,
        status,
        roleCounts: {}
      });
    }

    const group = grouped.get(key);

    for (const [role, count] of Object.entries(roleCounts)) {
      group.roleCounts[role] = (group.roleCounts[role] || 0) + count;
    }
  }

  return [...grouped.values()];
}

function formatLookupResult(result) {
  const roleText = Object.entries(result.roleCounts)
    .map(([role, count]) => `x${count} ${role}`)
    .join(", ");

  return `${result.color} ${result.name} ${roleText}`;
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
        .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const suggestions = getPlayerSuggestions(focusedValue).map((name) => ({
      name,
      value: name
    }));

    await interaction.respond(suggestions);
  },

  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    const results = lookupRaids(name);

    if (results.length === 0) {
      await interaction.reply(`No raids found for ${name}.`);
      return;
    }

    await interaction.reply({
      embeds: [
        buildRaidResultsEmbed({
          title: `${name} Raids`,
          results: groupLookupResults(results),
          getLine: formatLookupResult
        })
      ]
    });
  }
};
