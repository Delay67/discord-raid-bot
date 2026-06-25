const { Events, MessageType } = require("discord.js");
const { channelId, plannedTimesChannelId } = require("../config");
const { recordMessage } = require("../services/activityStats");
const { isMentionLlmEnabled } = require("../services/botSettings");
const { deleteMessage } = require("../services/cleanup");
const { askGroq, isGroqEnabled } = require("../services/groqChat");
const { answerRaidQuestion } = require("../services/raidQuestionAnswer");

const mentionCooldownMs = 15000;
const mentionCooldowns = new Map();

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

function isOnCooldown(userId) {
  const now = Date.now();
  const availableAt = mentionCooldowns.get(userId) || 0;

  if (now < availableAt) {
    return true;
  }

  mentionCooldowns.set(userId, now + mentionCooldownMs);
  return false;
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

  if (isOnCooldown(message.author.id)) {
    await message.reply("Give me a few seconds before asking again.");
    return true;
  }

  await message.channel.sendTyping();

  try {
    const answer = await askGroq(prompt, message.author.username);
    await message.reply(answer);
  } catch (error) {
    console.error(error);

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
