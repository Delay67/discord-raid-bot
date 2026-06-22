const { SlashCommandBuilder } = require("discord.js");
const fs = require("node:fs/promises");
const path = require("node:path");
const { redPandaMediaDirectory, reddit } = require("../config");
const { recordRedPanda } = require("../services/activityStats");
const { rememberLastLocalSelection } = require("../services/redPandaStore");

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

const redditUrls = [
  "https://oauth.reddit.com/r/redpandas/top?t=all&limit=100&raw_json=1",
  "https://oauth.reddit.com/r/redpandas/hot?limit=10&raw_json=1",
  "https://oauth.reddit.com/r/redpandas/month?t=all&limit=20&raw_json=1"
];

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getLocalMediaFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return getLocalMediaFiles(fullPath);
      }

      if (!entry.isFile() || !localMediaExtensions.has(path.extname(entry.name).toLowerCase())) {
        return [];
      }

      const stats = await fs.stat(fullPath);

      if (stats.size > maxLocalUploadBytes) {
        return [];
      }

      return [fullPath];
    })
  );

  return files.flat();
}

async function getRandomLocalMediaFile() {
  try {
    const files = await getLocalMediaFiles(localMediaDirectory);

    if (files.length === 0) {
      return null;
    }

    return files[Math.floor(Math.random() * files.length)];
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`Could not read red panda media directory: ${error.message}`);
    }

    return null;
  }
}

function hasRedditConfig() {
  return Boolean(
    reddit.clientId &&
      reddit.clientSecret &&
      reddit.username &&
      reddit.password
  );
}

function isAllowedMediaUrl(url) {
  const cleanedUrl = url.toLowerCase().split("?")[0];
  return [".gif", ".jpg", ".jpeg", ".png", ".webp"].some((extension) =>
    cleanedUrl.endsWith(extension)
  );
}

function getRedditPostMediaUrl(post) {
  const directUrl = post.url_overridden_by_dest || post.url;

  if (directUrl && isAllowedMediaUrl(directUrl)) {
    return directUrl;
  }

  const redditVideoUrl = post.secure_media?.reddit_video?.fallback_url;

  if (redditVideoUrl) {
    return redditVideoUrl;
  }

  const galleryItems = Object.values(post.media_metadata || {})
    .map((item) => item.s?.u || item.s?.gif)
    .filter(Boolean)
    .map((url) => url.replaceAll("&amp;", "&"));

  if (galleryItems.length > 0) {
    return galleryItems[Math.floor(Math.random() * galleryItems.length)];
  }

  const previewUrl = post.preview?.images?.[0]?.source?.url;

  if (previewUrl) {
    return previewUrl.replaceAll("&amp;", "&");
  }

  return null;
}

function extractRedditMediaUrls(payload) {
  return (payload.data?.children || [])
    .map((child) => getRedditPostMediaUrl(child.data))
    .filter(Boolean);
}

async function fetchJson(url) {
  const accessToken = await getAccessToken();

  if (!accessToken) {
    return null;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": "discord-raid-bot/1.0 red panda command"
    }
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok || !contentType.includes("application/json")) {
    const body = await response.text();
    console.warn(
      `Red panda Reddit fetch failed: ${response.status} ${contentType} ${url} ${body.slice(0, 120)}`
    );
    return null;
  }

  return response.json();
}

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) {
    return cachedToken;
  }

  const credentials = Buffer.from(
    `${reddit.clientId}:${reddit.clientSecret}`,
    "utf8"
  ).toString("base64");

  const body = new URLSearchParams({
    grant_type: "password",
    password: reddit.password,
    username: reddit.username
  });

  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    body,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "discord-raid-bot/1.0 red panda command"
    }
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.access_token) {
    console.warn(
      `Reddit token fetch failed: ${response.status} ${JSON.stringify(payload)}`
    );
    return null;
  }

  cachedToken = payload.access_token;
  cachedTokenExpiresAt = Date.now() + Math.max(0, payload.expires_in - 60) * 1000;

  return cachedToken;
}

async function getRedditMediaUrls() {
  const urls = [...redditUrls].sort(() => Math.random() - 0.5);

  for (const url of urls) {
    const payload = await fetchJson(url);

    if (!payload) {
      continue;
    }

    const mediaUrls = extractRedditMediaUrls(payload);
    const postCount = payload.data?.children?.length || 0;

    console.log(`Red panda Reddit fetch: ${url} posts=${postCount} media=${mediaUrls.length}`);

    if (mediaUrls.length > 0) {
      return mediaUrls;
    }
  }

  return [];
}

function logSelectedMedia(interaction, selection) {
  console.log(
    `Red panda selected: ${JSON.stringify({
      ...selection,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
      channelId: interaction.channelId,
      guildId: interaction.guildId
    })}`
  );
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("redpanda")
    .setDescription("Show a random red panda image or gif."),

  async execute(interaction) {
    await interaction.deferReply();

    const localMediaFile = await getRandomLocalMediaFile();

    if (localMediaFile) {
      logSelectedMedia(interaction, {
        source: "local",
        file: localMediaFile
      });
      rememberLastLocalSelection(interaction, localMediaFile);

      await interaction.editReply({
        files: [localMediaFile]
      });
      recordRedPanda(interaction, "local");
      return;
    }

    if (!hasRedditConfig()) {
      await interaction.editReply("No local red panda media found, and Reddit is not configured.");
      return;
    }

    const mediaUrls = await getRedditMediaUrls();

    if (mediaUrls.length === 0) {
      await interaction.editReply("I could not find a Reddit red panda right now.");
      return;
    }

    const mediaUrl = mediaUrls[Math.floor(Math.random() * mediaUrls.length)];
    logSelectedMedia(interaction, {
      source: "reddit",
      url: mediaUrl
    });

    await interaction.editReply(mediaUrl);
    recordRedPanda(interaction, "reddit");
  }
};
