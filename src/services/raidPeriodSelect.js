const {
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require("discord.js");
const crypto = require("node:crypto");
const { getAvailablePeriods, readRaidsForPeriod } = require("./raidPeriodStore");

const selections = new Map();
const selectionLifetimeMs = 60 * 60 * 1000;

function cleanupSelections() {
  const now = Date.now();
  for (const [id, selection] of selections) {
    if (selection.expiresAt <= now) {
      selections.delete(id);
    }
  }
}

function createPeriodSelector(render, selectedPeriod = "current", existingId = null) {
  cleanupSelections();
  const id = existingId || crypto.randomUUID();
  selections.set(id, {
    expiresAt: Date.now() + selectionLifetimeMs,
    render
  });

  const options = getAvailablePeriods().map((period) => ({
    ...period,
    default: period.value === selectedPeriod
  }));
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`raid-period:${id}`)
      .setPlaceholder("Choose a raid week")
      .addOptions(options)
  );
}

async function handlePeriodSelection(interaction) {
  cleanupSelections();
  const id = interaction.customId.slice("raid-period:".length);
  const selection = selections.get(id);
  if (!selection) {
    await interaction.reply({
      content: "That week selector expired. Run the command again.",
      ephemeral: true
    });
    return;
  }

  const period = interaction.values[0];
  const raids = readRaidsForPeriod(period);
  if (!raids) {
    await interaction.reply({
      content: "That raid week is no longer available.",
      ephemeral: true
    });
    return;
  }

  await interaction.deferUpdate();
  const payload = selection.render(raids, period);
  payload.components = [createPeriodSelector(selection.render, period, id)];
  await interaction.editReply(payload);
}

module.exports = {
  createPeriodSelector,
  handlePeriodSelection
};
