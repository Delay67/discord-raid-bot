const { Events, MessageType } = require("discord.js");
const { channelId, plannedTimesChannelId } = require("../config");
const { recordMessage, recordRedPanda } = require("../services/activityStats");
const { isMentionLlmEnabled } = require("../services/botSettings");
const { deleteMessage } = require("../services/cleanup");
const { askGroq, isGroqEnabled } = require("../services/groqChat");
const { answerRaidQuestion } = require("../services/raidQuestionAnswer");
const {
  releaseReservedMedia,
  reserveRandomLocalMediaFiles
} = require("../commands/redpanda");
const {
  rememberLastLocalSelection,
  rememberSentMedia
} = require("../services/redPandaStore");
const {
  getMemberMemories,
  upsertMemberMemories
} = require("../services/memberMemory");

const mentionCooldownMs = 15000;
const mentionCooldownRetryDelayMs = 5000;
const mentionCooldownMaxRetries = 3;
const conversationMessageLimit = 15;
const maxConversationLength = 6000;
const mentionCooldowns = new Map();

function isRedPandaMediaRequest(prompt) {
  return /\bred\s*panda(?:s)?\b/i.test(prompt) &&
    /\b(?:send|show|give|post|share|see|image|picture|pic|photo|gif|meme|video)\b/i.test(prompt);
}

async function replyWithLocalRedPanda(message) {
  const files = await reserveRandomLocalMediaFiles();
  const file = files[0];

  if (!file) {
    await message.reply("I couldn't find any local red panda media right now.");
    return;
  }

  rememberLastLocalSelection(
    {
      channelId: message.channelId,
      guildId: message.guildId,
      user: message.author
    },
    file
  );

  console.log(`Red panda selected from mention: ${file}`);

  try {
    await message.reply({ content: "Here you go!", files });
    rememberSentMedia(files);
    recordRedPanda(
      { guildId: message.guildId, user: message.author },
      "local"
    );
  } finally {
    releaseReservedMedia(files);
  }
}

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

function normalizeMemberName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function promptReferencesMember(prompt, member) {
  const normalizedPrompt = ` ${normalizeMemberName(prompt)} `;
  const names = [
    member.displayName,
    member.user?.globalName,
    member.user?.username
  ];

  return names.some((name) => {
    const normalizedName = normalizeMemberName(name);
    return normalizedName.length >= 3 &&
      normalizedPrompt.includes(` ${normalizedName} `);
  });
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

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForMentionCooldown(userId) {
  for (let retry = 0; retry <= mentionCooldownMaxRetries; retry += 1) {
    if (!isOnCooldown(userId)) {
      return true;
    }

    if (retry < mentionCooldownMaxRetries) {
      await wait(mentionCooldownRetryDelayMs);
    }
  }

  return false;
}

async function getConversationContext(message) {
  const recentMessages = await message.channel.messages.fetch({
    before: message.id,
    limit: conversationMessageLimit
  });
  const context = [];
  let remainingLength = maxConversationLength;

  for (const recentMessage of recentMessages.values()) {
    const content = recentMessage.content.trim();

    if (
      !content ||
      recentMessage.system ||
      (recentMessage.author.bot && recentMessage.author.id !== message.client.user.id)
    ) {
      continue;
    }

    const role = recentMessage.author.id === message.client.user.id
      ? "assistant"
      : "user";
    const labelledContent = role === "assistant"
      ? content
      : `${recentMessage.author.username}: ${content}`;

    if (labelledContent.length > remainingLength) {
      continue;
    }

    context.unshift({ role, content: labelledContent });
    remainingLength -= labelledContent.length;
  }

  return context;
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

  if (isRedPandaMediaRequest(prompt)) {
    await replyWithLocalRedPanda(message);
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

  if (!(await waitForMentionCooldown(message.author.id))) {
    await message.reply("Give me a few seconds before asking again.");
    return true;
  }

  try {
    const context = await getConversationContext(message);
    const guildId = message.guildId || "direct-messages";
    const memories = getMemberMemories(guildId, message.author.id);
    const referencedMembers = new Map();

    for (const user of message.mentions.users.values()) {
      const member = message.guild?.members.cache.get(user.id);
      referencedMembers.set(user.id, {
        id: user.id,
        label: member?.displayName || user.globalName || user.username,
        source: "explicit-mention"
      });
    }

    for (const member of message.guild?.members.cache.values() || []) {
      if (promptReferencesMember(prompt, member)) {
        referencedMembers.set(member.id, {
          id: member.id,
          label: member.displayName || member.user.globalName || member.user.username,
          source: "guild-member-cache"
        });
      }
    }

    // Guild member caching requires a privileged intent, but the client user
    // cache still contains users encountered in messages and interactions.
    for (const user of message.client.users.cache.values()) {
      if (promptReferencesMember(prompt, { user })) {
        referencedMembers.set(user.id, {
          id: user.id,
          label: user.globalName || user.username,
          source: "client-user-cache"
        });
      }
    }

    const externalReferencedMembers = [...referencedMembers.values()]
      .filter(({ id }) =>
        id !== message.client.user.id && id !== message.author.id
      );
    const referencedMemberMemories = externalReferencedMembers
      .map(({ id, label, source }) => ({
        id,
        label,
        source,
        memories: getMemberMemories(guildId, id)
      }))
      .filter(({ memories: mentionedMemories }) => mentionedMemories.length > 0);
    const latestMemberMemories = externalReferencedMembers.length > 0
      ? []
      : memories;
    console.log("[member-memory lookup]", JSON.stringify({
      guildId,
      prompt,
      author: {
        id: message.author.id,
        username: message.author.username,
        loadedMemories: memories
      },
      cacheSizes: {
        guildMembers: message.guild?.members.cache.size || 0,
        clientUsers: message.client.users.cache.size
      },
      matchedMembers: [...referencedMembers.values()],
      externalReferencedMembers,
      loadedReferencedMemories: referencedMemberMemories,
      sentLatestMemberMemories: latestMemberMemories,
      decision: externalReferencedMembers.length > 0
        ? "use referenced members; suppress author memory"
        : "no other member resolved; use author memory"
    }, null, 2));
    const result = await askGroq(
      prompt,
      message.author.username,
      context,
      latestMemberMemories,
      referencedMemberMemories
    );
    upsertMemberMemories(
      guildId,
      message.author.id,
      result.memoryUpdates
    );
    await message.reply(result.answer);
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
  promptReferencesMember,
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
