const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { plannedTimesChannelId } = require("../config");
const {
  getCurrentRaidWeekDate,
  getNextRaidWeekDate,
  readCurrentKazerosReminders,
  readPreparedRaidWeek,
  timeZone
} = require("../services/raidPeriodStore");
const { parseDiscordIdMap } = require("../services/kazerosReminderScheduler");

function formatReminders(reminders) {
  if (!reminders.length) return ["No Kazeros reminders saved."];
  return reminders.map((reminder) => {
    const [hour, minute] = reminder.startTime.split(":").map(Number);
    const total = (hour * 60 + minute - 30 + 1440) % 1440;
    const pingTime = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    return `• ${reminder.weekday} ${pingTime} — ${reminder.raid} starts at ${reminder.startTime}\n  Members: ${reminder.members.join(", ")}`;
  });
}

function getPingReport(now = new Date()) {
  const currentWeek = getCurrentRaidWeekDate(now);
  const nextWeek = getNextRaidWeekDate(now);
  const current = readCurrentKazerosReminders();
  const prepared = readPreparedRaidWeek();
  const upcoming = prepared?.targetDate === nextWeek && Array.isArray(prepared.raids)
    ? prepared.kazerosReminders || []
    : [];
  const lines = [
    "**Kazeros reminder check**",
    `Times: ${timeZone}. Delivery channel: <#${plannedTimesChannelId}>.`,
    "Saved schedules are shown below, including earlier days; this does not confirm delivery.",
    "",
    `**Current week — ${currentWeek} (${current.length} reminders)**`,
    ...formatReminders(current),
    "",
    `**Upcoming week — ${nextWeek} (${upcoming.length} reminders)**`
  ];
  if (!prepared) {
    lines.push("No prepared import saved. No reminders are prepared for next week.");
  } else if (prepared.targetDate !== nextWeek || !Array.isArray(prepared.raids)) {
    lines.push(`Warning: the saved preparation is not valid for the upcoming week (target: ${prepared.targetDate || "missing"}).`);
  } else {
    lines.push("Prepared import saved; activates Wednesday at 10:00 Amsterdam time.", ...formatReminders(upcoming));
  }

  const ids = parseDiscordIdMap();
  const missing = [...new Set([...current, ...upcoming].flatMap((reminder) => reminder.members))]
    .filter((name) => !ids.has(String(name).toLowerCase().replace(/[^a-z0-9]/g, "")));
  if (missing.length) {
    lines.push("", `Warning: no Discord ping mapping for: ${missing.join(", ")}. These members will appear as names without a ping.`);
  }

  // Keep each private message under Discord's 2,000-character limit.
  const pages = [];
  let page = "";
  for (const line of lines) {
    let remaining = line;
    do {
      const chunk = remaining.slice(0, 1900);
      remaining = remaining.slice(1900);
      if (page.length + chunk.length + 1 > 1900) {
        pages.push(page);
        page = "";
      }
      page += `${page ? "\n" : ""}${chunk}`;
    } while (remaining);
  }
  if (page) pages.push(page);
  return pages;
}

module.exports = {
  allowAnyChannel: true,
  skipCleanup: true,
  data: new SlashCommandBuilder()
    .setName("checkpings")
    .setDescription("Admin: check saved Kazeros reminders for this week and next week.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),
  async execute(interaction) {
    if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: "You need Manage Server permission to check reminders.", ephemeral: true });
      return;
    }
    await interaction.deferReply({ ephemeral: true });
    const pages = getPingReport();
    await interaction.editReply({ content: pages[0], allowedMentions: { parse: [] } });
    for (const content of pages.slice(1)) {
      await interaction.followUp({ content, ephemeral: true, allowedMentions: { parse: [] } });
    }
  },
  getPingReport
};
