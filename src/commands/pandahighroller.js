const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const { getRedPandaBombStats } = require("../services/redPandaStore");

function formatLeaders(leaders) {
  if (leaders.length === 0) {
    return "No red panda bombs have procced yet.";
  }

  return leaders
    .map((leader, index) => `${index + 1}. <@${leader.userId}> — ${leader.count}`)
    .join("\n");
}

function formatLatest(latest) {
  if (!latest) {
    return "No red panda bombs have procced yet.";
  }

  const timestamp = Math.floor(new Date(latest.procAt).getTime() / 1000);
  return `<@${latest.userId}> — <t:${timestamp}:F> (<t:${timestamp}:R>)`;
}

module.exports = {
  allowAnyChannel: true,
  data: new SlashCommandBuilder()
    .setName("pandahighroller")
    .setDescription("Show the top red panda bomb proccers and latest winner."),

  async execute(interaction) {
    const stats = getRedPandaBombStats(interaction.guildId);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xd95f43)
          .setTitle("Red Panda Bomb High Rollers")
          .setDescription(`Total bombs procced: ${stats.total}`)
          .addFields(
            { name: "Top 3", value: formatLeaders(stats.leaders) },
            { name: "Latest Bomb", value: formatLatest(stats.latest) }
          )
      ]
    });
  }
};
