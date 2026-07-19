const { SlashCommandBuilder } = require("discord.js");
const { getColorSuggestions, uncompleteRaids } = require("../services/raidStore");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("uncomplete")
    .setDescription("Mark completed raids as TODO by color.")
    .addStringOption((option) =>
      option
        .setName("color")
        .setDescription("Color group to mark TODO, such as Orange or Red")
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName("raid")
        .setDescription("Optional raid name to limit the change")
        .setRequired(false)
        .addChoices(
          { name: "Serca", value: "Serca" },
          { name: "Cathedral", value: "Cathedral" }
        )
    ),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused();
    const suggestions = getColorSuggestions(focusedValue).map((color) => ({
      name: color,
      value: color
    }));

    await interaction.respond(suggestions);
  },

  async execute(interaction) {
    const color = interaction.options.getString("color", true);
    const raidName = interaction.options.getString("raid");
    const result = uncompleteRaids({
      color,
      raidName,
      uncompletedBy: interaction.user.id
    });

    const target = raidName ? `${color} ${raidName}` : `${color} raids`;

    if (result.matchedCount === 0) {
      await interaction.reply({
        content: `No raids matched ${target}.`,
        ephemeral: true
      });
      return;
    }

    if (result.uncompletedCount === 0) {
      await interaction.reply({
        content: `All ${result.matchedCount} matching ${target} were already TODO.`,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content: `Marked ${result.uncompletedCount} of ${result.matchedCount} matching ${target} TODO.`,
      ephemeral: true
    });
  }
};
