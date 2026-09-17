const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Collection, ReactionType } = require("discord.js");

const testDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "raid-plans-"));
const channelId = "1550172613668503682";
const guildId = "100000000000000000";
const overrideEmojiId = "1503113067309961400";
const ids = {
  alice: "100000000000000001",
  bob: "100000000000000002",
  cara: "100000000000000003",
  dave: "100000000000000004",
  eve: "100000000000000005",
  creator: "100000000000000006",
  outsider: "100000000000000007",
  bot: "100000000000000008"
};
const now = new Date("2026-07-28T12:00:00Z");
process.env.RAID_BOT_DATA_DIRECTORY = testDataDirectory;
process.env.RAID_PLANS_CHANNEL_ID = channelId;
process.env.KAZEROS_DISCORD_IDS = `Alice:${ids.outsider},Bob:${ids.bob}`;
const planMappings = `Alice:${ids.alice},AliceAlt:${ids.alice},Cara:${ids.cara},Dave:${ids.dave},Eve:${ids.eve}`;
process.env.RAID_PLAN_DISCORD_IDS = planMappings;

let service = require("../src/services/raidPlans");

function writeJson(name, value) {
  fs.writeFileSync(path.join(testDataDirectory, name), JSON.stringify(value), "utf8");
}

function state() {
  return JSON.parse(fs.readFileSync(path.join(testDataDirectory, "raid-plans.json"), "utf8"));
}

function missingMessage() {
  return Object.assign(new Error("Unknown Message"), { code: 10008 });
}

function discord() {
  let nextId = 1;
  const messages = new Collection();
  const sent = [];
  const deleted = [];
  const fetched = [];
  const channel = {
    id: channelId,
    guildId,
    isTextBased: () => true,
    messages: {
      async fetch(options) {
        assert.equal(options.force, true, "votes must come from a fresh message fetch");
        fetched.push(options.message);
        const message = messages.get(options.message);
        if (!message) throw missingMessage();
        return message;
      },
      async delete(id) {
        if (!messages.delete(id)) throw missingMessage();
        deleted.push(id);
      }
    },
    async send(payload) {
      assert.ok(payload.content.length <= 2000, "Discord message content limit");
      const message = {
        id: String(nextId++),
        channel,
        channelId,
        guildId,
        content: payload.content,
        payload,
        edits: [],
        url: `https://discord.com/channels/${guildId}/${channelId}/${nextId - 1}`,
        reactions: { cache: new Collection() },
        async edit(update) {
          assert.ok(update.content.length <= 2000, "Discord message content limit");
          this.content = update.content;
          this.payload = update;
          this.edits.push(update);
          return this;
        },
        async react(emoji) {
          return vote(this, emoji, ids.bot, true);
        }
      };
      sent.push(message);
      messages.set(message.id, message);
      return message;
    }
  };
  const client = {
    channels: {
      async fetch(id) {
        assert.equal(id, channelId);
        return channel;
      }
    }
  };
  return { client, channel, messages, sent, deleted, fetched };
}

function vote(message, emoji, id, bot = false, type = ReactionType.Normal) {
  const emojiDetails = typeof emoji === "object" ? emoji : /^\d+$/.test(emoji)
    ? { id: emoji, name: emoji === overrideEmojiId ? "juststop" : "other" }
    : { id: null, name: emoji };
  const key = emojiDetails.id || emojiDetails.name;
  let reaction = message.reactions.cache.get(key);
  if (!reaction) {
    const voters = new Collection();
    const burstVoters = new Collection();
    reaction = {
      emoji: emojiDetails,
      message,
      voters,
      burstVoters,
      users: {
        async fetch({ after, limit = 100, type = ReactionType.Normal } = {}) {
          const source = type === ReactionType.Burst ? burstVoters : voters;
          const entries = [...source.entries()]
            .sort(([first], [second]) => first.localeCompare(second))
            .filter(([userId]) => !after || userId > after)
            .slice(0, limit);
          return new Collection(entries);
        }
      }
    };
    message.reactions.cache.set(key, reaction);
  }
  const source = type === ReactionType.Burst ? reaction.burstVoters : reaction.voters;
  source.set(id, { id, bot });
  reaction.countDetails = { normal: reaction.voters.size, burst: reaction.burstVoters.size };
  return reaction;
}

