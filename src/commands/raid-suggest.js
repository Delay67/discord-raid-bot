const {
  AttachmentBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  buildSuggestions,
  formatSuggestionsReport
} = require("../services/raidOptimizer");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-suggest")
    .setDescription("Admin: suggest alternative raid group layouts.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addIntegerOption((option) =>
      option
        .setName("options")
        .setDescription("How many alternatives to generate")
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addIntegerOption((option) =>
      option
        .setName("search")
        .setDescription("Search effort from 1 to 5")
        .setMinValue(1)
        .setMaxValue(5)
    )
    .addIntegerOption((option) =>
      option
        .setName("variety")
        .setDescription("How adventurous the alternatives should be from 1 to 5")
        .setMinValue(1)
        .setMaxValue(5)
    ),

  async execute(interaction) {
    await interaction.deferReply({
      ephemeral: true
    });

    const count = interaction.options.getInteger("options") || 3;
    const search = interaction.options.getInteger("search") || 3;
    const variety = interaction.options.getInteger("variety") || 3;
    const iterations = search * 20000;
    const result = buildSuggestions({
      count,
      iterations,
      variety
    });
    const report = formatSuggestionsReport(result);
    const attachment = new AttachmentBuilder(Buffer.from(report, "utf8"), {
      name: "raid-suggestions.txt"
    });

    const bestSuggestion = result.suggestions[0];
    const summary = bestSuggestion
      ? `Generated ${result.suggestions.length} option(s). Best score: ${bestSuggestion.score} (${bestSuggestion.score - result.baseline.score >= 0 ? "+" : ""}${bestSuggestion.score - result.baseline.score}).`
      : "No better alternatives were found with the current constraints.";

    await interaction.editReply({
      content: [
        summary,
        "Open `raid-suggestions.txt` for the proposed groups, clusters, and validation notes."
      ].join("\n"),
      files: [attachment]
    });
  }
};
