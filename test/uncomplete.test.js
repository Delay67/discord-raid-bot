const assert = require("node:assert/strict");
const test = require("node:test");
const uncompleteCommand = require("../src/commands/uncomplete");

test("/uncomplete mirrors the /complete color and raid options", () => {
  const command = uncompleteCommand.data.toJSON();

  assert.equal(command.name, "uncomplete");
  assert.equal(command.options[0].name, "color");
  assert.equal(command.options[0].required, true);
  assert.equal(command.options[0].autocomplete, true);
  assert.equal(command.options[1].name, "raid");
  assert.deepEqual(
    command.options[1].choices.map(({ value }) => value),
    ["Serca", "Cathedral"]
  );
});