async function react(message, emoji, id, at = now, bot = false) {
  const reaction = vote(message, emoji, id, bot);
  await service.handlePlanReaction(reaction, { id, bot }, at);
}

function create(fake, extra = {}, at = now) {
  return service.createPlan(fake.client, {
    guildId,
    creatorId: ids.creator,
    color: "Red",
    description: "after thursday kazeros",
    ...extra
  }, at);
}

async function confirm(message, at = now) {
  for (const id of state().plans[message.id].members) {
    await react(message, "✅", id, at);
  }
}

test.beforeEach(() => {
  process.env.RAID_PLAN_DISCORD_IDS = planMappings;
  fs.rmSync(path.join(testDataDirectory, "raid-plans.json"), { force: true });
  writeJson("raid-rollover.json", { lastRolloverDate: "2026-07-22" });
  writeJson("raids.json", [
    { name: "Serca", color: "Red", members: [
      { name: "Alice-Paladin", lookupName: "Alice" },
      { name: "Bob-Bard" },
      { name: "AliceAlt-Artist", lookupName: "AliceAlt" }
    ] },
    { name: "Cathedral", color: "Red", members: [
      { name: "Alice-Paladin", lookupName: "Alice" },
      { name: "Cara-Sorceress" }
    ] },
    { name: "Serca", color: "Blue", members: [{ name: "Dave-Slayer" }] },
    { name: "Serca", color: "Unknown", members: [{ name: "Dave-Slayer" }] },
    { name: "Cathedral", color: "Purple", members: [{ name: "Eve-Artist" }] },
    { name: "Kazeros", color: "Unrelated", members: [{ name: "Unknown" }] }
  ]);
  writeJson("raids-prepared.json", {
    targetDate: "2026-07-29",
    raids: [{ name: "Serca", color: "NextWeekOnly", members: [{ name: "Dave-Slayer" }] }]
  });
});

test.after(() => {
  fs.rmSync(testDataDirectory, { recursive: true, force: true });
});

test("color suggestions use this week's Serca and Cathedral runs with optional raid filtering", () => {
  assert.deepEqual(service.getPlanColors("", undefined, now), ["Blue", "Purple", "Red"]);
  assert.deepEqual(service.getPlanColors(" RE ", undefined, now), ["Red"]);
  assert.deepEqual(service.getPlanColors("", "sErCa", now), ["Blue", "Red"]);
  assert.deepEqual(service.getPlanColors("", "Cathedral", now), ["Purple", "Red"]);
  assert.deepEqual(service.getPlanColors("NextWeekOnly", undefined, now), []);
});

test("a same-color plan pings the union of both rosters once and permits a free-form description", async () => {
  const fake = discord();
  const message = await create(fake, {
    color: " rEd ",
    description: "18:00 on saturday\nor after **thursday** kazeros @everyone"
  });
  const plan = state().plans[message.id];
  assert.deepEqual(plan.members, [ids.alice, ids.bob, ids.cara]);
  assert.deepEqual(message.payload.allowedMentions, { parse: [], users: plan.members });
  assert.match(message.content, /Pending Plan/);
  assert.match(message.content, /Red/);
  assert.match(message.content, /Serca/);
  assert.match(message.content, /Cathedral/);
  assert.match(message.content, /18:00 on saturday/);
  assert.match(message.content, /after \\\*\\\*thursday\\\*\\\* kazeros @everyone/);
  assert.deepEqual([...message.reactions.cache.keys()], ["✅", "❌", overrideEmojiId]);
  assert.deepEqual(message.reactions.cache.get(overrideEmojiId).emoji, {
    id: overrideEmojiId,
    name: "juststop"
  });
  assert.equal(plan.status, "pending");
  assert.equal(plan.week, "2026-07-22");
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /Planned Times/);
  assert.match(summary.content, /No confirmed plans yet/);
});

