require("dotenv").config();

const requiredEnvironment = ["DISCORD_TOKEN"];

function validateEnvironment() {
  const missing = requiredEnvironment.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. Add them to your .env file.`
    );
  }
}

module.exports = {
  token: process.env.DISCORD_TOKEN,
  validateEnvironment
};
