const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionsBitField
} = require("discord.js");
const { token, validateEnvironment } = require("../src/config");
const {
  getPeriodKey,
  replaceMessageStats
} = require("../src/services/activityStats");

const periods = ["week", "month", "year"];
const backfillGuildId = "977982426989101077";

function parseArgs(argv) {
  const args = {
    channelId: null,
    dryRun: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--channel") {
      args.channelId = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function createMessageStats() {
  return {
    month: {},
    week: {},
    year: {}
  };
}

function ensureMessageBucket(messageStats, period, key) {
  messageStats[period][key] ||= {
    total: 0,
    users: {}
  };

  return messageStats[period][key];
}

function getUserLabel(user) {
  return user.tag || user.username || user.id;
}

function recordHistoricalMessage(messageStats, message) {
  const createdAt = message.createdAt;

  for (const period of periods) {
    const key = getPeriodKey(period, createdAt);
    const bucket = ensureMessageBucket(messageStats, period, key);
    const userId = message.author.id;

    bucket.total += 1;
    bucket.users[userId] ||= {
      count: 0,
      label: getUserLabel(message.author)
    };
    bucket.users[userId].count += 1;
    bucket.users[userId].label = getUserLabel(message.author);
  }
}

function canReadHistory(channel, me) {
  const permissions = channel.permissionsFor(me);

  return permissions?.has([
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.ReadMessageHistory
  ]);
}

async function fetchReadableChannels(client, args) {
  const guilds = [await client.guilds.fetch(backfillGuildId)];
  const channels = [];

  for (const partialGuild of guilds) {
    const guild = partialGuild.available ? partialGuild : await partialGuild.fetch();
    const me = await guild.members.fetchMe();
    const guildChannels = await guild.channels.fetch();

    for (const channel of guildChannels.values()) {
      if (
        !channel ||
        ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)
      ) {
        continue;
      }

      if (args.channelId && channel.id !== args.channelId) {
        continue;
      }

      if (!canReadHistory(channel, me)) {
        console.log(`Skipping #${channel.name}: missing read history permission.`);
        continue;
      }

      channels.push(channel);
    }
  }

  return channels.sort((left, right) => left.name.localeCompare(right.name));
}

async function backfillChannel(channel, messageStats) {
  let before;
  let scanned = 0;
  let counted = 0;

  console.log(`Scanning #${channel.name} (${channel.id})`);

  while (true) {
    const messages = await channel.messages.fetch({
      before,
      limit: 100
    });

    if (messages.size === 0) {
      break;
    }

    for (const message of messages.values()) {
      scanned += 1;

      if (message.system || message.author.bot) {
        continue;
      }

      counted += 1;
      recordHistoricalMessage(messageStats, message);
    }

    before = messages.last().id;

    if (scanned % 1000 === 0) {
      console.log(`  scanned ${scanned}, counted ${counted}`);
    }
  }

  console.log(`Finished #${channel.name}: scanned ${scanned}, counted ${counted}`);

  return {
    counted,
    scanned
  };
}

function summarize(messageStats) {
  for (const period of periods) {
    const total = Object.values(messageStats[period]).reduce(
      (sum, bucket) => sum + bucket.total,
      0
    );

    console.log(`${period}: ${total} message count entries across ${Object.keys(messageStats[period]).length} period bucket(s)`);
  }
}

async function main() {
  validateEnvironment();

  const args = parseArgs(process.argv.slice(2));
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
  });
  const messageStats = createMessageStats();

  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const channels = await fetchReadableChannels(client, args);

  if (channels.length === 0) {
    console.log("No readable channels found.");
    await client.destroy();
    return;
  }

  console.log(`Backfilling ${channels.length} channel(s).`);
  console.log(`Guild: ${backfillGuildId}`);

  for (const channel of channels) {
    await backfillChannel(channel, messageStats);
  }

  summarize(messageStats);

  if (args.dryRun) {
    console.log("Dry run complete. activity-stats.json was not changed.");
  } else {
    replaceMessageStats(backfillGuildId, messageStats);
    console.log("Backfill complete. Replaced message stats in data/activity-stats.json.");
  }

  await client.destroy();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
