require("dotenv").config();

const requiredEnvironment = ["DISCORD_TOKEN", "DISCORD_CHANNEL_ID"];
const defaultCleanupDelayMs = 5 * 60 * 1000;

function getCleanupDelayMs() {
  const configuredDelay = Number(process.env.CLEANUP_DELAY_MS);

  if (!Number.isFinite(configuredDelay) || configuredDelay <= 0) {
    return defaultCleanupDelayMs;
  }

  return configuredDelay;
}

function validateEnvironment() {
  const missing = requiredEnvironment.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Add them to your .env file.`
    );
  }
}

module.exports = {
  cleanupDelayMs: getCleanupDelayMs(),
  channelId: process.env.DISCORD_CHANNEL_ID,
  token: process.env.DISCORD_TOKEN,
  validateEnvironment
};
