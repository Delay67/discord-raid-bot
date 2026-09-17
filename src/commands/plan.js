const { SlashCommandBuilder } = require("discord.js");
const { createPlan, getPlanColors } = require("../services/raidPlans");

module.exports = {
  allowAnyChannel: true,
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("plan")
    .setDescription("Propose a time for this week's color group.")
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName("color")
      .setDescription("This week's run color")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) => option
      .setName("description")
      .setDescription("Any time or description, e.g. after Thursday Kazeros")
      .setRequired(true)
      .setMaxLength(1000)
    )
    .addStringOption((option) => option
      .setName("raid")
      .setDescription("Leave empty for both raids of this color")
      .addChoices(
        { name: "Serca", value: "Serca" },
        { name: "Cathedral", value: "Cathedral" }
      )
    ),

  async autocomplete(interaction) {
    const colors = getPlanColors(
      interaction.options.getFocused(),
      interaction.options.getString("raid")
    );
    await interaction.respond(colors.map((color) => ({ name: color, value: color })));
  },

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const message = await createPlan(interaction.client, {
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        color: interaction.options.getString("color", true),
        description: interaction.options.getString("description", true),
        raid: interaction.options.getString("raid")
      });
      await interaction.editReply(`Pending plan posted: ${message.url}`);
    } catch (error) {
      console.error("Could not create plan:", error);
      await interaction.editReply({
        content: error.userMessage || "Could not post the plan. Check the bot's channel permissions and try again.",
        allowedMentions: { parse: [] }
      });
    }
  }
};
