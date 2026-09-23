const { SlashCommandBuilder } = require("discord.js");
const { getMyTimes } = require("../services/raidPlans");

module.exports = {
  allowAnyChannel: true,
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("mytimes")
    .setDescription("Privately show confirmed times for your runs.")
    .setDMPermission(false),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const pages = getMyTimes({ guildId: interaction.guildId, userId: interaction.user.id });
    await interaction.editReply({ content: pages[0], allowedMentions: { parse: [] } });
    for (const content of pages.slice(1)) {
      await interaction.followUp({ content, ephemeral: true, allowedMentions: { parse: [] } });
    }
  }
};
