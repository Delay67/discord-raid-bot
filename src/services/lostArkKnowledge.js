const { entries, knowledgeUpdatedAt } = require("../data/lostArkKnowledge");

const defaultMaxCharacters = 6500;
const stopWords = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "for",
  "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "so",
  "that", "the", "their", "this", "to", "was", "what", "when", "which", "who",
  "why", "with", "you", "your"
]);

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFor(value) {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !stopWords.has(token))
  );
}

function scoreEntry(entry, query, queryTokens) {
  const title = normalize(entry.title);
  let score = 0;

  for (const keywordValue of entry.keywords) {
    const keyword = normalize(keywordValue);
    const keywordTokens = keyword.split(" ");

    if (query.includes(keyword)) score += keywordTokens.length > 1 ? 12 : 6;
    for (const token of keywordTokens) {
      if (queryTokens.has(token)) score += 2;
    }
  }

  for (const token of queryTokens) {
    if (title.includes(token)) score += 3;
  }

  return score;
}

function formatEntry(entry) {
  return `### ${entry.title}\n${entry.text}`;
}

function getLostArkKnowledge(prompt, contextMessages = [], maxCharacters = defaultMaxCharacters) {
  const query = normalize([
    ...contextMessages.slice(-4).map((message) => message.content),
    prompt
  ].join(" "));
  const queryTokens = tokensFor(query);
  const selected = entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry, query, queryTokens) }))
    .filter(({ entry, score }) => entry.alwaysInclude || score > 0)
    .sort((left, right) => {
      if (left.entry.alwaysInclude !== right.entry.alwaysInclude) {
        return left.entry.alwaysInclude ? -1 : 1;
      }
      return right.score - left.score || left.index - right.index;
    });

  const sections = [];
  let length = 0;

  for (const { entry } of selected) {
    const section = formatEntry(entry);
    if (sections.length > 0 && length + section.length + 2 > maxCharacters) continue;
    sections.push(section);
    length += section.length + 2;
  }

  return sections.join("\n\n");
}

module.exports = {
  getLostArkKnowledge,
  knowledgeUpdatedAt
};
