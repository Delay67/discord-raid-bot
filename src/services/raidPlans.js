const fs = require("node:fs");
const path = require("node:path");
const { escapeMarkdown, ReactionType, RESTJSONErrorCodes } = require("discord.js");
const { raidPlansChannelId } = require("../config");
const {
  getCurrentRaidWeekDate,
  readPreparedRaidWeek,
  readRaidsForPeriod,
  runRaidWeekRollover
} = require("./raidPeriodStore");
const { parseDiscordIdMap } = require("./kazerosReminderScheduler");
const { addDays, getPlanningWeekDate, shouldChoosePlanWeek, visiblePlanWeeks, planWeekdays } = require("./planWeeks");
const dataDirectory = process.env.RAID_BOT_DATA_DIRECTORY || path.join(__dirname, "../../data");
const storePath = path.join(dataDirectory, "raid-plans.json");
const overrideEmojiId = "1503113067309961400";

// Serialize Discord events, creation and retries so two confirmations cannot
// overwrite the same state file or publish the same plan twice.
let queue = Promise.resolve();

function serialized(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return { summary: { messageIds: [] }, plans: {} };
    throw error;
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(`${storePath}.tmp`, JSON.stringify(state, null, 2));
  fs.renameSync(`${storePath}.tmp`, storePath);
}

