const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const {
  getPlayerSuggestions,
  normalizePlayerName,
  readRaids
} = require("../services/raidStore");

function getOverlapResults(playerName) {
  const normalizedPlayerName = normalizePlayerName(playerName);
  const overlaps = new Map();
  let matchedRaids = 0;

  for (const raid of readRaids()) {
    const hasPlayer = raid.members.some(
      (member) => member.lookupName === normalizedPlayerName
    );

    if (!hasPlayer) {
      continue;
    }

    matchedRaids += 1;

    for (const member of raid.members) {
      if (member.lookupName === normalizedPlayerName) {
        continue;
      }

      if (!overlaps.has(member.lookupName)) {
        overlaps.set(member.lookupName, {
          count: 0,
          name: member.name,
          todoCount: 0
        });
      }

      const overlap = overlaps.get(member.lookupName);
      overlap.count += 1;

      if ((raid.status || "TODO") !== "DONE") {
        overlap.todoCount += 1;
      }
    }
  }

  return {
    matchedRaids,
    overlaps: [...overlaps.values()].sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return left.name.localeCompare(right.name);
    })
  };
}

function formatOverlap(overlap, index) {
  const todoText = overlap.todoCount > 0 ? `, ${overlap.todoCount} TODO` : "";
  return `${index + 1}. ${overlap.name} - ${overlap.count} raid(s)${todoText}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("overlap")
    .setDescription("Show who a player is grouped with most often.")
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
    const results = getOverlapResults(name);

    if (results.matchedRaids === 0) {
      await interaction.reply(`No raids found for ${name}.`);
      return;
    }

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x8f7df5)
          .setTitle(`${name} Overlap`)
          .setDescription(`Found ${results.matchedRaids} raid(s) for ${name}.`)
          .addFields({
            name: "Most Grouped With",
            value: results.overlaps.length > 0
              ? results.overlaps.slice(0, 15).map(formatOverlap).join("\n")
              : "No overlapping members found."
          })
      ]
    });
  }
};
