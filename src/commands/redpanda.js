const { SlashCommandBuilder } = require("discord.js");

const commonsUrl =
  "https://commons.wikimedia.org/w/api.php?action=query&generator=categorymembers&gcmtitle=Category:Ailurus_fulgens&gcmtype=file&gcmlimit=100&prop=imageinfo&iiprop=url|mime&format=json&origin=*";

const allowedMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getMediaUrls(payload) {
  const pages = Object.values(payload.query?.pages || {});

  return pages
    .map((page) => page.imageinfo?.[0])
    .filter((imageInfo) => imageInfo?.url && allowedMimeTypes.has(imageInfo.mime))
    .map((imageInfo) => imageInfo.url);
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("redpanda")
    .setDescription("Show a random red panda image or gif."),

  async execute(interaction) {
    await interaction.deferReply();

    const response = await fetch(commonsUrl, {
      headers: {
        "User-Agent": "discord-raid-bot/1.0 red panda command"
      }
    });

    if (!response.ok) {
      await interaction.editReply("I could not fetch a red panda right now.");
      return;
    }

    const payload = await response.json();
    const mediaUrls = getMediaUrls(payload);

    if (mediaUrls.length === 0) {
      await interaction.editReply("I could not find a red panda image right now.");
      return;
    }

    const mediaUrl = mediaUrls[Math.floor(Math.random() * mediaUrls.length)];
    await interaction.editReply(mediaUrl);
  }
};
