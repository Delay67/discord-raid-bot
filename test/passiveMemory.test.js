const assert = require("node:assert/strict");
const test = require("node:test");
const { buildCuratorMessages, parsePassiveMemoryUpdates } = require("../src/services/passiveMemory");

test("parses passive curator mutations and rejects non-JSON output", () => {
  assert.deepEqual(parsePassiveMemoryUpdates('[{"operation":"set","key":"main_class","value":"Bard"}]'), [{ operation: "set", key: "main_class", value: "Bard" }]);
  assert.deepEqual(parsePassiveMemoryUpdates("not json"), []);
});

test("curator reconciles ordinary messages with existing notes conservatively", () => {
  const messages = buildCuratorMessages(["I switched my main from Bard to Artist."], [{ key: "main_class", value: "Bard" }]);
  assert.match(messages[0].content, /capture durable/i);
  assert.match(messages[0].content, /Delete only when.*clearly/i);
  assert.match(messages[1].content, /main_class=Bard/);
  assert.match(messages[1].content, /switched my main/);
});
