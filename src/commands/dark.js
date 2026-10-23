const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const caller = require("../services/darkCaller");
const pending = new Set();

const data = new SlashCommandBuilder().setName("dark").setDescription("Configure and control voice dark calls.")
  .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) => sub.setName("players").setDescription("Save the ordered rotation; each player gets three turns.")
    .addStringOption((option) => option.setName("names").setDescription("Comma-separated names in throw order; spoken as written").setMaxLength(1000).setRequired(true)));
for (const [name, description] of Object.entries({ join: "Join your voice channel and create a PC control token", leave: "Disconnect the caller", next: "Call the next player (also consumes a skipped turn)", reset: "Reset the rotation", status: "Show the saved rotation and remaining turns" })) {
  data.addSubcommand((sub) => sub.setName(name).setDescription(description));
}

module.exports = {
  data, allowAnyChannel: true,
  async execute(interaction) {
    if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "Manage Server permission is required.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    if (pending.has(interaction.guildId)) {
      await interaction.editReply("A caller command is still running. Try again shortly.");
      return;
    }
    pending.add(interaction.guildId);
    try {
      const sub = interaction.options.getSubcommand();
      const session = caller.sessions.get(interaction.guildId);
      if (session && session.owner !== interaction.user.id && sub !== "status") throw new Error("The person who started this caller controls it until it leaves.");
      let content;
      if (sub === "players") content = `Saved rotation: ${(await caller.setPlayers(interaction.guildId, interaction.options.getString("names", true))).join(" → ")}. Three turns each.`;
      else if (sub === "join") {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        const token = await caller.join(member);
        content = `Joined your voice channel. Paste this temporary control token into the PC helper (keep it private):\n\`${token}\`\nIt expires when the bot leaves or restarts.`;
      } else if (sub === "leave") { caller.leave(interaction.guildId); content = "Caller disconnected."; }
      else if (sub === "status") {
        const players = caller.readPlayers(interaction.guildId);
        content = `Rotation: ${players.join(" → ") || "Not configured"}\n${session ? `Connected; ${players.length * 3 - session.used} darks remaining.` : "Disconnected."}`;
      } else content = await caller.action(interaction.guildId, sub);
      await interaction.editReply({ content, allowedMentions: { parse: [] } });
    } catch (error) {
      console.error("Dark caller:", error);
      await interaction.editReply("Caller could not complete that action: " + error.message.slice(0, 1200));
    } finally {
      pending.delete(interaction.guildId);
    }
  }
};
