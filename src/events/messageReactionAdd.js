const { Events } = require("discord.js");
const { recordFavoritePandaReaction } = require("../services/redPandaStore");
const { handlePlanReaction } = require("../services/raidPlans");

function isFrogblushReaction(reaction) {
  return reaction?.emoji?.name === "frogblush";
}

async function fetchPartial(partial) {
  if (!partial?.partial) {
    return partial;
  }

  try {
    return await partial.fetch();
  } catch (error) {
    console.warn(`Could not fetch partial reaction data: ${error.message}`);
    return partial;
  }
}

module.exports = {
  name: Events.MessageReactionAdd,
  async execute(reaction, user) {
    const fullReaction = await fetchPartial(reaction);
    const fullUser = await fetchPartial(user);
    try {
      await handlePlanReaction(fullReaction, fullUser);
    } catch (error) {
      console.error("Plan reaction failed:", error);
    }

    if (!isFrogblushReaction(fullReaction)) {
      return;
    }

    recordFavoritePandaReaction(fullReaction, fullUser);
  }
};

module.exports.isFrogblushReaction = isFrogblushReaction;
