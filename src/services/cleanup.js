const { cleanupDelayMs } = require("../config");

function shouldIgnoreDeleteError(error) {
  return error.code === 10008 || error.code === 10062 || error.code === 50013;
}

function scheduleInteractionCleanup(interaction) {
  const timeout = setTimeout(async () => {
    try {
      await interaction.deleteReply();
    } catch (error) {
      if (!shouldIgnoreDeleteError(error)) {
        console.error(error);
      }
    }
  }, cleanupDelayMs);

  timeout.unref?.();
}

async function deleteMessage(message) {
  try {
    await message.delete();
  } catch (error) {
    if (!shouldIgnoreDeleteError(error)) {
      console.error(error);
    }
  }
}

module.exports = {
  deleteMessage,
  scheduleInteractionCleanup
};
