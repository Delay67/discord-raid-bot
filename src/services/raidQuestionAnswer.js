const { sortRaidResults } = require("./raidFormatter");
const { lookupRaids, normalizePlayerName, readRaids } = require("./raidStore");

function getKnownPlayers() {
  const players = new Map();

  for (const raid of readRaids()) {
    for (const member of raid.members) {
      if (!players.has(member.lookupName)) {
        players.set(member.lookupName, member.name);
      }
    }
  }

  return players;
}

function findExplicitPlayerName(prompt) {
  const match = prompt.match(/\b(?:for|does|is)\s+([a-z0-9_-]+)/i);
  return match?.[1] || null;
}

function getAuthorNameCandidates(message) {
  return [
    message.member?.displayName,
    message.author.globalName,
    message.author.username
  ].filter(Boolean);
}

function resolvePlayerName(prompt, message) {
  const knownPlayers = getKnownPlayers();
  const explicitName = findExplicitPlayerName(prompt);
  const candidates = explicitName ? [explicitName] : getAuthorNameCandidates(message);

  for (const candidate of candidates) {
    const normalized = normalizePlayerName(candidate);

    if (knownPlayers.has(normalized)) {
      return knownPlayers.get(normalized);
    }
  }

  for (const candidate of candidates) {
    const normalized = normalizePlayerName(candidate);
    const fuzzyMatches = [...knownPlayers.entries()].filter(
      ([lookupName]) => lookupName.includes(normalized) || normalized.includes(lookupName)
    );

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0][1];
    }
  }

  return null;
}

function isRemainingRaidQuestion(prompt) {
  const normalized = prompt.toLowerCase();

  return (
    /\braids?\b/.test(normalized) &&
    (
      /\bleft\b/.test(normalized) ||
      /\bremaining\b/.test(normalized) ||
      /\btodo\b/.test(normalized) ||
      /\bnot done\b/.test(normalized)
    )
  );
}

function groupTodoLookupResults(results) {
  const grouped = new Map();

  for (const { raid, roleCounts } of results) {
    if ((raid.status || "TODO") === "DONE") {
      continue;
    }

    const key = `${raid.color.toLowerCase()}|${raid.name.toLowerCase()}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        color: raid.color,
        name: raid.name,
        roleCounts: {},
        status: "TODO"
      });
    }

    const group = grouped.get(key);

    for (const [role, count] of Object.entries(roleCounts)) {
      group.roleCounts[role] = (group.roleCounts[role] || 0) + count;
    }
  }

  return [...grouped.values()];
}

function formatTodoRaid(result) {
  const roleText = Object.entries(result.roleCounts)
    .map(([role, count]) => `x${count} ${role}`)
    .join(", ");

  return `${result.color} ${result.name} ${roleText}`;
}

function formatTodoRaids(playerName, results) {
  const groupedResults = sortRaidResults(groupTodoLookupResults(results));

  if (groupedResults.length === 0) {
    return `${playerName} has no TODO raids left.`;
  }

  return [
    `${playerName} still has:`,
    ...groupedResults.map(formatTodoRaid)
  ].join("\n");
}

function answerRaidQuestion(prompt, message) {
  if (!isRemainingRaidQuestion(prompt)) {
    return null;
  }

  const playerName = resolvePlayerName(prompt, message);

  if (!playerName) {
    return "I can answer that, but I could not match your Discord name to a raid name. Try `@me what raids does Ghonty have left`.";
  }

  const results = lookupRaids(playerName);

  if (results.length === 0) {
    return `No raids found for ${playerName}.`;
  }

  return formatTodoRaids(playerName, results);
}

module.exports = {
  answerRaidQuestion
};
