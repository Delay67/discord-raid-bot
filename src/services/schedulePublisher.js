const { MessageType } = require("discord.js");
const { plannedTimesChannelId } = require("../config");
const {
  getAmsterdamWeekKey,
  readSchedule,
  setScheduleImage,
  updatePostedSchedules
} = require("./scheduleStore");

function shouldIgnoreMessageError(error) {
  return error.code === 10008 || error.code === 50001 || error.code === 50013;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function deleteRecentPinNotice(channel, pinnedMessage) {
  try {
    await wait(750);

    const recentMessages = await channel.messages.fetch({ limit: 10 });
    const pinNotice = recentMessages.find(
      (message) =>
        message.type === MessageType.ChannelPinnedMessage &&
        message.createdTimestamp >= pinnedMessage.createdTimestamp - 1000
    );

    if (pinNotice) {
      await pinNotice.delete();
    }
  } catch (error) {
    if (!shouldIgnoreMessageError(error)) {
      throw error;
    }
  }
}

async function cleanupPreviousSchedulePosts(client, currentWeekKey) {
  const schedule = readSchedule();
  const postedSchedules = schedule.postedSchedules || [];
  const keptSchedules = [];
  let deletedCount = 0;
  let unpinnedCount = 0;

  for (const postedSchedule of postedSchedules) {
    try {
      const channel = await client.channels.fetch(postedSchedule.channelId);
      const message = await channel.messages.fetch(postedSchedule.messageId);

      if (postedSchedule.weekKey === currentWeekKey) {
        await message.delete();
        deletedCount += 1;
        continue;
      }

      if (message.pinned) {
        await message.unpin();
        unpinnedCount += 1;
      }

      keptSchedules.push(postedSchedule);
    } catch (error) {
      if (!shouldIgnoreMessageError(error)) {
        throw error;
      }
    }
  }

  updatePostedSchedules(keptSchedules);

  return {
    deletedCount,
    unpinnedCount
  };
}

async function publishSchedule(client, attachment, uploadedBy) {
  const channel = await client.channels.fetch(plannedTimesChannelId);

  if (!channel?.isTextBased()) {
    throw new Error(`Planned times channel ${plannedTimesChannelId} is not a text channel.`);
  }

  const fileSource = attachment.attachment || attachment.url;
  const plannedMessage = await channel.send({
    files: [
      {
        attachment: fileSource,
        name: attachment.name || "schedule.png"
      }
    ]
  });

  await plannedMessage.pin("Current raid schedule");
  await deleteRecentPinNotice(channel, plannedMessage);

  const cleanupResult = await cleanupPreviousSchedulePosts(
    client,
    getAmsterdamWeekKey(new Date())
  );

  setScheduleImage({
    attachment,
    plannedMessage,
    uploadedBy
  });

  return cleanupResult;
}

module.exports = {
  publishSchedule
};
