const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("regular red panda media pool excludes junior.jpg", async () => {
  const mediaDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "redpandas-"));
  fs.writeFileSync(path.join(mediaDirectory, "junior.jpg"), "junior");

  process.env.REDPANDA_MEDIA_DIR = mediaDirectory;

  const configPath = require.resolve("../src/config");
  const commandPath = require.resolve("../src/commands/redpanda");
  delete require.cache[configPath];
  delete require.cache[commandPath];

  const { reserveRandomLocalMediaFiles } = require("../src/commands/redpanda");

  try {
    assert.deepEqual(await reserveRandomLocalMediaFiles(), []);
  } finally {
    delete require.cache[configPath];
    delete require.cache[commandPath];
    delete process.env.REDPANDA_MEDIA_DIR;
    fs.rmSync(mediaDirectory, { force: true, recursive: true });
  }
});
