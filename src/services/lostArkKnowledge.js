const fs = require("node:fs");
const path = require("node:path");

const knowledgeDirectory = path.join(__dirname, "..", "..", "knowledge", "lost-ark");
const maxEntries = 5;
const maxContextLength = 7000;
const stopWords = new Set([
  "about", "after", "again", "also", "been", "does", "from", "have", "into",
  "just", "like", "lost", "more", "some", "that", "the", "their", "this",
  "what", "when", "where", "which", "with", "would", "your"
]);

let cachedEntries = null;

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(value) {
  return new Set(
    normalize(value)
      .split(/\s+/)
      .filter((token) => token.length > 2 && !stopWords.has(token))
  );
}

function loadKnowledge() {
  if (cachedEntries) return cachedEntries;

  cachedEntries = fs.readdirSync(knowledgeDirectory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .flatMap((file) => {
      const filePath = path.join(knowledgeDirectory, file);
      const entries = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!Array.isArray(entries)) throw new Error(`${filePath} must contain an array.`);
      return entries;
    });

  return cachedEntries;
}

function scoreEntry(entry, normalizedQuery, queryTokens) {
  const topic = normalize(entry.topic);
  const keywords = (entry.keywords || []).map(normalize);
  const entryTokens = tokenize(`${entry.topic} ${keywords.join(" ")} ${entry.content}`);
  let score = 0;

  if (normalizedQuery.includes(topic) || topic.includes(normalizedQuery)) score += 12;
  for (const keyword of keywords) {
    if (normalizedQuery.includes(keyword)) score += keyword.includes(" ") ? 8 : 5;
  }
  for (const token of queryTokens) {
    if (entryTokens.has(token)) score += 1;
  }

  return score;
}

function findRelevantKnowledge(query) {
  const normalizedQuery = normalize(query);
  const queryTokens = tokenize(query);
  const ranked = loadKnowledge()
    .map((entry) => ({ entry, score: scoreEntry(entry, normalizedQuery, queryTokens) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxEntries);

  if (ranked.length === 0) {
    return "No matching verified local Lost Ark reference was found for this question.";
  }

  return ranked
    .map(({ entry }) => [
      `[${entry.status.toUpperCase()} | updated ${entry.updatedAt}] ${entry.topic}`,
      entry.content,
      `Source: ${entry.source}`
    ].join("\n"))
    .join("\n\n")
    .slice(0, maxContextLength);
}

function clearKnowledgeCache() {
  cachedEntries = null;
}

module.exports = {
  clearKnowledgeCache,
  findRelevantKnowledge,
  loadKnowledge
};