function planError(message) {
  return Object.assign(new Error(message), { userMessage: message });
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesEmoji(emoji, value) {
  return value === overrideEmojiId
    ? emoji?.id === overrideEmojiId
    : !emoji?.id && emoji?.name === value;
}

function planningRaids(raid, week, now = new Date()) {
  runRaidWeekRollover(now);
  const prepared = readPreparedRaidWeek();
  const raids = week > getCurrentRaidWeekDate(now) && prepared?.targetDate === week
    ? prepared.raids : readRaidsForPeriod("current");
  return raids.filter(entry =>
    entry.color?.trim() && entry.color.trim().toLowerCase() !== "unknown" &&
    ["serca", "cathedral"].includes(entry.name.toLowerCase()) &&
    (!raid || entry.name.toLowerCase() === raid.toLowerCase())
  );
}

function getPlanColors(query = "", raid, now = new Date()) {
  const weeks = shouldChoosePlanWeek(now) ? visiblePlanWeeks(now) : [getPlanningWeekDate(now)];
  return [...new Set(weeks.flatMap(week => planningRaids(raid, week, now)).map(entry => entry.color))]
    .filter(color => color.toLowerCase().includes(query.trim().toLowerCase())).sort().slice(0, 25);
}

function ownedConfirmedPlans(state, { guildId, creatorId }, week) {
  if (!guildId || !creatorId) return [];
  return Object.values(state.plans).filter(plan =>
    plan.guildId === guildId && plan.creatorId === creatorId &&
    plan.week === week && plan.status === "confirmed"
  );
}

function getUnplanColors(query = "", owner, now = new Date()) {
  const colors = new Map();
  const week = owner.week === "next" ? addDays(getPlanningWeekDate(now), 7) : getPlanningWeekDate(now);
  for (const plan of ownedConfirmedPlans(readState(), owner, week)) {
    const color = plan.color.trim();
    const key = color.toLowerCase();
    if (!colors.has(key) && key.includes(query.trim().toLowerCase())) colors.set(key, color);
  }
  return [...colors.values()].sort((left, right) => left.localeCompare(right)).slice(0, 25);
}

function resolveMembers(raids) {
  const ids = parseDiscordIdMap();
  for (const [name, id] of parseDiscordIdMap(process.env.RAID_PLAN_DISCORD_IDS)) ids.set(name, id);
  const members = new Set();
  const missing = new Set();
  for (const member of raids.flatMap(raid => raid.members)) {
    const id = ids.get(normalize(member.lookupName || member.name.split("-")[0]));
    if (id) members.add(id);
    else missing.add(member.name);
  }
  if (missing.size || !members.size) {
    throw planError(`I couldn't match every run member to Discord: ${[...missing].join(", ") || "empty roster"}. Ask a bot admin to configure these members before planning this run.`);
  }
  return [...members];
}

function planRaidNames(plan) {
  return plan.raidNames || (plan.raid ? [plan.raid] :
    String(plan.label || "").split(" — ").slice(1).join(" — ").split(" & "));
}

// Display-only status: never persist PLANNED into the raid roster.
function withPlanStatuses(raids, { guildId, period = "current" }, now = new Date()) {
  const week = period === "current" ? getCurrentRaidWeekDate(now) :
    period === "next" ? readPreparedRaidWeek()?.targetDate : period;
  const key = (color, name) => `${String(color).trim().toLowerCase()}|${String(name).trim().toLowerCase()}`;
  const confirmed = new Set();
  for (const plan of Object.values(readState().plans)) {
    if (!guildId || plan.guildId !== guildId || plan.week !== week || plan.status !== "confirmed") continue;
    for (const name of planRaidNames(plan)) confirmed.add(key(plan.color, name));
  }
  return raids.map(raid => ({
    ...raid,
    status: raid.status === "DONE" ? "DONE" : confirmed.has(key(raid.color, raid.name)) ? "PLANNED" : "TODO"
  }));
}

function isPlanComplete(plan, raids) {
  const color = String(plan.color || "").trim().toLowerCase();
  // Older saved plans only have their raid names in the display label.
  const names = planRaidNames(plan);
  return names.length > 0 && names.every(name => {
    const matches = raids.filter(raid =>
      raid.color.trim().toLowerCase() === color &&
      raid.name.trim().toLowerCase() === name.trim().toLowerCase()
    );
    return matches.length > 0 && matches.every(raid => raid.status === "DONE");
  });
}

function pendingPlanContent(plan) {
  const day = planWeekdays.includes(plan.day) ? `__**${plan.day}**__ · ` : "";
  return `**Pending Plan — ${escapeMarkdown(plan.label)}**\n${day}Week of ${plan.week}\n${escapeMarkdown(plan.description)}\n${plan.members.map(id => `<@${id}>`).join(" ")}\nProposed by <@${plan.creatorId}>.`;
}

function summaryPages(state, week, raids = readRaidsForPeriod("current"), raidWeek = week) {
  const pages = [];
  for (const sectionWeek of [week, addDays(week, 7)]) {
    const plans = Object.values(state.plans).filter(plan => plan.week === sectionWeek && plan.status === "confirmed");
    if (sectionWeek !== week && !plans.length) continue;
    const header = `**Confirmed Times — week of ${sectionWeek}**\n\n`;
    const days = [...planWeekdays, "Day not set"];
    const entries = plans.map(plan => {
      const details = `**${escapeMarkdown(plan.label)}:** ${escapeMarkdown(plan.description)}`;
      const members = plan.members.map(id => `<@${id}>`).join(" ");
      const text = plan.week === raidWeek && isPlanComplete(plan, raids)
        ? `~~${details}~~\n~~${members}~~\n`
        : `${details}\n${members}\n`;
      return { text: `${text}\n`, day: planWeekdays.includes(plan.day) ? plan.day : "Day not set" };
    }).sort((left, right) => days.indexOf(left.day) - days.indexOf(right.day));
    if (!entries.length) {
      const empty = `${header}No confirmed plans yet.\n\n`;
      if (!pages.length || (pages[pages.length - 1] + empty).length > 2000) pages.push(empty);
      else pages[pages.length - 1] += empty;
      continue;
    }
    let previousDay = null;
    for (const entry of entries) {
      const dayHeading = `**${entry.day}:**\n`;
      const prefix = (previousDay === null ? header : "") + (entry.day !== previousDay ? dayHeading : "");
      if (!pages.length || (pages[pages.length - 1] + prefix + entry.text).length > 2000) {
        pages.push(header + dayHeading + entry.text);
      } else {
        pages[pages.length - 1] += prefix + entry.text;
      }
      previousDay = entry.day;
    }
  }
  return pages;
}

async function publishSummary(channel, state, week, now = new Date()) {
  // Completion must reflect the roster's reset too, even if this timer fires first.
  runRaidWeekRollover(now);
  const record = state.summary;
  const pages = summaryPages(state, week, readRaidsForPeriod("current"), getCurrentRaidWeekDate(now));
  for (let i = 0; i < pages.length; i++) {
    const payload = { content: pages[i], allowedMentions: { parse: [] } };
    let message;
    if (record.messageIds[i]) {
      try {
        message = await channel.messages.fetch({ message: record.messageIds[i], force: true });
      } catch (error) {
        if (error.code !== 10008) throw error;
      }
    }
    if (message && message.content !== payload.content) await message.edit(payload);
    else if (message) continue;
    else {
      message = await channel.send(payload);
      record.messageIds[i] = message.id;
      save(state);
    }
  }
  // Preserve the main message on rollover, removing any overflow pages.
  while (record.messageIds.length > pages.length) {
    await deleteMessage(channel, record.messageIds[record.messageIds.length - 1]);
    record.messageIds.pop();
    save(state);
  }
  record.week = week;
  save(state);
}

async function deleteMessage(channel, id) {
  try {
    await channel.messages.delete(id);
  } catch (error) {
    if (error.code !== 10008) throw error;
  }
}

async function settle(channel, state, plan, now = new Date()) {
  if (plan.status === "confirmed" || plan.status === "unplanned") {
    await publishSummary(channel, state, getPlanningWeekDate(now), now);
  }
  // Cancellation must remove the proposal even if the creator cannot receive DMs.
  await deleteMessage(channel, plan.messageId);
  if (plan.status === "rejected" && !plan.notified) {
    const payload = {
      content: `Your plan for **${escapeMarkdown(plan.label)}** failed: <@${plan.rejectedBy}> reacted ❌.\n${escapeMarkdown(plan.description)}`,
      allowedMentions: { parse: [] }
    };
    try {
      const creator = await channel.client.users.fetch(plan.creatorId);
      await creator.send(payload);
      plan.notified = true;
    } catch (error) {
      const cannotDeliver = [
        RESTJSONErrorCodes.CannotSendMessagesToThisUser,
        RESTJSONErrorCodes.CannotSendMessagesToThisUserDueToHavingNoMutualGuilds,
        RESTJSONErrorCodes.UnknownUser
      ].includes(error.code);
      if (!cannotDeliver) throw error; // The scheduler retries temporary failures.
      plan.notificationFailed = error.code;
      console.warn(`Could not DM rejection for plan ${plan.messageId}: ${error.message}`);
    }
    save(state);
  }
  plan.settled = true;
  save(state);
}

async function inspectPlan(channel, state, plan, now = new Date(), overrideBy = null) {
  if (plan.status !== "pending") {
    if (!plan.settled) await settle(channel, state, plan, now);
    return;
  }
  if (plan.week < getPlanningWeekDate(now)) {
    plan.status = "expired";
    save(state);
    await settle(channel, state, plan, now);
    return;
  }
  let message;
  try {
    message = await channel.messages.fetch({ message: plan.messageId, force: true });
  } catch (error) {
    if (error.code !== 10008) throw error;
    plan.status = "cancelled";
    plan.settled = true;
    save(state);
    return;
  }
  const content = pendingPlanContent(plan);
  if (message.content !== content) {
    await message.edit({ content, allowedMentions: { parse: [] } });
  }
  // Fetch all reaction users, including votes made while the bot was offline.
  const voters = async emoji => {
    const reaction = message.reactions.cache.find(entry => matchesEmoji(entry.emoji, emoji));
    const ids = new Set();
    if (!reaction) return ids;
    const types = [ReactionType.Normal];
    if (reaction.countDetails?.burst) types.push(ReactionType.Burst);
    for (const type of types) {
      let after;
      while (true) {
        const users = await reaction.users.fetch({ type, limit: 100, ...(after ? { after } : {}) });
        for (const user of users.values()) if (!user.bot) ids.add(user.id);
        if (users.size < 100) break;
        after = users.last().id;
      }
    }
    return ids;
  };
  const rejected = await voters("❌");
  const rejectingMember = plan.members.find(id => rejected.has(id));
  if (rejectingMember) {
    plan.status = "rejected";
    plan.rejectedBy = rejectingMember;
  } else {
    const overridden = overrideBy === plan.creatorId || (await voters(overrideEmojiId)).has(plan.creatorId);
    if (overridden) {
      plan.overriddenBy = plan.creatorId;
    } else {
      const accepted = await voters("✅");
      if (!plan.members.every(id => accepted.has(id))) return;
    }
    plan.status = "confirmed";
  }
  save(state);
  await settle(channel, state, plan, now);
}

function createPlan(client, input, now) {
  return serialized(async () => {
    now ||= new Date();
    if (!planWeekdays.includes(input.day)) throw planError("Please choose a day of the week for the plan.");
    if (!input.description.trim()) throw planError("Please enter a time or description for the plan.");
    const week = input.week || getPlanningWeekDate(now);
    if (!visiblePlanWeeks(now).includes(week)) {
      throw planError("That reset has already ended or is no longer available. Run /plan again to choose a reset.");
    }
    const raids = planningRaids(input.raid, week, now).filter(raid => raid.color.toLowerCase() === input.color.trim().toLowerCase());
    if (!raids.length) throw planError(`No Serca or Cathedral runs match that color for the week of ${week}.`);
    const members = resolveMembers(raids);
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || channel.guildId !== input.guildId) throw new Error("Invalid plans channel or guild");
    const state = readState();
    const label = `${raids[0].color} — ${[...new Set(raids.map(raid => raid.name))].join(" & ")}`;
    const content = pendingPlanContent({ ...input, label, week, members });
    if (content.length > 2000) throw planError("This plan is too long for Discord. Please shorten the description.");
    await publishSummary(channel, state, getPlanningWeekDate(now), now);
    const message = await channel.send({ content, allowedMentions: { parse: [], users: members } });
    state.plans[message.id] = {
      ...input, label, members, week, messageId: message.id, status: "pending",
      raidNames: [...new Set(raids.map(raid => raid.name))]
    };
    save(state);
    try {
      await message.react("✅");
      await message.react("❌");
      await message.react(overrideEmojiId);
    } catch (error) {
      state.plans[message.id].status = "cancelled";
      save(state);
      await settle(channel, state, state.plans[message.id], now);
      throw error;
    }
    return message;
  });
}

