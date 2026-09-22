const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { createPlan, getPlanColors } = require("../services/raidPlans");
const { getPlanningWeekDate, shouldChoosePlanWeek, visiblePlanWeeks, planWeekdays } = require("../services/planWeeks");

async function chooseWeek(interaction, now) {
  if (!shouldChoosePlanWeek(now)) return getPlanningWeekDate(now);
  const weeks = visiblePlanWeeks(now);
  const customIds = weeks.map(week => `plan-week:${interaction.id}:${week}`);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(customIds[0]).setLabel(`This reset (${weeks[0]})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(customIds[1]).setLabel(`Upcoming reset (${weeks[1]})`).setStyle(ButtonStyle.Secondary)
  );
  const response = await interaction.editReply({
    content: "Which reset is this plan for?",
    components: [buttons]
  });
  let selection;
  try {
    selection = await response.awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 14 * 60 * 1000,
      filter: button => button.user.id === interaction.user.id && customIds.includes(button.customId)
    });
  } catch (error) {
    if (error.code !== "InteractionCollectorError") throw error;
    await interaction.editReply({ content: "Reset selection expired. Run /plan again.", components: [] });
    return null;
  }
  await selection.update({ content: "Creating your pending plan…", components: [] });
  return weeks[customIds.indexOf(selection.customId)];
}

module.exports = {
  allowAnyChannel: true,
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("plan")
    .setDescription("Propose a time for a color group.")
    .setDMPermission(false)
    .addStringOption((option) => option
      .setName("color")
      .setDescription("Run color for the reset you want to plan")
      .setRequired(true)
      .setAutocomplete(true)
    )
    .addStringOption((option) => option
      .setName("day")
      .setDescription("Day of the week for this run")
      .setRequired(true)
      .addChoices(...planWeekdays.map(day => ({ name: day, value: day })))
    )
    .addStringOption((option) => option
      .setName("description")
      .setDescription("Any time or description, e.g. after Thursday Kazeros")
      .setRequired(true)
      .setMaxLength(1000)
    ),

  async autocomplete(interaction) {
    const colors = getPlanColors(interaction.options.getFocused());
    await interaction.respond(colors.map((color) => ({ name: color, value: color })));
  },

  async execute(interaction, now = new Date()) {
    await interaction.deferReply({ ephemeral: true });
    try {
      const week = await chooseWeek(interaction, now);
      if (!week) return;
      const message = await createPlan(interaction.client, {
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        color: interaction.options.getString("color", true),
        day: interaction.options.getString("day", true),
        description: interaction.options.getString("description", true),
        week
      });
      await interaction.editReply({ content: `Pending plan posted for the week of ${week}: ${message.url}`, components: [] });
    } catch (error) {
      console.error("Could not create plan:", error);
      await interaction.editReply({
        content: error.userMessage || "Could not post the plan. Check the bot's channel permissions and try again.",
        components: [],
        allowedMentions: { parse: [] }
      });
    }
  }
};
