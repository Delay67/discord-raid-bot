const assert = require("node:assert/strict");
const test = require("node:test");
const { ComponentType } = require("discord.js");
const servicePath = require.resolve("../src/services/raidPlans");
const commandPath = require.resolve("../src/commands/plan");
const actualService = require(servicePath);

function loadCommand(createPlan) {
  require.cache[servicePath].exports = { ...actualService, createPlan };
  delete require.cache[commandPath];
  try { return require(commandPath); }
  finally { require.cache[servicePath].exports = actualService; }
}

function interaction(choice = 0, expires = false) {
  const edits = [];
  const updates = [];
  const value = {
    id: "interaction-id", user: { id: "creator" }, guildId: "guild", client: {},
    options: { getString: key => ({ color: "Red", description: "after kazeros", raid: null })[key] },
    async deferReply(payload) { assert.equal(payload.ephemeral, true); },
    async editReply(payload) {
      edits.push(payload);
      return {
        async awaitMessageComponent(options) {
          if (expires) throw Object.assign(new Error("Timed out"), { code: "InteractionCollectorError" });
          assert.equal(options.componentType, ComponentType.Button);
          const customId = payload.components[0].toJSON().components[choice].custom_id;
          const selected = { customId, user: value.user, update: async update => { updates.push(update); } };
          assert.equal(options.filter(selected), true);
          assert.equal(options.filter({ ...selected, user: { id: "someone-else" } }), false);
          assert.equal(options.filter({ ...selected, customId: "plan-week:other-interaction:2026-07-22" }), false);
          return selected;
        }
      };
    }
  };
  return { value, edits, updates };
}

test("Monday/Tuesday privately choose this or upcoming reset before publishing the plan", async () => {
  for (const day of ["2026-07-27", "2026-07-28"]) {
    for (const choice of [0, 1]) {
      const fake = interaction(choice);
      const command = loadCommand(async (client, input) => {
        assert.equal(fake.updates.length, 1, "the button must be acknowledged before publication");
        assert.equal(input.week, choice ? "2026-07-29" : "2026-07-22");
        assert.equal(input.creatorId, "creator");
        assert.equal(input.description, "after kazeros");
        return { url: "https://discord.com/plan" };
      });
      await command.execute(fake.value, new Date(`${day}T12:00:00Z`));
      assert.match(fake.edits[0].content, /Which reset/);
      assert.match(fake.edits.at(-1).content, /Pending plan posted/);
      assert.deepEqual(fake.edits.at(-1).components, []);
    }
  }
});

test("other weekdays create the current reset's pending plan without a reset prompt", async () => {
  const fake = interaction();
  const command = loadCommand(async (client, input) => {
    assert.equal(input.week, "2026-07-29");
    return { url: "https://discord.com/plan" };
  });
  await command.execute(fake.value, new Date("2026-07-29T01:00:00Z"));
  assert.equal(fake.edits.length, 1);
  assert.equal(fake.updates.length, 0);
  assert.match(fake.edits[0].content, /Pending plan posted/);
});

test("expired reset selection clears buttons and never publishes a plan", async () => {
  const fake = interaction(0, true);
  const command = loadCommand(async () => { assert.fail("must not publish before a reset is chosen"); });
  await command.execute(fake.value, new Date("2026-07-28T12:00:00Z"));
  assert.match(fake.edits.at(-1).content, /selection expired/);
  assert.deepEqual(fake.edits.at(-1).components, []);
});
