const { SlashCommandBuilder } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { getFavoritePandaLeaders } = require("../services/redPandaStore");

function getMediaLabel(media) {
  if (/^https?:\/\//i.test(media)) {
    return media;
  }

  return path.basename(media);
}

function formatScore(score) {
  return `${score} frogblush${score === 1 ? "" : "es"}`;
}

async function sendLeader(interaction, leader, index) {
  const content = `#${index + 1} - ${formatScore(leader.score)} - ${getMediaLabel(leader.media)}`;

  if (/^https?:\/\//i.test(leader.media)) {
    await interaction.followUp(`${content}\n${leader.media}`);
    return;
  }

  if (fs.existsSync(leader.media)) {
    await interaction.followUp({
      content,
      files: [leader.media]
    });
    return;
  }

  await interaction.followUp(`${content}\nLocal file is no longer available.`);
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("favoritepandas")
    .setDescription("Show the top red panda images by frogblush reactions."),

  async execute(interaction) {
    const leaders = getFavoritePandaLeaders(interaction.guildId, 5);

    if (leaders.length === 0) {
      await interaction.reply("No favorite red pandas yet.");
      return;
    }

    await interaction.deferReply();
    await interaction.editReply({
      content: [
        "**Favorite Red Pandas**",
        ...leaders.map(
          (leader, index) =>
            `${index + 1}. ${getMediaLabel(leader.media)} - ${formatScore(leader.score)}`
        )
      ].join("\n")
    });

    for (const [index, leader] of leaders.entries()) {
      await sendLeader(interaction, leader, index);
    }
  }
};