test("selecting one raid only requires members of that raid", async () => {
  const fake = discord();
  const message = await create(fake, { raid: "Cathedral" });
  assert.deepEqual(state().plans[message.id].members, [ids.alice, ids.cara]);
  assert.match(message.content, /Cathedral/);
  assert.doesNotMatch(message.content, /Serca/);
  await confirm(message);
  assert.equal(state().plans[message.id].status, "confirmed");
});

test("unknown colors and incomplete Discord ID mappings refuse to publish a plan", async () => {
  const fake = discord();
  await assert.rejects(create(fake, { color: "NotScheduled" }), error => {
    assert.match(error.userMessage, /No Serca or Cathedral runs match/);
    return true;
  });
  process.env.RAID_PLAN_DISCORD_IDS = `Alice:${ids.alice}`;
  await assert.rejects(create(fake), error => {
    assert.match(error.userMessage, /Cara-Sorceress/);
    assert.match(error.userMessage, /match every run member|RAID_PLAN_DISCORD_IDS/);
    return true;
  });
  assert.equal(fake.sent.length, 0);
  assert.throws(() => service.resolveMembers([{ members: [] }]), error => {
    assert.match(error.userMessage, /empty roster/);
    return true;
  });
});

test("outsider and bot reactions cannot accept or reject a plan", async () => {
  const fake = discord();
  const message = await create(fake);
  await react(message, "❌", ids.outsider);
  await react(message, "❌", ids.alice, now, true);
  await react(message, "✅", ids.outsider);
  await react(message, "✅", ids.alice);
  await react(message, "✅", ids.bob);
  await react(message, "✅", ids.cara, now, true);
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "pending");
  assert.ok(fake.messages.has(message.id));
  assert.equal(fake.sent.length, 2);
  await react(message, "✅", ids.cara);
  assert.equal(state().plans[message.id].status, "confirmed");
});

test("confirmation requires every current checkmark and updates the existing summary once", async () => {
  const fake = discord();
  const message = await create(fake);
  const summaryId = state().summary.messageIds[0];
  await react(message, "✅", ids.alice);
  message.reactions.cache.get("✅").voters.delete(ids.alice);
  await react(message, "✅", ids.bob);
  await react(message, "✅", ids.cara);
  assert.equal(state().plans[message.id].status, "pending");
  assert.ok(fake.messages.has(message.id));
  await react(message, "✅", ids.alice);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.equal(state().plans[message.id].settled, true);
  assert.equal(fake.messages.has(message.id), false);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  const summary = fake.messages.get(summaryId);
  assert.match(summary.content, /after thursday kazeros/);
  assert.deepEqual(summary.payload.allowedMentions, { parse: [] });
  assert.equal(summary.edits.length, 1);
  await react(message, "✅", ids.alice);
  await service.checkPlans(fake.client, now);
  assert.equal(summary.edits.length, 1);
  assert.deepEqual(fake.deleted, [message.id]);
});

test("a failed summary update preserves the confirmation for retry before deleting the pending message", async () => {
  const fake = discord();
  const message = await create(fake);
  const summaryId = state().summary.messageIds[0];
  const summary = fake.messages.get(summaryId);
  await react(message, "✅", ids.alice);
  await react(message, "✅", ids.bob);
  const edit = summary.edit.bind(summary);
  let failNextEdit = true;
  summary.edit = async payload => {
    if (failNextEdit) {
      failNextEdit = false;
      throw new Error("Temporary Discord outage");
    }
    return edit(payload);
  };
  await assert.rejects(react(message, "✅", ids.cara), /Temporary Discord outage/);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.notEqual(state().plans[message.id].settled, true);
  assert.ok(fake.messages.has(message.id));
  assert.doesNotMatch(summary.content, /after thursday kazeros/);
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].settled, true);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  assert.match(summary.content, /after thursday kazeros/);
  assert.equal(fake.messages.has(message.id), false);
  assert.deepEqual(fake.deleted, [message.id]);
});

