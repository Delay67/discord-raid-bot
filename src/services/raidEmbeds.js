const { EmbedBuilder } = require("discord.js");
const { sortRaidResults } = require("./raidFormatter");

function groupResultsByStatus(results) {
  return sortRaidResults(results).reduce((groups, result) => {
    const status = result.status || "TODO";

    if (!groups.has(status)) {
      groups.set(status, []);
    }

    groups.get(status).push(result);
    return groups;
  }, new Map());
}

function getRoleSummary(results) {
  const roleCounts = results.reduce(
    (counts, result) => {
      counts.dps += result.roleCounts?.DPS || 0;
      counts.support += result.roleCounts?.Support || 0;
      return counts;
    },
    {
      dps: 0,
      support: 0
    }
  );

  return `Total: ${roleCounts.dps} DPS, ${roleCounts.support} SUP`;
}

function buildRaidResultsEmbed({ title, description, results, getLine }) {
  const groupedResults = groupResultsByStatus(results);
  const embed = new EmbedBuilder()
    .setColor(0xd95f43)
    .setTitle(title);

  if (description) {
    embed.setDescription(description);
  }

  for (const [status, statusResults] of groupedResults.entries()) {
    const lines = [
      ...statusResults.map(getLine),
      "",
      getRoleSummary(statusResults)
    ];

    embed.addFields({
      name: status,
      value: lines.join("\n").slice(0, 1024)
    });
  }

  return embed;
}

module.exports = {
  buildRaidResultsEmbed
};
