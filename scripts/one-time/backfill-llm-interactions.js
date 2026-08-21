const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");
const { token, validateEnvironment } = require("../../src/config");
const {
  getPeriodKey,
  replaceLlmInteractionStats
} = require("../../src/services/activityStats");

const periods = ["day", "week", "month", "year", "all"];
const defaultGuildId = "977982426989101077";

function parseArgs(argv) {
  const args = { channelId: null, dryRun: false, guildId: defaultGuildId };

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") {
      args.dryRun = true;
    } else if (argv[index] === "--channel") {
      args.channelId = argv[++index];
    } else if (argv[index] === "--guild") {
      args.guildId = argv[++index];
    }
  }

  return args;
}

function createStats() {
  return Object.fromEntries(periods.map((period) => [period, {}]));
}

function recordMessage(stats, message) {
  for (const period of periods) {
    const key = getPeriodKey(period, message.createdAt);
    stats[period][key] ||= { total: 0, users: {} };
    const bucket = stats[period][key];
    const userId = message.author.id;

    bucket.total += 1;
    bucket.users[userId] ||= {
      count: 0,
      label: message.author.tag || message.author.username || userId
    };
    bucket.users[userId].count += 1;
    bucket.users[userId].label = message.author.tag || message.author.username || userId;
  }
}

function canReadHistory(channel, member) {
  return channel.permissionsFor(member)?.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory
  ]);
}

async function isLlmInteraction(message, botUserId) {
  if (message.mentions.users.has(botUserId)) return true;
  if (!message.reference?.messageId) return false;

  try {
    const referencedMessage = await message.fetchReference();
    return referencedMessage.author.id === botUserId;
  } catch {
    // Discord cannot identify the author of a deleted or inaccessible referenced message.
    return false;
  }
}

async function scanChannel(channel, botUserId, stats) {
  let before;
  let counted = 0;
  let scanned = 0;

  console.log(`Scanning #${channel.name} (${channel.id})`);
  while (true) {
    const messages = await channel.messages.fetch({ before, limit: 100 });
    if (messages.size === 0) break;

    for (const message of messages.values()) {
      scanned += 1;
      if (
        !message.system &&
        !message.author.bot &&
        await isLlmInteraction(message, botUserId)
      ) {
        counted += 1;
        recordMessage(stats, message);
      }
    }

    before = messages.last().id;
    if (scanned % 1000 === 0) console.log(`  scanned ${scanned}, counted ${counted}`);
  }

  console.log(`Finished #${channel.name}: scanned ${scanned}, counted ${counted}`);
  return counted;
}

async function main() {
  validateEnvironment();
  const args = parseArgs(process.argv.slice(2));
  if (args.channelId && !args.dryRun) {
    throw new Error("--channel is limited to --dry-run so a partial scan cannot replace guild-wide stats.");
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });
  const stats = createStats();

  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const guild = await client.guilds.fetch(args.guildId);
  const member = await guild.members.fetchMe();
  const guildChannels = await guild.channels.fetch();
  const channels = [...guildChannels.values()]
    .filter((channel) => channel &&
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
      (!args.channelId || channel.id === args.channelId) &&
      canReadHistory(channel, member))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (channels.length === 0) {
    await client.destroy();
    throw new Error("No readable text channels matched the requested scope.");
  }

  console.log(`Backfilling ${channels.length} channel(s) in guild ${args.guildId}.`);
  let total = 0;
  for (const channel of channels) total += await scanChannel(channel, client.user.id, stats);

  console.log(`Found ${total} historical LLM interactions.`);
  if (args.dryRun) {
    console.log("Dry run complete. activity-stats.json was not changed.");
  } else {
    replaceLlmInteractionStats(args.guildId, stats);
    console.log("Backfill complete. Replaced only LLM interaction stats.");
  }

  await client.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
