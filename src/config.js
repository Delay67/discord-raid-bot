require("dotenv").config();

const requiredEnvironment = ["DISCORD_TOKEN", "DISCORD_CHANNEL_ID"];

function validateEnvironment() {
  const missing = requiredEnvironment.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Add them to your .env file.`
    );
  }
}

module.exports = {
  cleanupDelayMs: 10 * 60 * 1000,
  channelId: process.env.DISCORD_CHANNEL_ID,
  token: process.env.DISCORD_TOKEN,
  validateEnvironment
};