test("a member's X deletes the proposal and mentions only its creator in the failure notice", async () => {
  const fake = discord();
  const message = await create(fake);
  await react(message, "❌", ids.bob);
  const plan = state().plans[message.id];
  assert.equal(plan.status, "rejected");
  assert.equal(plan.rejectedBy, ids.bob);
  assert.equal(fake.messages.has(message.id), false);
  assert.equal(fake.sent.length, 3);
  const notice = fake.sent[2];
  assert.match(notice.content, new RegExp(`<@${ids.creator}>`));
  assert.match(notice.content, new RegExp(`<@${ids.bob}>`));
  assert.match(notice.content, /failed/);
  assert.deepEqual(notice.payload.allowedMentions, { parse: [], users: [ids.creator] });
  assert.doesNotMatch(fake.messages.get(state().summary.messageIds[0]).content, /after thursday kazeros/);
  await react(message, "❌", ids.bob);
  await service.checkPlans(fake.client, now);
  assert.equal(fake.sent.length, 3, "replayed reactions must not send another failure notice");
});

test("the creator can confirm with juststop without being a roster member or collecting checkmarks", async () => {
  const fake = discord();
  const message = await create(fake);
  const summaryId = state().summary.messageIds[0];
  assert.equal(state().plans[message.id].members.includes(ids.creator), false);
  await react(message, overrideEmojiId, ids.creator);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.equal(state().plans[message.id].overriddenBy, ids.creator);
  assert.equal(state().plans[message.id].settled, true);
  assert.equal(fake.messages.has(message.id), false);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  const summary = fake.messages.get(summaryId);
  assert.match(summary.content, /after thursday kazeros/);
  assert.deepEqual(summary.payload.allowedMentions, { parse: [] });
  await react(message, overrideEmojiId, ids.creator);
  await service.checkPlans(fake.client, now);
  assert.equal(summary.edits.length, 1);
  assert.deepEqual(fake.deleted, [message.id]);
});

test("noncreators, bots, and another emoji named juststop cannot override by event or polling", async () => {
  const fake = discord();
  const scenarios = [
    { id: ids.alice, emoji: overrideEmojiId },
    { id: ids.outsider, emoji: overrideEmojiId },
    { id: ids.creator, emoji: overrideEmojiId, bot: true },
    { id: ids.creator, emoji: { id: "1503113067309961401", name: "juststop" } }
  ];
  for (const scenario of scenarios) {
    const message = await create(fake);
    await react(message, scenario.emoji, scenario.id, now, scenario.bot || false);
    assert.equal(state().plans[message.id].status, "pending");
    await service.checkPlans(fake.client, now);
    assert.equal(state().plans[message.id].status, "pending");
    assert.ok(fake.messages.has(message.id));
  }
  assert.equal(fake.deleted.length, 0);
});

test("custom emoji names cannot impersonate the ordinary checkmark or X reactions", async () => {
  const fake = discord();
  const message = await create(fake);
  await react(message, { id: "1503113067309961402", name: "❌" }, ids.alice);
  for (const id of [ids.alice, ids.bob, ids.cara]) {
    await react(message, { id: "1503113067309961403", name: "✅" }, id);
  }
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "pending");
  assert.ok(fake.messages.has(message.id));
});

test("a creator mentioned in the byline has no ordinary vote unless they belong to the saved roster", async () => {
  const fake = discord();
  const message = await create(fake);
  assert.match(message.content, new RegExp(`Proposed by <@${ids.creator}>`));
  await react(message, "✅", ids.creator);
  await react(message, "❌", ids.creator);
  await react(message, "✅", ids.alice);
  await react(message, "✅", ids.bob);
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "pending");
  await react(message, "✅", ids.cara);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.equal(fake.sent.length, 2, "the creator's X must not send a rejection notice");
});

