const { SlashCommandBuilder } = require("discord.js");
const { lookupRaids } = require("../services/raidStore");

const colorOrder = [
  "Red",
  "Orange",
  "Amber",
  "Gold",
  "Light Yellow",
  "Lime",
  "Green",
  "Light Green",
  "Cyan",
  "Light Blue",
  "Purple",
  "Pink",
  "Magenta",
  "Brown",
  "Gray"
];

const raidOrder = ["Serca", "Cathedral"];

function getOrderIndex(order, value) {
  const index = order.findIndex((item) => item.toLowerCase() === value.toLowerCase());
  return index === -1 ? order.length : index;
}

function groupLookupResults(results) {
  const grouped = new Map();

  for (const { raid, roleCounts } of results) {
    const key = `${raid.color.toLowerCase()}|${raid.name.toLowerCase()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        color: raid.color,
        name: raid.name,
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

function sortLookupResults(results) {
  return [...results].sort((left, right) => {
    const colorComparison =
      getOrderIndex(colorOrder, left.color) - getOrderIndex(colorOrder, right.color);

    if (colorComparison !== 0) {
      return colorComparison;
    }

    const raidComparison =
      getOrderIndex(raidOrder, left.name) - getOrderIndex(raidOrder, right.name);

    if (raidComparison !== 0) {
      return raidComparison;
    }

    return left.name.localeCompare(right.name);
  });
}

function formatLookupResult(result) {
  const roleText = Object.entries(result.roleCounts)
    .map(([role, count]) => `x${count} ${role}`)
    .join(", ");

  return `${result.color} ${result.name} ${roleText}`;
}

function formatLookupResults(results) {
  const sortedResults = sortLookupResults(groupLookupResults(results));
  const lines = [];
  let previousColor = null;

  for (const result of sortedResults) {
    if (previousColor && previousColor !== result.color) {
      lines.push("");
    }

    lines.push(formatLookupResult(result));
    previousColor = result.color;
  }

  return lines.join("\n");
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

    await interaction.reply(formatLookupResults(results));
  }
};
