const {
  PermissionFlagsBits,
  SlashCommandBuilder
} = require("discord.js");
const { readRaidsForPeriod } = require("../services/raidPeriodStore");
const { createPeriodSelector } = require("../services/raidPeriodSelect");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("raid-list")
    .setDescription("Admin: list all stored raids for this week.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    const render = (raids, period) => {
      const suffix = period === "current"
        ? "Current Week"
        : period === "next" ? "Next Week" : period;

      if (raids.length === 0) {
        return { content: `No raids stored for ${suffix}.` };
      }

      const lines = raids.map((raid, index) => {
        const dpsCount = raid.members.filter((member) => member.role === "DPS").length;
        const supportCount = raid.members.filter(
          (member) => member.role === "Support"
        ).length;
        return `${index + 1}. ${raid.color} ${raid.name} ${raid.difficulty} - ${dpsCount} DPS, ${supportCount} Support`;
      });
      return { content: `**${suffix}**\n${lines.join("\n")}` };
    };

    const payload = render(readRaidsForPeriod("current"), "current");
    payload.components = [createPeriodSelector(render)];
    payload.ephemeral = true;
    await interaction.reply(payload);
  }
};
