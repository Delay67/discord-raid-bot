const assert = require("node:assert/strict");
const test = require("node:test");
const {
  clampTimeoutSeconds,
  promptReferencesMember
} = require("../src/events/messageCreate");

const kolax = {
  displayName: "Kolax the Great",
  user: { globalName: "Kolax", username: "kolax_loa" }
};

test("recognizes a member by plain-text global name", () => {
  assert.equal(promptReferencesMember("what class does kolax main", kolax), true);
});

test("recognizes a plain Discord user when no guild member is cached", () => {
  const userOnly = { user: { globalName: "Kolax", username: "kolax_loa" } };
  assert.equal(promptReferencesMember("what class does kolax main", userOnly), true);
});

test("recognizes a member by server display name or username", () => {
  assert.equal(promptReferencesMember("ask kolax the great about it", kolax), true);
  assert.equal(promptReferencesMember("what does kolax_loa play?", kolax), true);
});

test("does not match a member name embedded inside another word", () => {
  const member = { displayName: "Art", user: { username: "art_player" } };
  assert.equal(promptReferencesMember("is the artist class fun?", member), false);
});

test("hard-caps LLM timeout durations at one minute", () => {
  assert.equal(clampTimeoutSeconds(300), 60);
  assert.equal(clampTimeoutSeconds(30), 30);
  assert.equal(clampTimeoutSeconds("invalid"), 60);
});
