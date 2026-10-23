function parsePlayers(input) {
  const players = input.split(",").map((name) => name.trim());
  if (!players.length || players.length > 24 || players.some((name) => !name || name.length > 60 || /[\r\n\x00-\x1f]/.test(name))) {
    throw new Error("Enter 1–24 comma-separated names, each 1–60 characters.");
  }
  return players;
}

function nextCall(players, used, perPlayer = 3) {
  if (!players.length) throw new Error("Set the rotation with /dark players first.");
  const total = players.length * perPlayer;
  if (used >= total) return { text: "No darks left", used };
  const remaining = total - used - 1;
  let text = `Dark ${players[used % players.length]}`;
  if (remaining === players.length) text += `. ${remaining} darks left`;
  if (remaining === 0) text += ". No darks left";
  return { text, used: used + 1 };
}

module.exports = { parsePlayers, nextCall };