test("votes use the saved roster even when the weekly run roster changes after creation", async () => {
  const fake = discord();
  const message = await create(fake);
  writeJson("raids.json", [{ name: "Serca", color: "Red", members: [{ name: "Dave-Slayer" }] }]);
  await react(message, "❌", ids.dave);
  await react(message, "✅", ids.dave);
  await react(message, "✅", ids.alice);
  await react(message, "✅", ids.bob);
  await service.checkPlans(fake.client, now);
  assert.deepEqual(state().plans[message.id].members, [ids.alice, ids.bob, ids.cara]);
  assert.equal(state().plans[message.id].status, "pending");
  await react(message, "✅", ids.cara);
  assert.equal(state().plans[message.id].status, "confirmed");
});

test("a creator's override made offline is recovered after restart", async () => {
  const fake = discord();
  const message = await create(fake, { description: "override while offline" });
  vote(message, overrideEmojiId, ids.creator);
  const burst = await create(fake, { description: "super override while offline" });
  vote(burst, overrideEmojiId, ids.creator, false, ReactionType.Burst);
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.equal(state().plans[message.id].overriddenBy, ids.creator);
  assert.equal(state().plans[burst.id].status, "confirmed");
  assert.equal(state().plans[burst.id].overriddenBy, ids.creator);
  assert.equal(fake.messages.has(message.id), false);
  assert.equal(fake.messages.has(burst.id), false);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /override while offline/);
});

test("a roster member's offline X takes priority over a simultaneous creator override", async () => {
  const fake = discord();
  const message = await create(fake);
  vote(message, overrideEmojiId, ids.creator);
  vote(message, "❌", ids.bob);
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "rejected");
  assert.equal(state().plans[message.id].rejectedBy, ids.bob);
  assert.equal(fake.messages.has(message.id), false);
  assert.doesNotMatch(fake.messages.get(state().summary.messageIds[0]).content, /after thursday kazeros/);
  assert.deepEqual(fake.sent.at(-1).payload.allowedMentions, { parse: [], users: [ids.creator] });
});

test("creator overrides cannot revive rejected, expired, or stale pending plans", async () => {
  const fake = discord();
  const rejected = await create(fake);
  await react(rejected, "❌", ids.alice);
  await react(rejected, overrideEmojiId, ids.creator);
  assert.equal(state().plans[rejected.id].status, "rejected");
  const expired = await create(fake);
  const reset = new Date("2026-07-29T08:00:00Z");
  await service.checkPlans(fake.client, reset);
  assert.equal(state().plans[expired.id].status, "expired");
  await react(expired, overrideEmojiId, ids.creator, reset);
  assert.equal(state().plans[expired.id].status, "expired");
  const stale = await create(fake);
  await react(stale, overrideEmojiId, ids.creator, reset);
  assert.equal(state().plans[stale.id].status, "expired");
  await service.checkPlans(fake.client, reset);
  assert.equal(fake.messages.has(rejected.id), false);
  assert.equal(fake.messages.has(expired.id), false);
  assert.equal(fake.messages.has(stale.id), false);
  assert.match(fake.messages.get(state().summary.messageIds[0]).content, /No confirmed plans yet/);
});

test("persisted pending plans recover current votes after the service restarts", async () => {
  const fake = discord();
  const approved = await create(fake, { description: "approved while offline" });
  const rejected = await create(fake, { description: "rejected while offline" });
  for (const id of [ids.alice, ids.bob, ids.cara]) vote(approved, "✅", id);
  vote(rejected, "❌", ids.cara);
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[approved.id].status, "confirmed");
  assert.equal(state().plans[rejected.id].status, "rejected");
  assert.equal(state().plans[rejected.id].rejectedBy, ids.cara);
  assert.equal(fake.messages.has(approved.id), false);
  assert.equal(fake.messages.has(rejected.id), false);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /approved while offline/);
  assert.doesNotMatch(summary.content, /rejected while offline/);
  const sentCount = fake.sent.length;
  await service.checkPlans(fake.client, now);
  assert.equal(fake.sent.length, sentCount);
});