function removePlannedRaids(client, input, now) {
  return serialized(async () => {
    now ||= new Date();
    const state = readState();
    const week = input.week === "next" ? addDays(getPlanningWeekDate(now), 7) : getPlanningWeekDate(now);
    const color = input.color.trim().toLowerCase();
    const plans = ownedConfirmedPlans(state, input, week)
      .filter(plan => plan.color.trim().toLowerCase() === color);
    if (!plans.length) {
      throw planError("You have no confirmed plans for that color in the selected reset. Only the original creator can remove a plan.");
    }
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || channel.guildId !== input.guildId) {
      throw new Error("Invalid plans channel or guild");
    }
    // Persist removal before editing Discord so retries cannot restore the plan.
    for (const plan of plans) {
      plan.status = "unplanned";
      plan.unplannedBy = input.creatorId;
      plan.unplannedAt = now.toISOString();
      plan.settled = false;
    }
    save(state);
    try {
      for (const plan of plans) await settle(channel, state, plan, now);
    } catch (error) {
      error.userMessage = "Your plan removal was saved, but I couldn't update the planning messages yet. I'll retry automatically.";
      throw error;
    }
    return { removedCount: plans.length };
  });
}

function handlePlanReaction(reaction, user, now) {
  const isOverride = matchesEmoji(reaction?.emoji, overrideEmojiId);
  const isApproval = matchesEmoji(reaction?.emoji, "✅");
  const isRejection = matchesEmoji(reaction?.emoji, "❌");
  if (!user || user.bot || reaction?.message?.channelId !== raidPlansChannelId || !(isOverride || isApproval || isRejection)) return Promise.resolve();
  return serialized(async () => {
    now ||= new Date();
    const state = readState();
    const plan = state.plans[reaction.message.id];
    if (!plan || plan.settled) return;
    // The creator's byline does not make them a voter unless they were also
    // part of the original roster. Only the override uses creator permission.
    if (isOverride ? user.id !== plan.creatorId : !plan.members.includes(user.id)) return;
    if (plan.status === "pending" && visiblePlanWeeks(now).includes(plan.week) && isRejection) {
      plan.status = "rejected";
      plan.rejectedBy = user.id;
      save(state);
    }
    await inspectPlan(reaction.message.channel, state, plan, now, isOverride ? user.id : null);
  });
}

