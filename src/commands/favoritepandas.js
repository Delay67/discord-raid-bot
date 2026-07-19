const { AttachmentBuilder, EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { getFavoritePandaLeaders } = require("../services/redPandaStore");

const globalCooldownMs = 30 * 60 * 1000;
const maxFavoritePandas = 3;
let cooldownExpiresAt = 0;

function formatScore(score) {
  return `${score} point${score === 1 ? "" : "s"}`;
}

function getAttachmentName(media, index) {
  const extension = path.extname(media) || ".jpg";
  return `favorite-panda-${index + 1}${extension}`;
}

function createImageEmbed(leader, index, attachmentName = null) {
  const embed = new EmbedBuilder()
    .setColor(0xd95f43)
    .setTitle(`#${index + 1} - ${formatScore(leader.score)}`);

  if (attachmentName) {
    embed.setImage(`attachment://${attachmentName}`);
  } else {
    embed.setImage(leader.media);
  }

  return embed;
}

function createImagePayload(leaders) {
  const embeds = [];
  const files = [];

  for (const [index, leader] of leaders.entries()) {
    if (/^https?:\/\//i.test(leader.media)) {
      embeds.push(createImageEmbed(leader, index));
      continue;
    }

    if (!fs.existsSync(leader.media)) {
      embeds.push(
        new EmbedBuilder()
          .setColor(0xd95f43)
          .setTitle(`#${index + 1} - ${formatScore(leader.score)}`)
          .setDescription("Local file is no longer available.")
      );
      continue;
    }

    const attachmentName = getAttachmentName(leader.media, index);
    files.push(new AttachmentBuilder(leader.media, { name: attachmentName }));
    embeds.push(createImageEmbed(leader, index, attachmentName));
  }

  return { embeds, files };
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("favoritepandas")
    .setDescription("Show the top red panda images by frogblush reactions."),

  async execute(interaction) {
    const leaders = getFavoritePandaLeaders(interaction.guildId, maxFavoritePandas);

    if (leaders.length === 0) {
      await interaction.reply("No favorite red pandas yet.");
      return;
    }

    const now = Date.now();

    if (cooldownExpiresAt > now) {
      const retryAt = Math.ceil(cooldownExpiresAt / 1000);
      await interaction.reply({
        content: `Favorite pandas can be shown again <t:${retryAt}:R>.`,
        ephemeral: true
      });
      return;
    }

    cooldownExpiresAt = now + globalCooldownMs;
    await interaction.reply(createImagePayload(leaders));
  }
};

module.exports.createImagePayload = createImagePayload;
module.exports.formatScore = formatScore;
