const { EmbedBuilder } = require("discord.js");
const { sortRaidResults } = require("./raidFormatter");

function groupResultsByStatus(results, getLine) {
  return sortRaidResults(results).reduce((groups, result) => {
    const status = result.status || "TODO";

    if (!groups.has(status)) {
      groups.set(status, []);
    }

    groups.get(status).push(getLine(result));
    return groups;
  }, new Map());
}

function buildRaidResultsEmbed({ title, description, results, getLine }) {
  const groupedResults = groupResultsByStatus(results, getLine);
  const embed = new EmbedBuilder()
    .setColor(0xd95f43)
    .setTitle(title);

  if (description) {
    embed.setDescription(description);
  }

  for (const [status, lines] of groupedResults.entries()) {
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
