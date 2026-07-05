const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const {
  isMentionLlmEnabled,
  setMentionLlmEnabled
} = require("../services/botSettings");
const { updateLlmPresence } = require("../services/botPresence");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("llm")
    .setDescription("Admin: enable or disable bot mention LLM replies.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName("mode")
        .setDescription("Whether the bot should respond to @ mentions")
        .setRequired(true)
        .addChoices(
          { name: "Enable", value: "enable" },
          { name: "Disable", value: "disable" },
          { name: "Status", value: "status" }
        )
    ),

  async execute(interaction) {
    const mode = interaction.options.getString("mode", true);

    if (mode === "status") {
      await interaction.reply({
        content: `Mention LLM replies are currently ${isMentionLlmEnabled() ? "enabled" : "disabled"}.`,
        ephemeral: true
      });
      return;
    }

    const enabled = mode === "enable";
    setMentionLlmEnabled(enabled, interaction.user.id);
    updateLlmPresence(interaction.client, enabled);

    await interaction.reply({
      content: `Mention LLM replies are now ${enabled ? "enabled" : "disabled"}.`,
      ephemeral: true
    });
  }
};