function refreshConfirmedTimes(client, guildId, now) {
  return serialized(async () => {
    now ||= new Date();
    const state = readState();
    const week = getPlanningWeekDate(now);
    if (!Object.values(state.plans).some(plan =>
      plan.guildId === guildId && visiblePlanWeeks(now).includes(plan.week) && plan.status === "confirmed"
    )) return;
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || channel.guildId !== guildId) {
      throw new Error("Invalid plans channel or guild");
    }
    await publishSummary(channel, state, week, now);
  });
}

function checkPlans(client, now) {
  return serialized(async () => {
    now ||= new Date();
    const state = readState();
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || !channel.guildId) throw new Error("The configured raid plans channel must be a server text channel.");
    const week = getPlanningWeekDate(now);
    await publishSummary(channel, state, week, now);
    for (const plan of Object.values(state.plans)) {
      if (plan.settled) continue;
      try {
        await inspectPlan(channel, state, plan, now);
      } catch (error) {
        console.error(`Could not reconcile plan ${plan.messageId}:`, error);
      }
    }
  });
}

function startPlanScheduler(client) {
  let running = false;
  const check = async () => {
    if (running) return;
    running = true;
    try {
      await checkPlans(client);
    } catch (error) {
      console.error("Plan scheduler:", error);
    } finally {
      running = false;
    }
  };
  check();
  const interval = setInterval(check, 30 * 1000);
  interval.unref?.();
}

module.exports = {
  withPlanStatuses,
  createPlan,
  getPlanColors,
  getUnplanColors,
  removePlannedRaids,
  refreshConfirmedTimes,
  resolveMembers,
  summaryPages,
  handlePlanReaction,
  checkPlans,
  startPlanScheduler
};
