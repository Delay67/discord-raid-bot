const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.join(__dirname, "..", "..", "data");
const lastSelectionPath = path.join(dataDirectory, "redpanda-last.json");

function ensureDataDirectory() {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory, { recursive: true });
  }
}

function readLastSelection() {
  if (!fs.existsSync(lastSelectionPath)) {
    return null;
  }

  const contents = fs.readFileSync(lastSelectionPath, "utf8");
  return JSON.parse(contents);
}

function writeLastSelection(selection) {
  ensureDataDirectory();
  fs.writeFileSync(lastSelectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
}

function rememberLastLocalSelection(interaction, file) {
  writeLastSelection({
    channelId: interaction.channelId,
    file,
    guildId: interaction.guildId,
    selectedAt: new Date().toISOString(),
    userId: interaction.user.id,
    userTag: interaction.user.tag
  });
}

function clearLastSelection() {
  if (fs.existsSync(lastSelectionPath)) {
    fs.unlinkSync(lastSelectionPath);
  }
}

function deleteLastLocalSelection() {
  const selection = readLastSelection();

  if (!selection?.file) {
    return {
      ok: false,
      reason: "No local red panda selection has been recorded yet."
    };
  }

  if (!fs.existsSync(selection.file)) {
    clearLastSelection();
    return {
      ok: false,
      reason: `The last selected file no longer exists: ${selection.file}`
    };
  }

  fs.unlinkSync(selection.file);
  clearLastSelection();

  return {
    file: selection.file,
    ok: true
  };
}

module.exports = {
  deleteLastLocalSelection,
  rememberLastLocalSelection
};
