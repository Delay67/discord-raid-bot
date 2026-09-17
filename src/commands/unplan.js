const { SlashCommandBuilder } = require("discord.js");
const { getUnplanColors, removePlannedRaids } = require("../services/raidPlans");

module.exports = {
  allowAnyChannel: true,
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("unplan")
    .setDescription("Remove your confirmed plans for a color this week.")
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName("color")
      .setDescription("Color of the confirmed plans you created")
      .setRequired(true)
      .setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const colors = getUnplanColors(interaction.options.getFocused(), {
      guildId: interaction.guildId,
      creatorId: interaction.user.id
    });
    await interaction.respond(colors.map((color) => ({ name: color, value: color })));
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const { removedCount } = await removePlannedRaids(interaction.client, {
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        color: interaction.options.getString("color", true)
      });
      await interaction.editReply(`Removed ${removedCount} of your confirmed plan${removedCount === 1 ? "" : "s"} from Confirmed Times.`);
    } catch (error) {
      console.error("Could not unplan raids:", error);
      await interaction.editReply({
        content: error.userMessage || "Could not remove the plan. Check the bot's channel permissions and try again.",
        allowedMentions: { parse: [] }
      });
    }
  }
};
