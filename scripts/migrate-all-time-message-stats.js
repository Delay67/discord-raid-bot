const { migrateAllTimeMessageStats } = require("../src/services/activityStats");

const results = migrateAllTimeMessageStats();

if (results.length === 0) {
  console.log("No guild stats found. Nothing to migrate.");
  process.exit(0);
}

for (const result of results) {
  console.log(
    `Guild ${result.guildId}: all-time messages=${result.total}, users=${result.users}`
  );
}

console.log("All-time message stats migrated from yearly buckets.");
