const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { plannedTimesChannelId } = require("../config");
const {
  getAmsterdamWeekKey,
  readSchedule,
  setScheduleImage,
  updatePostedSchedules
} = require("../services/scheduleStore");

function shouldIgnoreMessageError(error) {
  return error.code === 10008 || error.code === 50001 || error.code === 50013;
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
    keptSchedules,
    unpinnedCount
  };
}

async function postPlannedSchedule(interaction, attachment) {
  const channel = await interaction.client.channels.fetch(plannedTimesChannelId);

  if (!channel?.isTextBased()) {
    throw new Error(`Planned times channel ${plannedTimesChannelId} is not a text channel.`);
  }

  const message = await channel.send({
    content: [
      attachment.url
    ].join("\n")
  });

  await message.pin("Current raid schedule");

  return message;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule-set")
    .setDescription("Admin: upload the current raid schedule image.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addAttachmentOption((option) =>
      option
        .setName("image")
        .setDescription("Raid schedule image")
        .setRequired(true)
    ),

  async execute(interaction) {
    const attachment = interaction.options.getAttachment("image", true);

    if (!attachment.contentType?.startsWith("image/")) {
      await interaction.reply({
        content: "Please upload an image file.",
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({
      ephemeral: true
    });

    const currentWeekKey = getAmsterdamWeekKey(new Date());
    const plannedMessage = await postPlannedSchedule(interaction, attachment);
    const cleanupResult = await cleanupPreviousSchedulePosts(
      interaction.client,
      currentWeekKey
    );

    setScheduleImage({
      attachment,
      plannedMessage,
      uploadedBy: interaction.user.id
    });

    await interaction.editReply(
      [
        "Schedule image updated and pinned in the planned times channel.",
        `Deleted ${cleanupResult.deletedCount} earlier schedule post(s) from this week.`,
        `Unpinned ${cleanupResult.unpinnedCount} older schedule post(s).`
      ].join("\n")
    );
  }
};
