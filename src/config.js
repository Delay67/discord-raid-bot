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
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    visionModel: process.env.GROQ_VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"
  },
  llmTimeoutRoleId: process.env.LLM_TIMEOUT_ROLE_ID || "1465784380726186149",
  plannedTimesChannelId: process.env.PLANNED_TIMES_CHANNEL_ID || "1265458054623789277",
  redPandaMediaDirectory: process.env.REDPANDA_MEDIA_DIR,
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    password: process.env.REDDIT_PASSWORD,
    username: process.env.REDDIT_USERNAME
  },
  token: process.env.DISCORD_TOKEN,
  validateEnvironment
};
