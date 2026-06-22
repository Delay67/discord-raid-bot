const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const fs = require("node:fs");
const path = require("node:path");
const { channelId, redPandaMediaDirectory } = require("../config");
const { getRaidStats } = require("../services/raidStore");

const defaultMediaDirectory = path.join(__dirname, "..", "..", "data", "redpandas");
const localMediaDirectory = redPandaMediaDirectory || defaultMediaDirectory;
const maxLocalUploadBytes = 10 * 1024 * 1024;
const localMediaExtensions = new Set([
  ".gif",
  ".jpg",
  ".jpeg",
  ".m4v",
  ".mov",
  ".mp4",
  ".png",
  ".webm",
  ".webp"
]);

function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    `${minutes}m`
  ].filter(Boolean).join(" ");
}

function countLocalMedia(directory) {
  const stats = {
    ready: 0,
    total: 0,
    oversized: 0
  };

  if (!fs.existsSync(directory)) {
    return stats;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      const childStats = countLocalMedia(fullPath);
      stats.ready += childStats.ready;
      stats.total += childStats.total;
      stats.oversized += childStats.oversized;
      continue;
    }

    if (!entry.isFile() || !localMediaExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }

    stats.total += 1;

    if (fs.statSync(fullPath).size > maxLocalUploadBytes) {
      stats.oversized += 1;
    } else {
      stats.ready += 1;
    }
  }

  return stats;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("health")
    .setDescription("Show bot health and local data counts."),

  async execute(interaction) {
    const raidStats = getRaidStats();
    const mediaStats = countLocalMedia(localMediaDirectory);
    const todoCount = raidStats.byStatus.TODO || 0;
    const doneCount = raidStats.byStatus.DONE || 0;

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x43b581)
          .setTitle("Bot Health")
          .addFields(
            {
              name: "Status",
              value: [
                `Uptime: ${formatDuration(Math.floor(process.uptime()))}`,
                `Bot channel: <#${channelId}>`
              ].join("\n")
            },
            {
              name: "Raids",
              value: [
                `Total: ${raidStats.total}`,
                `TODO: ${todoCount}`,
                `DONE: ${doneCount}`,
                `Colors: ${Object.keys(raidStats.byColor).length}`
              ].join("\n"),
              inline: true
            },
            {
              name: "Red Pandas",
              value: [
                `Ready: ${mediaStats.ready}`,
                `Oversized skipped: ${mediaStats.oversized}`,
                `Total local media: ${mediaStats.total}`
              ].join("\n"),
              inline: true
            }
          )
      ],
      ephemeral: true
    });
  }
};
