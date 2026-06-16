const { SlashCommandBuilder } = require("discord.js");

const redditUrls = [
  "https://www.reddit.com/r/redpandas/top.json?t=all&limit=100&raw_json=1",
  "https://www.reddit.com/r/redpandas/hot.json?limit=100&raw_json=1",
  "https://www.reddit.com/r/redpandas/new.json?limit=100&raw_json=1"
];

const commonsUrl =
  "https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=red%20panda&gsrnamespace=6&gsrlimit=100&prop=imageinfo&iiprop=url|mime&format=json&origin=*";

const allowedMimeTypes = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

function getCommonsMediaUrls(payload) {
  const pages = Object.values(payload.query?.pages || {});

  return pages
    .map((page) => page.imageinfo?.[0])
    .filter((imageInfo) => imageInfo?.url && allowedMimeTypes.has(imageInfo.mime))
    .map((imageInfo) => imageInfo.url);
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
  const response = await fetch(url, {
    headers: {
      "User-Agent": "discord-raid-bot/1.0 red panda command"
    }
  });

  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  return response.json();
}

async function getRedditMediaUrls() {
  const urls = [...redditUrls].sort(() => Math.random() - 0.5);

  for (const url of urls) {
    const payload = await fetchJson(url);

    if (!payload) {
      continue;
    }

    const mediaUrls = extractRedditMediaUrls(payload);

    if (mediaUrls.length > 0) {
      return mediaUrls;
    }
  }

  return [];
}

async function getFallbackMediaUrls() {
  const payload = await fetchJson(commonsUrl);
  return payload ? getCommonsMediaUrls(payload) : [];
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("redpanda")
    .setDescription("Show a random red panda image or gif."),

  async execute(interaction) {
    await interaction.deferReply();

    const mediaUrls = [
      ...(await getRedditMediaUrls()),
      ...(await getFallbackMediaUrls())
    ];

    if (mediaUrls.length === 0) {
      await interaction.editReply("I could not find a red panda image right now.");
      return;
    }

    const mediaUrl = mediaUrls[Math.floor(Math.random() * mediaUrls.length)];
    await interaction.editReply(mediaUrl);
  }
};
