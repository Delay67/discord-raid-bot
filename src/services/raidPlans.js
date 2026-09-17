const fs = require("node:fs");
const path = require("node:path");
const { escapeMarkdown, ReactionType } = require("discord.js");
const { raidPlansChannelId } = require("../config");
const {
  getCurrentRaidWeekDate,
  readRaidsForPeriod,
  runRaidWeekRollover
} = require("./raidPeriodStore");
const { parseDiscordIdMap } = require("./kazerosReminderScheduler");
const dataDirectory = process.env.RAID_BOT_DATA_DIRECTORY || path.join(__dirname, "../../data");
const storePath = path.join(dataDirectory, "raid-plans.json");
const overrideEmojiId = "1503113067309961400";
const overrideEmojiMention = `<:juststop:${overrideEmojiId}>`;

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

function currentRaids(raid, now = new Date()) {
  runRaidWeekRollover(now);
  return readRaidsForPeriod("current").filter(entry =>
    entry.color?.trim() && entry.color.trim().toLowerCase() !== "unknown" &&
    ["serca", "cathedral"].includes(entry.name.toLowerCase()) &&
    (!raid || entry.name.toLowerCase() === raid.toLowerCase())
  );
}

function getPlanColors(query = "", raid, now = new Date()) {
  return [...new Set(currentRaids(raid, now).map(entry => entry.color))]
    .filter(color => color.toLowerCase().includes(query.trim().toLowerCase())).sort().slice(0, 25);
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

function summaryPages(state, week) {
  const header = `**Planned Times — week of ${week}**\n`;
  const entries = Object.values(state.plans).filter(plan => plan.week === week && plan.status === "confirmed")
    .map(plan => `**${escapeMarkdown(plan.label)}**\n${escapeMarkdown(plan.description)}\n${plan.members.map(id => `<@${id}>`).join(" ")}\n`);
  const pages = [header];
  for (const entry of entries) {
    if ((pages[pages.length - 1] + entry + "\n").length > 2000) pages.push(header);
    pages[pages.length - 1] += `${entry}\n`;
  }
  if (!entries.length) pages[0] += "No confirmed plans yet.";
  return pages;
}

async function publishSummary(channel, state, week) {
  const record = state.summary;
  const pages = summaryPages(state, week);
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
  if (plan.status === "confirmed") await publishSummary(channel, state, getCurrentRaidWeekDate(now));
  if (plan.status === "rejected" && !plan.notified) {
    const payload = {
      content: `<@${plan.creatorId}> Your plan for **${escapeMarkdown(plan.label)}** failed: <@${plan.rejectedBy}> reacted ❌.\n${escapeMarkdown(plan.description)}`,
      allowedMentions: { parse: [], users: [plan.creatorId] }
    };
    await channel.send(payload);
    plan.notified = true;
    save(state);
  }
  await deleteMessage(channel, plan.messageId);
  plan.settled = true;
  save(state);
}

async function inspectPlan(channel, state, plan, now = new Date(), overrideBy = null) {
  if (plan.status !== "pending") {
    if (!plan.settled) await settle(channel, state, plan, now);
    return;
  }
  if (plan.week !== getCurrentRaidWeekDate(now)) {
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
    if (!input.description.trim()) throw planError("Please enter a time or description for the plan.");
    const raids = currentRaids(input.raid, now).filter(raid => raid.color.toLowerCase() === input.color.trim().toLowerCase());
    if (!raids.length) throw planError("No Serca or Cathedral runs match that color this week.");
    const members = resolveMembers(raids);
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || channel.guildId !== input.guildId) throw new Error("Invalid plans channel or guild");
    const state = readState();
    const week = getCurrentRaidWeekDate(now);
    const label = `${raids[0].color} — ${[...new Set(raids.map(raid => raid.name))].join(" & ")}`;
    const content = `**Pending Plan — ${escapeMarkdown(label)}**\n${escapeMarkdown(input.description)}\n${members.map(id => `<@${id}>`).join(" ")}\nProposed by <@${input.creatorId}>. Each run member: ✅ to confirm, ❌ to reject.\nCreator only: ${overrideEmojiMention} to force this plan into Planned Times without waiting for checkmarks.`;
    if (content.length > 2000) throw planError("This plan is too long for Discord. Please shorten the description.");
    await publishSummary(channel, state, week);
    const message = await channel.send({ content, allowedMentions: { parse: [], users: members } });
    state.plans[message.id] = { ...input, label, members, week, messageId: message.id, status: "pending" };
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
    if (plan.status === "pending" && plan.week === getCurrentRaidWeekDate(now) && isRejection) {
      plan.status = "rejected";
      plan.rejectedBy = user.id;
      save(state);
    }
    await inspectPlan(reaction.message.channel, state, plan, now, isOverride ? user.id : null);
  });
}

function checkPlans(client, now) {
  return serialized(async () => {
    now ||= new Date();
    const state = readState();
    const channel = await client.channels.fetch(raidPlansChannelId);
    if (!channel?.isTextBased() || !channel.guildId) throw new Error("The configured raid plans channel must be a server text channel.");
    const week = getCurrentRaidWeekDate(now);
    await publishSummary(channel, state, week);
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
  createPlan,
  getPlanColors,
  resolveMembers,
  summaryPages,
  handlePlanReaction,
  checkPlans,
  startPlanScheduler
};
