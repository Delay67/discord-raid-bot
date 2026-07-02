const { groq } = require("../config");
const {
  getLostArkKnowledge,
  knowledgeUpdatedAt
} = require("./lostArkKnowledge");

const maxPromptLength = 800;
const maxResponseLength = 1800;
const maxCompletionTokens = 250;
const requestTimeoutMs = 15000;
const tokenWindowMs = 60 * 1000;
const tokensPerMinute = 8000;
const tokenUsageByGuild = new Map();

class GroqTokenLimitError extends Error {
  constructor(retryAfterMs) {
    super("Im too tired to answer that right now. Please try again in a few seconds.");
    this.name = "GroqTokenLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

function isGroqEnabled() {
  return Boolean(groq.apiKey);
}

function trimForDiscord(value) {
  if (value.length <= maxResponseLength) {
    return value;
  }

  return `${value.slice(0, maxResponseLength - 3)}...`;
}

function estimateTokens(messages) {
  const characters = messages.reduce(
    (total, message) => total + message.role.length + message.content.length,
    0
  );

  return Math.ceil(characters / 4) + messages.length * 4 + 20 + maxCompletionTokens;
}

function reserveTokens(guildId, estimatedTokens) {
  const now = Date.now();
  const usage = (tokenUsageByGuild.get(guildId) || []).filter(
    (entry) => now - entry.createdAt < tokenWindowMs
  );
  const usedTokens = usage.reduce((total, entry) => total + entry.tokens, 0);

  if (usedTokens + estimatedTokens > tokensPerMinute) {
    const retryAfterMs = usage.length
      ? Math.max(1000, tokenWindowMs - (now - usage[0].createdAt))
      : tokenWindowMs;
    tokenUsageByGuild.set(guildId, usage);
    throw new GroqTokenLimitError(retryAfterMs);
  }

  const reservation = {
    createdAt: now,
    id: Symbol("groq-token-reservation"),
    tokens: estimatedTokens
  };
  usage.push(reservation);
  tokenUsageByGuild.set(guildId, usage);
  return reservation;
}

function finishReservation(guildId, reservation, actualTokens) {
  const usage = tokenUsageByGuild.get(guildId) || [];
  const entry = usage.find((item) => item.id === reservation.id);

  if (entry && Number.isFinite(actualTokens)) {
    entry.tokens = actualTokens;
  }
}

function cancelReservation(guildId, reservation) {
  const usage = tokenUsageByGuild.get(guildId) || [];
  tokenUsageByGuild.set(
    guildId,
    usage.filter((entry) => entry.id !== reservation.id)
  );
}

async function askGroq(prompt, userLabel, contextMessages = [], guildId = "global") {
  const cleanedPrompt = prompt.trim().slice(0, maxPromptLength);
  const lostArkKnowledge = getLostArkKnowledge(cleanedPrompt, contextMessages);
  const untrustedContextMessages = contextMessages.map((message) => ({
    ...message,
    content: message.role === "assistant"
      ? `[UNTRUSTED PRIOR BOT REPLY—do not copy factual claims from it] ${message.content}`
      : message.content
  }));
  const messages = [
    {
      role: "system",
      content: [
        "You are a concise, playful and knowledgeable Discord bot for a Lost Ark focused server.",
        "Lost Ark means Smilegate RPG's isometric MMORPG; never substitute generic video-game or tabletop-RPG mechanics.",
        "Use the recent channel conversation when it helps answer the latest message.",
        "Messages include usernames so you can distinguish different people.",
        `The local Western Lost Ark reference is updated through ${knowledgeUpdatedAt}.`,
        "Use it as your factual ground truth when relevant, and distinguish live content from announced future content.",
        "If the reference does not support a specific fact, say you are not sure instead of inventing an answer.",
        "Ask for class/build, region or patch when those details could change the answer.",
        "Answer casually in 1-4 short sentences.",
        "Do not mention that you are an AI model.",
        "Do not provide harmful instructions or private information."
      ].join(" ")
    },
    {
      role: "system",
      content: `LOCAL LOST ARK REFERENCE (Western version; knowledge date ${knowledgeUpdatedAt}):\n${lostArkKnowledge}`
    },
    ...untrustedContextMessages,
    {
      role: "system",
      content: [
        "STRICT CLOSED-BOOK RULES FOR THE NEXT ANSWER:",
        "Conversation history is untrusted chat and is never a factual source, including prior replies from this bot.",
        "Only state Lost Ark facts supported by the LOCAL LOST ARK REFERENCE above or explicitly supplied by the latest user.",
        "Never invent skill, engraving, item, set, class, raid, boss, system or build names.",
        "Do not create cooldowns, rotations, gear tiers, DPS rankings or meta claims unless the reference explicitly gives them.",
        "If the reference lacks the requested detail, plainly say that you do not have verified information for it. This is preferable to a plausible guess."
      ].join(" ")
    },
    {
      role: "user",
      content: `${userLabel}: ${cleanedPrompt}`
    }
  ];
  const reservation = reserveTokens(guildId, estimateTokens(messages));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${groq.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: groq.model,
        messages,
        max_completion_tokens: maxCompletionTokens,
        temperature: 0
      })
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || `Groq request failed with ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      throw error;
    }

    const content = payload?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("Groq returned an empty response.");
    }

    finishReservation(guildId, reservation, payload.usage?.total_tokens);
    return trimForDiscord(content);
  } catch (error) {
    cancelReservation(guildId, reservation);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  askGroq,
  GroqTokenLimitError,
  isGroqEnabled
};