test("reconciliation includes super reactions when approving or rejecting a plan", async () => {
  const fake = discord();
  const approved = await create(fake);
  vote(approved, "✅", ids.alice);
  vote(approved, "✅", ids.bob);
  vote(approved, "✅", ids.cara, false, ReactionType.Burst);
  const rejected = await create(fake);
  vote(rejected, "❌", ids.bob, false, ReactionType.Burst);
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[approved.id].status, "confirmed");
  assert.equal(state().plans[rejected.id].status, "rejected");
  assert.equal(state().plans[rejected.id].rejectedBy, ids.bob);
});

test("Wednesday at 10:00 Amsterdam clears the same summary and expires old pending plans", async () => {
  const fake = discord();
  const approved = await create(fake, { description: "last week's confirmed time" });
  await confirm(approved);
  const pending = await create(fake, { description: "last week's pending time" });
  const summaryId = state().summary.messageIds[0];
  const summary = fake.messages.get(summaryId);
  await service.checkPlans(fake.client, new Date("2026-07-29T07:59:59Z"));
  assert.match(summary.content, /last week's confirmed time/);
  assert.ok(fake.messages.has(pending.id));
  const reset = new Date("2026-07-29T08:00:00Z");
  await service.checkPlans(fake.client, reset);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  assert.equal(state().summary.week, "2026-07-29");
  assert.match(summary.content, /No confirmed plans yet/);
  assert.doesNotMatch(summary.content, /last week's/);
  assert.equal(state().plans[pending.id].status, "expired");
  assert.equal(fake.messages.has(pending.id), false);
  const nextPlan = await create(fake, {
    color: "NextWeekOnly",
    description: "this week's new time"
  }, reset);
  await confirm(nextPlan, reset);
  const sentCount = fake.sent.length;
  await service.checkPlans(fake.client, new Date("2026-07-30T08:00:00Z"));
  assert.match(summary.content, /this week's new time/);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  assert.equal(fake.sent.length, sentCount, "Thursday must not publish or clear a daily summary");
});

test("weekly reset deletes summary overflow pages while keeping the original main message", async () => {
  const fake = discord();
  const first = await create(fake, { description: "a".repeat(1000) });
  await confirm(first);
  const second = await create(fake, { description: "b".repeat(1000) });
  await confirm(second);
  const [mainId, overflowId] = state().summary.messageIds;
  assert.equal(state().summary.messageIds.length, 2);
  assert.ok(fake.messages.has(overflowId));
  await service.checkPlans(fake.client, new Date("2026-07-29T08:00:00Z"));
  assert.deepEqual(state().summary.messageIds, [mainId]);
  assert.equal(fake.messages.has(overflowId), false);
  assert.match(fake.messages.get(mainId).content, /No confirmed plans yet/);
  assert.equal(fake.messages.size, 1);
});

test("summaries paginate confirmed plans within Discord's limit and omit other weeks and statuses", () => {
  const week = "2026-07-22";
  const plans = Object.fromEntries(Array.from({ length: 8 }, (_, index) => [String(index), {
    week,
    status: "confirmed",
    label: `Red run ${index}`,
    description: `Time-${index}: ${"a".repeat(850)}`,
    members: [ids.alice, ids.bob, ids.cara]
  }]));
  plans.pending = { ...plans[0], status: "pending", description: "pending description" };
  plans.old = { ...plans[0], week: "2026-07-15", description: "old description" };
  const pages = service.summaryPages({ plans }, week);
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => page.length <= 2000));
  assert.ok(pages.every(page => page.includes("Planned Times")));
  const combined = pages.join("\n");
  for (let index = 0; index < 8; index++) {
    assert.equal(combined.split(`Time-${index}:`).length - 1, 1);
  }
  assert.doesNotMatch(combined, /pending description|old description/);
});

test("summary pagination includes separator newlines in the 2,000-character limit", () => {
  const week = "2026-09-16";
  const plans = Object.fromEntries([900, 982].map((length, index) => [index, {
    week,
    status: "confirmed",
    label: "Red — Serca",
    description: "a".repeat(length),
    members: ["123456789012345678"]
  }]));
  const pages = service.summaryPages({ plans }, week);
  assert.equal(pages.length, 2);
  assert.ok(pages.every(page => page.length <= 2000));
});
