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
const { completeRaids, uncompleteRaids, readRaids } = require("../src/services/raidStore");

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
  const dms = [];
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
    users: {
      async fetch(id) {
        return { send: async payload => { dms.push({ userId: id, ...payload }); } };
      }
    },
    channels: {
      async fetch(id) {
        assert.equal(id, channelId);
        return channel;
      }
    }
  };
  channel.client = client;
  return { client, channel, messages, sent, dms, deleted, fetched };
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
    day: "Tuesday",
    description: "after thursday kazeros",
    ...extra
  }, at);
}

function unplan(fake, extra = {}, at = now) {
  return service.removePlannedRaids(fake.client, {
    guildId,
    creatorId: ids.creator,
    color: "Red",
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

test("Monday and Tuesday color suggestions include current and prepared runs with raid filtering", () => {
  assert.deepEqual(service.getPlanColors("", undefined, now), ["Blue", "NextWeekOnly", "Purple", "Red"]);
  assert.deepEqual(service.getPlanColors(" RE ", undefined, now), ["Red"]);
  assert.deepEqual(service.getPlanColors("", "sErCa", now), ["Blue", "NextWeekOnly", "Red"]);
  assert.deepEqual(service.getPlanColors("", "Cathedral", now), ["Purple", "Red"]);
  assert.deepEqual(service.getPlanColors("NextWeekOnly", undefined, now), ["NextWeekOnly"]);
  assert.deepEqual(service.getPlanColors("NextWeekOnly", undefined, new Date("2026-07-26T12:00:00Z")), []);
});

test("a same-color plan pings the union of both rosters once and permits a free-form description", async () => {
  const fake = discord();
  const message = await create(fake, {
    color: " rEd ",
    day: "Friday",
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
  assert.equal(plan.day, "Friday");
  assert.match(message.content, /__\*\*Friday\*\*__ · Week of/);
  assert.equal(plan.week, "2026-07-22");
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /Confirmed Times/);
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

test("a member's X deletes the proposal and DMs only its creator without a channel notice", async () => {
  const fake = discord();
  const message = await create(fake);
  await react(message, "❌", ids.bob);
  const plan = state().plans[message.id];
  assert.equal(plan.status, "rejected");
  assert.equal(plan.rejectedBy, ids.bob);
  assert.equal(fake.messages.has(message.id), false);
  assert.equal(fake.sent.length, 2);
  assert.equal(fake.dms.length, 1);
  const notice = fake.dms[0];
  assert.equal(notice.userId, ids.creator);
  assert.match(notice.content, new RegExp(`<@${ids.bob}>`));
  assert.match(notice.content, /failed/);
  assert.deepEqual(notice.allowedMentions, { parse: [] });
  assert.doesNotMatch(fake.messages.get(state().summary.messageIds[0]).content, /after thursday kazeros/);
  await react(message, "❌", ids.bob);
  await service.checkPlans(fake.client, now);
  assert.equal(fake.sent.length, 2);
  assert.equal(fake.dms.length, 1, "replayed reactions must not send another failure DM");
});

test("blocked DMs still cancel and delete the plan without posting publicly or retrying forever", async t => {
  t.mock.method(console, "warn", () => {});
  const fake = discord();
  const message = await create(fake);
  let attempts = 0;
  fake.client.users.fetch = async () => ({
    send: async () => {
      attempts++;
      throw Object.assign(new Error("Cannot send messages to this user"), { code: 50007 });
    }
  });
  await react(message, "❌", ids.bob);
  assert.equal(fake.messages.has(message.id), false);
  assert.equal(state().plans[message.id].status, "rejected");
  assert.equal(state().plans[message.id].notificationFailed, 50007);
  assert.equal(state().plans[message.id].settled, true);
  assert.notEqual(state().plans[message.id].notified, true);
  await service.checkPlans(fake.client, now);
  assert.equal(attempts, 1);
  assert.equal(fake.sent.length, 2);
});

test("temporary DM errors delete the proposal immediately and retry privately after restart", async () => {
  const fake = discord();
  const message = await create(fake);
  const fetchUser = fake.client.users.fetch;
  fake.client.users.fetch = async () => ({ send: async () => { throw new Error("Temporary DM outage"); } });
  await assert.rejects(react(message, "❌", ids.bob), /Temporary DM outage/);
  assert.equal(fake.messages.has(message.id), false);
  assert.equal(state().plans[message.id].status, "rejected");
  assert.notEqual(state().plans[message.id].settled, true);
  assert.equal(fake.sent.length, 2);
  fake.client.users.fetch = fetchUser;
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  assert.equal(fake.dms.length, 1);
  assert.equal(fake.dms[0].userId, ids.creator);
  assert.equal(state().plans[message.id].notified, true);
  assert.equal(state().plans[message.id].settled, true);
  await service.checkPlans(fake.client, now);
  assert.equal(fake.dms.length, 1);
  assert.equal(fake.sent.length, 2);
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
  assert.equal(fake.dms.at(-1).userId, ids.creator);
  assert.deepEqual(fake.dms.at(-1).allowedMentions, { parse: [] });
});

test("creator overrides cannot revive rejected, expired, or stale pending plans", async () => {
  const fake = discord();
  const rejected = await create(fake);
  await react(rejected, "❌", ids.alice);
  await react(rejected, overrideEmojiId, ids.creator);
  assert.equal(state().plans[rejected.id].status, "rejected");
  const expired = await create(fake);
  const reset = new Date("2026-07-28T21:59:00Z");
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

test("Tuesday at 23:59 Amsterdam clears the same summary and expires old pending plans", async () => {
  const fake = discord();
  const approved = await create(fake, { description: "last week's confirmed time" });
  await confirm(approved);
  const pending = await create(fake, { description: "last week's pending time" });
  const summaryId = state().summary.messageIds[0];
  const summary = fake.messages.get(summaryId);
  await service.checkPlans(fake.client, new Date("2026-07-28T21:58:59Z"));
  assert.match(summary.content, /last week's confirmed time/);
  assert.ok(fake.messages.has(pending.id));
  const reset = new Date("2026-07-28T21:59:00Z");
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

test("pending messages end at the proposer and older instruction text is removed without repinging", async () => {
  const fake = discord();
  const message = await create(fake);
  assert.ok(message.content.endsWith(`Proposed by <@${ids.creator}>.`));
  message.content += " Each run member: ✅ to confirm, ❌ to reject.\nCreator only: juststop.";
  await service.checkPlans(fake.client, now);
  assert.ok(message.content.endsWith(`Proposed by <@${ids.creator}>.`));
  assert.deepEqual(message.edits.at(-1).allowedMentions, { parse: [] });
  assert.deepEqual([...message.reactions.cache.keys()], ["✅", "❌", overrideEmojiId]);
});

test("upcoming plans use prepared members and keep their confirmed and pending plans through Tuesday's wipe", async () => {
  const fake = discord();
  const current = await create(fake, { description: "old confirmed time" });
  await confirm(current);
  const oldPending = await create(fake, { description: "old pending time" });
  const next = await create(fake, { color: "NextWeekOnly", week: "2026-07-29", description: "upcoming confirmed time" });
  const nextPending = await create(fake, { color: "NextWeekOnly", week: "2026-07-29", description: "upcoming pending time" });
  assert.deepEqual(state().plans[next.id].members, [ids.dave]);
  assert.match(next.content, /Week of 2026-07-29/);
  await confirm(next);
  const summaryId = state().summary.messageIds[0];
  const summary = fake.messages.get(summaryId);
  assert.ok(summary.content.indexOf("week of 2026-07-22") < summary.content.indexOf("old confirmed time"));
  assert.ok(summary.content.indexOf("week of 2026-07-29") < summary.content.indexOf("upcoming confirmed time"));
  assert.equal(state().plans[nextPending.id].status, "pending");
  await service.checkPlans(fake.client, new Date("2026-07-28T21:58:59Z"));
  assert.match(summary.content, /old confirmed time/);
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  const wipe = new Date("2026-07-28T21:59:00Z");
  await service.checkPlans(fake.client, wipe);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  assert.match(summary.content, /week of 2026-07-29/);
  assert.match(summary.content, /upcoming confirmed time/);
  assert.doesNotMatch(summary.content, /2026-07-22|old confirmed time/);
  assert.equal(state().plans[oldPending.id].status, "expired");
  assert.equal(fake.messages.has(oldPending.id), false);
  assert.equal(state().plans[nextPending.id].status, "pending");
  assert.equal(fake.messages.has(nextPending.id), true);
  await confirm(nextPending, new Date("2026-07-28T22:01:00Z"));
  await service.checkPlans(fake.client, new Date("2026-07-29T08:00:00Z"));
  assert.match(summary.content, /upcoming confirmed time/);
  assert.match(summary.content, /upcoming pending time/);
});

test("upcoming plans fall back to the current roster and never inherit last reset's completion", async () => {
  fs.unlinkSync(path.join(testDataDirectory, "raids-prepared.json"));
  const fake = discord();
  const current = await create(fake, { description: "current done" });
  await confirm(current);
  completeRaids({ color: "Red", completedBy: ids.alice });
  const next = await create(fake, { week: "2026-07-29", description: "upcoming not done" });
  await react(next, overrideEmojiId, ids.creator);
  assert.deepEqual(state().plans[next.id].members, state().plans[current.id].members);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:\*\* current done/);
  assert.match(summary.content, /\n\*\*Red — Serca & Cathedral:\*\* upcoming not done\n/);
  await service.checkPlans(fake.client, new Date("2026-07-28T21:59:00Z"));
  assert.doesNotMatch(summary.content, /~~|current done/);
  await service.checkPlans(fake.client, new Date("2026-07-29T07:59:59Z"));
  assert.doesNotMatch(summary.content, /~~/);
  require("../src/services/raidPeriodStore").runRaidWeekRollover(new Date("2026-07-29T08:00:00Z"));
  await service.checkPlans(fake.client, new Date("2026-07-29T08:00:00Z"));
  assert.doesNotMatch(summary.content, /~~/);
  completeRaids({ color: "Red", completedBy: ids.alice });
  await service.refreshConfirmedTimes(fake.client, guildId, new Date("2026-07-29T08:01:00Z"));
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:\*\* upcoming not done/);
});

test("reset selection validates the target date and the target roster before posting", async () => {
  const fake = discord();
  await assert.rejects(create(fake, { week: "2026-07-29", color: "Red" }), /No Serca or Cathedral runs match/);
  await assert.rejects(create(fake, { week: "2026-07-22", color: "NextWeekOnly" }), /No Serca or Cathedral runs match/);
  await assert.rejects(create(fake, { week: "2026-07-15" }), /reset has already ended/);
  await assert.rejects(create(fake, { week: "2026-08-05" }), /reset has already ended/);
  await assert.rejects(create(fake, { week: "2026-07-22" }, new Date("2026-07-28T21:59:00Z")), /reset has already ended/);
  assert.equal(fake.sent.length, 0);
  const currentAfterWipe = await create(fake, { color: "NextWeekOnly" }, new Date("2026-07-28T21:59:00Z"));
  assert.equal(state().plans[currentAfterWipe.id].week, "2026-07-29");
  assert.deepEqual(state().plans[currentAfterWipe.id].members, [ids.dave]);
});

test("unplan can target upcoming plans without touching the same color in the current reset", async () => {
  fs.unlinkSync(path.join(testDataDirectory, "raids-prepared.json"));
  const fake = discord();
  const current = await create(fake, { description: "keep current plan" });
  const next = await create(fake, { week: "2026-07-29", description: "remove upcoming plan" });
  await confirm(current);
  await confirm(next);
  assert.deepEqual(service.getUnplanColors("", { guildId, creatorId: ids.creator, week: "next" }, now), ["Red"]);
  assert.deepEqual(await unplan(fake, { week: "next" }), { removedCount: 1 });
  assert.equal(state().plans[next.id].status, "unplanned");
  assert.equal(state().plans[current.id].status, "confirmed");
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /keep current plan/);
  assert.doesNotMatch(summary.content, /remove upcoming plan|week of 2026-07-29/);
});

test("long upcoming sections survive the wipe with all entries and valid pagination", async () => {
  const fake = discord();
  const old = await create(fake, { description: "old-" + "o".repeat(950) });
  await confirm(old);
  for (const prefix of ["future-first-", "future-second-"]) {
    const next = await create(fake, { color: "NextWeekOnly", week: "2026-07-29", description: prefix + "f".repeat(950) });
    await confirm(next);
  }
  const mainId = state().summary.messageIds[0];
  assert.equal(state().summary.messageIds.length, 3);
  await service.checkPlans(fake.client, new Date("2026-07-28T21:59:00Z"));
  assert.equal(state().summary.messageIds[0], mainId);
  assert.equal(state().summary.messageIds.length, 2);
  const pages = state().summary.messageIds.map(id => fake.messages.get(id).content);
  assert.ok(pages.every(page => page.length <= 2000));
  const content = pages.join("\n");
  assert.doesNotMatch(content, /old-|week of 2026-07-22/);
  assert.equal(content.split("future-first-").length, 2);
  assert.equal(content.split("future-second-").length, 2);
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

test("unplan color suggestions include only the creator's current confirmed plans in their guild", () => {
  const base = {
    creatorId: ids.creator,
    guildId,
    week: "2026-07-22",
    status: "confirmed",
    color: "Red"
  };
  writeJson("raid-plans.json", {
    summary: { messageIds: [] },
    plans: {
      red: { ...base },
      duplicate: { ...base, color: " red " },
      blue: { ...base, color: "Blue" },
      otherCreator: { ...base, creatorId: ids.bob, color: "OtherCreator" },
      otherGuild: { ...base, guildId: "100000000000000099", color: "OtherGuild" },
      previousWeek: { ...base, week: "2026-07-15", color: "PreviousWeek" },
      pending: { ...base, status: "pending", color: "Pending" },
      rejected: { ...base, status: "rejected", color: "Rejected" },
      removed: { ...base, status: "unplanned", color: "Removed" }
    }
  });
  const original = state();
  const owner = { guildId, creatorId: ids.creator };
  assert.deepEqual(service.getUnplanColors("", owner, now), ["Blue", "Red"]);
  assert.deepEqual(service.getUnplanColors(" RE ", owner, now), ["Red"]);
  assert.deepEqual(service.getUnplanColors("Green", owner, now), []);
  assert.deepEqual(service.getUnplanColors("", { guildId, creatorId: ids.bob }, now), ["OtherCreator"]);
  assert.deepEqual(service.getUnplanColors("", { guildId, creatorId: ids.outsider }, now), []);
  assert.deepEqual(service.getUnplanColors("", owner, new Date("2026-07-29T08:00:00Z")), []);
  assert.deepEqual(state(), original, "autocomplete must not mutate persisted plans");
});

test("unplan removes all owned confirmed plans of the exact color while preserving other plans", async () => {
  const fake = discord();
  const approved = await create(fake, { description: "owned normal plan" });
  await confirm(approved);
  const forced = await create(fake, { color: " rEd ", description: "owned forced plan" });
  await react(forced, overrideEmojiId, ids.creator);
  const anotherCreator = await create(fake, { creatorId: ids.bob, description: "another creator's red plan" });
  await confirm(anotherCreator);
  const blue = await create(fake, { color: "Blue", description: "owned blue plan" });
  await confirm(blue);
  const pending = await create(fake, { description: "pending red plan" });
  const original = state();
  original.plans.old = { ...original.plans[approved.id], messageId: "old", week: "2026-07-15" };
  original.plans.otherGuild = {
    ...original.plans[approved.id],
    messageId: "otherGuild",
    guildId: "100000000000000099",
    description: "another guild's plan"
  };
  original.plans.similarColor = {
    ...original.plans[approved.id],
    messageId: "similarColor",
    color: "Redder",
    description: "a different color's plan"
  };
  writeJson("raid-plans.json", original);
  const removedAt = new Date("2026-07-28T12:01:00Z");
  const sentCount = fake.sent.length;
  const result = await unplan(fake, { color: " RED " }, removedAt);
  assert.deepEqual(result, { removedCount: 2 });
  for (const message of [approved, forced]) {
    const removed = state().plans[message.id];
    assert.equal(removed.status, "unplanned");
    assert.equal(removed.unplannedBy, ids.creator);
    assert.equal(removed.unplannedAt, removedAt.toISOString());
  }
  for (const id of [anotherCreator.id, blue.id, pending.id, "old", "otherGuild", "similarColor"]) {
    assert.deepEqual(state().plans[id], original.plans[id]);
  }
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.doesNotMatch(summary.content, /owned normal plan|owned forced plan|pending red plan/);
  assert.match(summary.content, /another creator's red plan/);
  assert.match(summary.content, /owned blue plan/);
  assert.deepEqual(summary.payload.allowedMentions, { parse: [] });
  assert.equal(fake.sent.length, sentCount);
  assert.ok(fake.messages.has(pending.id));
});

test("unplan refuses other members, outsiders, guilds, and unmatched colors without changing or posting anything", async () => {
  const fake = discord();
  const message = await create(fake);
  await confirm(message);
  const original = state();
  const summary = fake.messages.get(original.summary.messageIds[0]);
  const editCount = summary.edits.length;
  const sentCount = fake.sent.length;
  const scenarios = [
    { creatorId: ids.alice },
    { creatorId: ids.outsider },
    { guildId: "100000000000000099" },
    { color: "Blue" },
    { color: "Re" }
  ];
  for (const extra of scenarios) {
    await assert.rejects(unplan(fake, extra), error => {
      assert.equal(typeof error.userMessage, "string");
      assert.ok(error.userMessage.length > 0);
      return true;
    });
    assert.deepEqual(state(), original);
    assert.equal(fake.sent.length, sentCount);
    assert.equal(summary.edits.length, editCount);
  }
});

test("unplan shrinks summary overflow and preserves the main message when the last plan is removed", async () => {
  const fake = discord();
  const red = await create(fake, { description: "r".repeat(1000) });
  await confirm(red);
  const blue = await create(fake, { color: "Blue", description: "b".repeat(1000) });
  await confirm(blue);
  const [mainId, overflowId] = state().summary.messageIds;
  assert.equal(state().summary.messageIds.length, 2);
  assert.ok(fake.messages.has(overflowId));
  assert.deepEqual(await unplan(fake), { removedCount: 1 });
  assert.deepEqual(state().summary.messageIds, [mainId]);
  assert.equal(fake.messages.has(overflowId), false);
  const summary = fake.messages.get(mainId);
  assert.ok(summary.content.includes("b".repeat(1000)));
  assert.equal(summary.content.includes("r".repeat(1000)), false);
  assert.deepEqual(await unplan(fake, { color: "Blue" }), { removedCount: 1 });
  assert.deepEqual(state().summary.messageIds, [mainId]);
  assert.match(summary.content, /No confirmed plans yet/);
  assert.equal(fake.messages.size, 1);
});

test("removed plans stay removed across restart, replayed reactions, and repeated removal requests", async () => {
  const fake = discord();
  const message = await create(fake);
  await react(message, overrideEmojiId, ids.creator);
  await unplan(fake);
  const removed = state().plans[message.id];
  const sentCount = fake.sent.length;
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  await react(message, overrideEmojiId, ids.creator);
  await react(message, "✅", ids.alice);
  await assert.rejects(unplan(fake), error => Boolean(error.userMessage));
  assert.deepEqual(state().plans[message.id], removed);
  assert.equal(fake.sent.length, sentCount);
  assert.match(fake.messages.get(state().summary.messageIds[0]).content, /No confirmed plans yet/);
  assert.deepEqual(service.getUnplanColors("", { guildId, creatorId: ids.creator }, now), []);
});

test("unplan persists before a failed summary update and recovery cleans a confirmed but unsettled proposal", async () => {
  const fake = discord();
  const message = await create(fake);
  const summaryId = state().summary.messageIds[0];
  const summary = fake.messages.get(summaryId);
  const deleteMessage = fake.channel.messages.delete.bind(fake.channel.messages);
  let failNextDelete = true;
  fake.channel.messages.delete = async id => {
    if (failNextDelete) {
      failNextDelete = false;
      throw new Error("Temporary message deletion failure");
    }
    return deleteMessage(id);
  };
  await assert.rejects(confirm(message), /Temporary message deletion failure/);
  assert.equal(state().plans[message.id].status, "confirmed");
  assert.notEqual(state().plans[message.id].settled, true);
  assert.ok(fake.messages.has(message.id));
  assert.match(summary.content, /after thursday kazeros/);
  const edit = summary.edit.bind(summary);
  let failNextEdit = true;
  summary.edit = async payload => {
    if (failNextEdit) {
      failNextEdit = false;
      throw new Error("Temporary unplan summary failure");
    }
    return edit(payload);
  };
  await assert.rejects(unplan(fake), /Temporary unplan summary failure/);
  assert.equal(state().plans[message.id].status, "unplanned");
  assert.equal(state().plans[message.id].unplannedBy, ids.creator);
  assert.equal(state().plans[message.id].unplannedAt, now.toISOString());
  assert.ok(fake.messages.has(message.id));
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  assert.equal(state().plans[message.id].status, "unplanned");
  assert.equal(state().plans[message.id].settled, true);
  assert.equal(fake.messages.has(message.id), false);
  assert.deepEqual(state().summary.messageIds, [summaryId]);
  assert.match(summary.content, /No confirmed plans yet/);
  assert.deepEqual(fake.deleted, [message.id]);
  await service.checkPlans(fake.client, now);
  assert.deepEqual(fake.deleted, [message.id]);
});

test("completed color plans are hidden after recreation and uncomplete restores unexpired plans", async () => {
  const fake = discord();
  const red = await create(fake, { color: " rEd ", description: "red time" });
  const blue = await create(fake, { color: "Blue", description: "blue time" });
  await confirm(red);
  await confirm(blue);
  const originalSummaryId = state().summary.messageIds[0];
  completeRaids({ color: "RED", completedBy: ids.alice });
  await service.refreshConfirmedTimes(fake.client, guildId, now);
  const summary = fake.messages.get(originalSummaryId);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:\*\* red time/);
  assert.doesNotMatch(summary.content, /red time/);
  assert.match(summary.content, /\n\*\*Blue — Serca:\*\* blue time\n/);
  assert.deepEqual(summary.payload.allowedMentions, { parse: [] });
  assert.equal(state().plans[red.id].status, "confirmed");
  fake.messages.delete(originalSummaryId);
  delete require.cache[require.resolve("../src/services/raidPlans")];
  service = require("../src/services/raidPlans");
  await service.checkPlans(fake.client, now);
  const replacement = fake.messages.get(state().summary.messageIds[0]);
  assert.doesNotMatch(replacement.content, /\*\*Red — Serca & Cathedral:\*\* red time/);
  uncompleteRaids({ color: "Red", uncompletedBy: ids.alice });
  await service.refreshConfirmedTimes(fake.client, guildId, now);
  assert.doesNotMatch(replacement.content, /~~/);
  assert.match(replacement.content, /\*\*Red — Serca & Cathedral:\*\* red time/);
});

test("raid-specific completion hides only fully completed plans, including legacy saved plans", async () => {
  const fake = discord();
  const combined = await create(fake, { description: "both raids" });
  const serca = await create(fake, { raid: "Serca", description: "serca only" });
  const cathedral = await create(fake, { raid: "Cathedral", description: "cathedral only" });
  await confirm(combined);
  await confirm(serca);
  await confirm(cathedral);
  const legacyState = state();
  for (const plan of Object.values(legacyState.plans)) delete plan.raidNames;
  writeJson("raid-plans.json", legacyState);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  completeRaids({ color: "Red", raidName: "Serca", completedBy: ids.alice });
  await service.refreshConfirmedTimes(fake.client, guildId, now);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca:\*\* serca only/);
  assert.match(summary.content, /\n\*\*Red — Serca & Cathedral:\*\* both raids\n/);
  assert.match(summary.content, /\n\*\*Red — Cathedral:\*\* cathedral only\n/);
  completeRaids({ color: "Red", raidName: "Cathedral", completedBy: ids.bob });
  await service.refreshConfirmedTimes(fake.client, guildId, now);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:\*\* both raids/);
  assert.doesNotMatch(summary.content, /\*\*Red — Cathedral:\*\* cathedral only/);
  uncompleteRaids({ color: "Red", raidName: "Serca", uncompletedBy: ids.bob });
  await service.refreshConfirmedTimes(fake.client, guildId, now);
  assert.match(summary.content, /\n\*\*Red — Serca & Cathedral:\*\* both raids\n/);
  assert.doesNotMatch(summary.content, /\*\*Red — Cathedral:\*\* cathedral only/);
});

test("completion requires every matching run and never treats missing roster data as completed", async () => {
  const fake = discord();
  const message = await create(fake, { raid: "Serca" });
  await confirm(message);
  completeRaids({ color: "Red", raidName: "Serca", completedBy: ids.alice });
  const raids = readRaids();
  raids.push({ name: "Serca", color: "Red", status: "TODO", members: [] });
  writeJson("raids.json", raids);
  await service.checkPlans(fake.client, now);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.doesNotMatch(summary.content, /~~/);
  writeJson("raids.json", []);
  await service.checkPlans(fake.client, now);
  assert.doesNotMatch(summary.content, /~~/);
});

test("completion display retries after Discord failures without losing raid completion", async () => {
  const fake = discord();
  const message = await create(fake);
  await confirm(message);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  const edit = summary.edit.bind(summary);
  summary.edit = async () => { throw new Error("Temporary summary failure"); };
  completeRaids({ color: "Red", completedBy: ids.alice });
  await assert.rejects(service.refreshConfirmedTimes(fake.client, guildId, now), /Temporary summary failure/);
  assert.ok(readRaids().filter(raid => raid.color === "Red").every(raid => raid.status === "DONE"));
  summary.edit = edit;
  await service.checkPlans(fake.client, now);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:/);
});

test("complete and uncomplete commands immediately refresh Confirmed Times, including repeated completion", async () => {
  const fake = discord();
  const message = await create(fake);
  await confirm(message);
  const saved = state();
  saved.plans[message.id].week = require("../src/services/raidPeriodStore").getCurrentRaidWeekDate();
  writeJson("raid-rollover.json", { lastRolloverDate: saved.plans[message.id].week });
  writeJson("raid-plans.json", saved);
  const summary = fake.messages.get(saved.summary.messageIds[0]);
  const replies = [];
  const interaction = {
    client: fake.client,
    guildId,
    user: { id: ids.alice },
    options: { getString: name => name === "color" ? "Red" : null },
    reply: async payload => { replies.push(payload); }
  };
  const complete = require("../src/commands/complete");
  const uncomplete = require("../src/commands/uncomplete");
  await complete.execute(interaction);
  assert.match(replies.at(-1).content, /Marked 2 of 2 matching Red raids complete/);
  assert.equal(replies.at(-1).ephemeral, true);
  assert.doesNotMatch(summary.content, /\*\*Red — Serca & Cathedral:/);
  const editCount = summary.edits.length;
  await complete.execute(interaction);
  assert.match(replies.at(-1).content, /already complete/);
  assert.equal(summary.edits.length, editCount);
  await uncomplete.execute(interaction);
  assert.match(replies.at(-1).content, /Marked 2 of 2 matching Red raids TODO/);
  assert.doesNotMatch(summary.content, /~~/);
});

test("creating a plan requires a valid weekday before publishing anything", async () => {
  const fake = discord();
  for (const day of [undefined, "", "Tomorrow", "Funday"]) {
    await assert.rejects(create(fake, { day }), /choose a day of the week/);
  }
  assert.equal(fake.sent.length, 0);
});

test("confirmed plans group by weekday within each reset, keeping legacy entries visible", () => {
  const week = "2026-07-22";
  const base = { week, status: "confirmed", label: "Red — Serca", color: "Red", members: [ids.alice] };
  const plans = {
    friday1: { ...base, day: "Friday", description: "Friday first" },
    monday: { ...base, day: "Monday", description: "Monday run" },
    wednesday: { ...base, day: "Wednesday", description: "Wednesday run" },
    friday2: { ...base, day: "Friday", description: "Friday second" },
    legacy: { ...base, description: "Saved before weekdays were required" },
    upcoming: { ...base, week: "2026-07-29", day: "Friday", description: "Upcoming Friday" }
  };
  const text = service.summaryPages({ plans }, week, [], week, new Date(`${week}T12:00:00Z`)).join("\n");
  const [current, next] = text.split("**Confirmed Times — week of 2026-07-29**");
  assert.ok(current.indexOf("**Wednesday:**") < current.indexOf("**Friday:**"));
  assert.ok(current.indexOf("**Friday:**") < current.indexOf("**Monday:**"));
  assert.equal(current.split("**Friday:**").length, 2, "one heading for both Friday runs");
  assert.ok(current.indexOf("Friday first") < current.indexOf("Friday second"));
  assert.ok(current.indexOf("Friday second") < current.indexOf("**Monday:**"));
  assert.match(current, /\*\*Day not set:\*\*\n\*\*Red — Serca:\*\* Saved before weekdays were required/);
  assert.doesNotMatch(current, /Upcoming Friday/);
  assert.match(next, /\*\*Friday:\*\*\n\*\*Red — Serca:\*\* Upcoming Friday/);
});

test("overflow repeats the week and day heading without orphaning either heading", () => {
  const week = "2026-07-22";
  const plans = Object.fromEntries([0, 1, 2].map(index => [index, {
    week, day: "Friday", status: "confirmed", color: "Red", label: "Red — Serca",
    description: `Run-${index} ${"x".repeat(1000)}`, members: [ids.alice]
  }]));
  const pages = service.summaryPages({ plans }, week, [], week, new Date(`${week}T12:00:00Z`));
  assert.equal(pages.length, 3);
  for (const page of pages) {
    assert.ok(page.length <= 2000);
    assert.ok(page.startsWith(`**Confirmed Times — week of ${week}**\n\n**Friday:**\n`));
    assert.match(page, /Run-\d/);
  }
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
  const pages = service.summaryPages({ plans }, week, [], week, new Date(`${week}T12:00:00Z`));
  assert.ok(pages.length > 1);
  assert.ok(pages.every(page => page.length <= 2000));
  assert.ok(pages.every(page => page.includes("Confirmed Times")));
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
  const pages = service.summaryPages({ plans }, week, [], week, new Date(`${week}T12:00:00Z`));
  assert.equal(pages.length, 2);
  assert.ok(pages.every(page => page.length <= 2000));
});

test("scheduler removes expired entries at 01:00 and preserves upcoming plans", async () => {
  const fake = discord();
  writeJson("raids-prepared.json", { targetDate: "2026-07-29", raids: readRaids() });
  const current = await create(fake, { day: "Monday", description: "expiring run" });
  const next = await create(fake, { week: "2026-07-29", day: "Monday", description: "upcoming run" });
  const before = new Date("2026-07-27T22:59:59Z");
  await confirm(current, before);
  await confirm(next, before);
  const summary = fake.messages.get(state().summary.messageIds[0]);
  assert.match(summary.content, /expiring run/);
  await service.checkPlans(fake.client, new Date("2026-07-27T23:00:00Z"));
  assert.doesNotMatch(summary.content, /expiring run/);
  assert.match(summary.content, /upcoming run/);
  assert.equal(service.withPlanStatuses([{ color: "Red", name: "Serca" }], { guildId }, now)[0].status, "TODO");
});

test("mytimes includes only the member's active confirmed runs in this guild and visible weeks", () => {
  const base = { guildId, members: [ids.alice], creatorId: ids.bob, week: "2026-07-22", day: "Tuesday", status: "confirmed", color: "Red", label: "Red", raidNames: ["Serca"] };
  const variants = {
    mine: {}, next: { week: "2026-07-29" },
    otherMember: { members: [ids.bob], creatorId: ids.alice },
    otherGuild: { guildId: "other" }, pending: { status: "pending" },
    rejected: { status: "rejected" }, removed: { status: "unplanned" },
    expired: { day: "Monday" }, old: { week: "2026-07-15" },
    future: { week: "2026-08-05" }, completed: { color: "Blue", raidNames: ["Serca"] }
  };
  writeJson("raids.json", [{ name: "Serca", color: "Blue", status: "DONE" }]);
  writeJson("raid-plans.json", { plans: Object.fromEntries(Object.entries(variants).map(([name, extra]) =>
    [name, { ...base, ...extra, description: `entry-${name}!` }]
  )) });
  const original = state();
  const text = service.getMyTimes({ guildId, userId: ids.alice }, now).join("\n");
  assert.match(text, /entry-mine!/);
  assert.match(text, /entry-next!/);
  for (const name of Object.keys(variants).filter(name => !["mine", "next"].includes(name))) {
    assert.ok(!text.includes(`entry-${name}!`), name);
  }
  assert.match(text, /\*\*Tuesday:\*\*/);
  assert.match(service.getMyTimes({ guildId, userId: ids.outsider }, now).join(""), /No confirmed plans yet/);
  assert.deepEqual(state(), original);
});

test("display statuses match confirmed plans by guild, week, color and raid without changing saved raids", () => {
  const base = { guildId, week: "2026-07-22", status: "confirmed", color: "Red", raidNames: ["Serca"] };
  writeJson("raids-prepared.json", { targetDate: "2026-07-29", raids: [] });
  writeJson("raid-plans.json", { plans: {
    current: base,
    next: { ...base, week: "2026-07-29", raidNames: ["Cathedral"] },
    pending: { ...base, color: "Blue", status: "pending" },
    removed: { ...base, color: "Green", status: "unplanned" },
    rejected: { ...base, color: "Gray", status: "rejected" },
    otherGuild: { ...base, color: "Gold", guildId: "other" },
    old: { ...base, color: "Orange", week: "2026-07-15" },
    legacy: { ...base, color: "Rose", raidNames: undefined, label: "Rose \u2014 Serca & Cathedral" }
  } });
  const raids = [
    { color: " red ", name: "serca" },
    { color: "Red", name: "Cathedral" },
    { color: "Red", name: "Serca", status: "DONE" },
    ...["Blue", "Green", "Gray", "Gold", "Orange", "Rose"].map(color => ({ color, name: "Serca", status: "TODO" }))
  ];
  const original = JSON.stringify(raids);
  const statuses = (period, at = now) => service.withPlanStatuses(raids, { guildId, period }, at).map(raid => raid.status);
  assert.deepEqual(statuses("current"), ["PLANNED", "TODO", "DONE", "TODO", "TODO", "TODO", "TODO", "TODO", "PLANNED"]);
  assert.deepEqual(statuses("next").slice(0, 3), ["TODO", "PLANNED", "DONE"]);
  assert.equal(statuses("2026-07-15")[7], "PLANNED");
  // Planning resets before the raid roster does: current still refers to the old roster at 09:00 Wednesday.
  assert.equal(statuses("current", new Date("2026-07-29T07:00:00Z"))[0], "PLANNED");
  assert.equal(statuses("current", new Date("2026-07-29T08:00:00Z"))[1], "PLANNED");
  assert.equal(JSON.stringify(raids), original);
  const { buildRaidResultsEmbed } = require("../src/services/raidEmbeds");
  const embed = buildRaidResultsEmbed({ title: "Raids", results: service.withPlanStatuses(raids, { guildId }, now), getLine: raid => `${raid.color} ${raid.name}` });
  assert.deepEqual(embed.toJSON().fields.map(field => field.name), ["TODO", "PLANNED", "DONE"]);
});
