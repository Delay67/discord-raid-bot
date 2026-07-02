const { Events, MessageType } = require("discord.js");
const { channelId, plannedTimesChannelId } = require("../config");
const { recordMessage } = require("../services/activityStats");
const { isMentionLlmEnabled } = require("../services/botSettings");
const { deleteMessage } = require("../services/cleanup");
const {
  askGroq,
  GroqTokenLimitError,
  isGroqEnabled
} = require("../services/groqChat");
const { answerRaidQuestion } = require("../services/raidQuestionAnswer");

const contextMessageLimit = 10;
const maxContextLength = 4000;

function getMentionPrompt(message) {
  const botUser = message.client.user;

  if (!botUser || !message.mentions.users.has(botUser.id)) {
    return null;
  }

  return message.content
    .replaceAll(`<@${botUser.id}>`, "")
    .replaceAll(`<@!${botUser.id}>`, "")
    .trim();
}

function formatContextMessage(contextMessage, botUserId) {
  const content = contextMessage.content.trim();

  if (!content || contextMessage.system || (contextMessage.author.bot && contextMessage.author.id !== botUserId)) {
    return null;
  }

  return {
    content:
      contextMessage.author.id === botUserId
        ? content
        : `${contextMessage.author.username}: ${content}`,
    id: contextMessage.id,
    role: contextMessage.author.id === botUserId ? "assistant" : "user"
  };
}

async function getConversationContext(message) {
  const recentMessages = await message.channel.messages.fetch({
    before: message.id,
    limit: contextMessageLimit
  });
  const contextById = new Map();

  for (const contextMessage of [...recentMessages.values()].reverse()) {
    const formatted = formatContextMessage(contextMessage, message.client.user.id);
    if (formatted) contextById.set(formatted.id, formatted);
  }

  let referencedMessageId = null;
  if (message.reference?.messageId) {
    try {
      const referencedMessage = await message.fetchReference();
      const formatted = formatContextMessage(referencedMessage, message.client.user.id);
      if (formatted) {
        referencedMessageId = formatted.id;
        contextById.set(formatted.id, formatted);
      }
    } catch (error) {
      console.warn(`Could not fetch referenced message for Groq context: ${error.message}`);
    }
  }

  const context = [...contextById.values()].sort((left, right) =>
    left.id.localeCompare(right.id)
  );
  let totalLength = context.reduce((total, item) => total + item.content.length, 0);

  while (totalLength > maxContextLength && context.length > 1) {
    const removableIndex = context.findIndex((item) => item.id !== referencedMessageId);
    if (removableIndex === -1) break;
    totalLength -= context[removableIndex].content.length;
    context.splice(removableIndex, 1);
  }

  if (context.length === 1 && context[0].content.length > maxContextLength) {
    context[0].content = context[0].content.slice(-maxContextLength);
  }

  return context.map(({ role, content }) => ({ role, content }));
}

async function handleBotMention(message) {
  const prompt = getMentionPrompt(message);

  if (prompt === null) {
    return false;
  }

  if (!isMentionLlmEnabled()) {
    return true;
  }

  if (!prompt) {
    await message.reply("Mention me with something to answer.");
    return true;
  }

  const raidAnswer = answerRaidQuestion(prompt, message);

  if (raidAnswer) {
    await message.reply(raidAnswer);
    return true;
  }

  if (!isGroqEnabled()) {
    await message.reply("Groq is not configured yet.");
    return true;
  }

  await message.channel.sendTyping();

  try {
    const context = await getConversationContext(message);
    const answer = await askGroq(
      prompt,
      message.author.username,
      context,
      message.guildId || "direct-messages"
    );
    await message.reply(answer);
  } catch (error) {
    console.error(error);

    if (error instanceof GroqTokenLimitError) {
      const seconds = Math.ceil(error.retryAfterMs / 1000);
      await message.reply(`My server-wide token budget is busy. Try again in about ${seconds} seconds.`);
      return true;
    }

    if (error.status === 429) {
      await message.reply("Sorry, im too sleepy right now ask me again after my nap.");
      return true;
    }

    await message.reply("Im sorry, my brain is disconnected right now, try again later.");
  }

  return true;
}

module.exports = {
  name: Events.MessageCreate,
  async execute(message) {
    if (
      message.channelId === plannedTimesChannelId &&
      message.type === MessageType.ChannelPinnedMessage
    ) {
      await deleteMessage(message);
      return;
    }

    if (!message.system && !message.author.bot && message.guildId) {
      recordMessage(message);
    }

    if (!message.system && !message.author.bot) {
      await handleBotMention(message);
    }

    if (message.channelId !== channelId || message.system || message.pinned) {
      return;
    }

    if (!message.author.bot) {
      await deleteMessage(message);
    }
  }
};
