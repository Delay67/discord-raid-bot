const { SlashCommandBuilder } = require("discord.js");
const { readSchedule } = require("../services/scheduleStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("schedule")
    .setDescription("Show the current raid schedule image."),

  async execute(interaction) {
    const schedule = readSchedule();

    if (!schedule.url) {
      await interaction.reply("No schedule image has been uploaded yet.");
      return;
    }

    await interaction.reply(schedule.url);
  }
};
