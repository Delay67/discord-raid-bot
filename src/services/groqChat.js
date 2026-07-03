const { groq } = require("../config");
const { findRelevantKnowledge } = require("./lostArkKnowledge");

const maxPromptLength = 800;
const maxResponseLength = 1800;
const requestTimeoutMs = 15000;

function isGroqEnabled() {
  return Boolean(groq.apiKey);
}

function trimForDiscord(value) {
  if (value.length <= maxResponseLength) {
    return value;
  }

  return `${value.slice(0, maxResponseLength - 3)}...`;
}

async function askGroq(prompt, userLabel) {
  const cleanedPrompt = prompt.trim().slice(0, maxPromptLength);
  const lostArkReference = findRelevantKnowledge(cleanedPrompt);
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
        messages: [
          {
            role: "system",
            content: [
              "You are a concise, playful Discord bot for a Lost Ark raid server.",
              "Use the supplied verified Western Lost Ark reference for factual claims; if it does not contain the answer, say you are not sure.",
              "Answer casually in 1-4 short sentences.",
              "Do not mention that you are an AI model.",
              "Do not provide harmful instructions or private information."
            ].join(" ")
          },
          {
            role: "system",
            content: `VERIFIED LOST ARK REFERENCE:\n${lostArkReference}`
          },
          {
            role: "user",
            content: `${userLabel}: ${cleanedPrompt}`
          }
        ],
        max_completion_tokens: 350,
        temperature: 0.8
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

    return trimForDiscord(content);
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  askGroq,
  isGroqEnabled
};
