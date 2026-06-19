const { SlashCommandBuilder } = require("discord.js");
const { formatStatusGroupedRaidResults } = require("../services/raidFormatter");
const { findComboRaids, normalizePlayerName } = require("../services/raidStore");

function parseNames(value) {
  return value
    .split(/[,\s]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function groupComboResults(raids, playerName) {
  const normalizedPlayerName = normalizePlayerName(playerName);
  const grouped = new Map();

  for (const raid of raids) {
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
    const matchingMembers = raid.members.filter(
      (member) => member.lookupName === normalizedPlayerName
    );

    for (const member of matchingMembers) {
      group.roleCounts[member.role] = (group.roleCounts[member.role] || 0) + 1;
    }
  }

  return [...grouped.values()];
}

function formatComboResult(result) {
  const roleText = Object.entries(result.roleCounts)
    .map(([role, count]) => `x${count} ${role}`)
    .join(", ");

  return `${result.color} ${result.name} ${roleText}`;
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

    await interaction.reply(
      formatStatusGroupedRaidResults(groupComboResults(results, name), formatComboResult)
    );
  }
};
