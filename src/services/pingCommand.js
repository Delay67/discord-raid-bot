const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { editPing } = require("./manualPings");
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
module.exports = function pingCommand(action) {
  const data = new SlashCommandBuilder().setName(action === "set" ? "setping" : "removeping")
    .setDescription(action === "set" ? "Admin: add or replace a weekly raid reminder." : "Admin: remove a weekly raid reminder.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).setDMPermission(false)
    .addStringOption(o => o.setName("week").setDescription("Raid week to change").setRequired(true).addChoices({ name: "Current week", value: "current" }, { name: "Upcoming week", value: "next" }))
    .addStringOption(o => o.setName("day").setDescription("Raid start day (Amsterdam time)").setRequired(true).addChoices(...days.map(day => ({ name: day, value: day }))))
    .addStringOption(o => o.setName("time").setDescription("Raid start time, HH:MM; ping is 30 minutes earlier").setRequired(true).setMaxLength(5))
    .addStringOption(o => o.setName("raid").setDescription("Raid name, matching checkpings").setRequired(true).setMaxLength(100));
  if (action === "set") data.addStringOption(o => o.setName("members").setDescription("Comma-separated player names from the Discord ID mappings").setRequired(true).setMaxLength(1000));
  return {
    data, allowAnyChannel: true, skipCleanup: true,
    async execute(interaction) {
      const reply = content => interaction.reply({ content, ephemeral: true, allowedMentions: { parse: [] } });
      if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return reply("You need Manage Server permission to change reminders.");
      const week = interaction.options.getString("week");
      const reminder = { weekday: interaction.options.getString("day"), startTime: interaction.options.getString("time"), raid: interaction.options.getString("raid").trim() };
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(reminder.startTime) || !reminder.raid || !days.includes(reminder.weekday) || !["current", "next"].includes(week)) return reply("Choose a valid week, day, raid name and time in HH:MM format.");
      if (action === "set") {
        reminder.members = [...new Set(interaction.options.getString("members").split(",").map(name => name.trim()).filter(Boolean))];
        if (!reminder.members.length) return reply("Provide at least one player name.");
      }
      const changed = editPing(action, week, reminder);
      return reply(changed ? "Reminder " + (action === "set" ? "saved" : "removed") + " for the " + (week === "next" ? "upcoming" : "current") + " week only. Use /checkpings to review. Already delivered reminders are not sent again." : "No matching reminder found. Check the day, start time and raid name in /checkpings.");
    }
  };
};
