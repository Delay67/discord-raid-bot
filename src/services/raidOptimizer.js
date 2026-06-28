const { readRaids } = require("./raidStore");

const DEFAULT_ITERATIONS = 45000;
const DEFAULT_SUGGESTION_COUNT = 3;
const DEFAULT_VARIETY = 3;
const MAX_SINGLETON_CLUSTERS = 5;
const COLOR_POOL = [
  "Red",
  "Orange",
  "Amber",
  "Gold",
  "Light Yellow",
  "Lime",
  "Green",
  "Light Green",
  "Cyan",
  "Light Blue",
  "Purple",
  "Pink",
  "Magenta",
  "Brown",
  "Gray",
  "Brick Red"
];

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function canonicalMembers(members) {
  return members
    .map((member) => member.lookupName || normalizeName(member.name))
    .sort()
    .join("|");
}

function getRoleCounts(raid) {
  return raid.members.reduce(
    (counts, member) => {
      if (member.role === "Support") {
        counts.supports += 1;
      } else {
        counts.dps += 1;
      }

      return counts;
    },
    {
      dps: 0,
      supports: 0
    }
  );
}

function isLockedRaid(raid) {
  const lockedNightmareColors = new Set(["light yellow", "red", "magenta"]);

  return (
    raid.name === "Serca" &&
    raid.difficulty === "Nightmare" &&
    lockedNightmareColors.has(normalizeName(raid.originalColor || raid.color))
  );
}

function isCathedral3Eligible(member, raid) {
  if (typeof member.itemLevel === "number") {
    return member.itemLevel >= 1750;
  }

  const label = String(member.label || member.tier || "").toLowerCase();

  if (label.includes("1750")) {
    return true;
  }

  if (label && !label.includes("1750")) {
    return false;
  }

  return raid.name === "Cathedral" && raid.difficulty === "3";
}

function cloneRaid(raid) {
  return {
    ...raid,
    members: raid.members.map((member) => ({ ...member }))
  };
}

function buildState(raids) {
  return raids.map((raid, raidIndex) => ({
    ...cloneRaid(raid),
    originalIndex: raidIndex,
    originalColor: raid.color,
    originalCanonicalMembers: canonicalMembers(raid.members),
    locked: isLockedRaid(raid),
    members: raid.members.map((member) => ({
      ...member,
      eligibleForCathedral3: isCathedral3Eligible(member, raid)
    }))
  }));
}

function validateRaid(raid) {
  const counts = getRoleCounts(raid);
  const problems = [];
  const seenMembers = new Set();
  const duplicateMembers = new Set();

  if (counts.dps > 3) {
    problems.push("more than 3 DPS");
  }

  if (counts.supports > 1) {
    problems.push("more than 1 Support");
  }

  if (raid.members.length > 4) {
    problems.push("more than 4 members");
  }

  for (const member of raid.members) {
    const lookupName = member.lookupName || normalizeName(member.name);

    if (seenMembers.has(lookupName)) {
      duplicateMembers.add(member.name);
    }

    seenMembers.add(lookupName);
  }

  if (duplicateMembers.size > 0) {
    problems.push(`duplicate player(s): ${[...duplicateMembers].join(", ")}`);
  }

  if (raid.name === "Cathedral" && raid.difficulty === "3") {
    const ineligibleMembers = raid.members.filter(
      (member) => !member.eligibleForCathedral3
    );

    if (ineligibleMembers.length > 0) {
      problems.push(
        `Cathedral 3 has non-1750 member(s): ${ineligibleMembers
          .map((member) => member.name)
          .join(", ")}`
      );
    }
  }

  if (raid.name === "Cathedral" && raid.difficulty === "2") {
    const ineligibleMembers = raid.members.filter(
      (member) => member.eligibleForCathedral3
    );

    if (ineligibleMembers.length > 0) {
      problems.push(
        `Cathedral 2 has 1750 member(s): ${ineligibleMembers
          .map((member) => member.name)
          .join(", ")}`
      );
    }
  }

  return problems;
}

function scoreClusterSize(size) {
  if (size === 1) {
    return -320;
  }

  if (size === 2 || size === 5) {
    return 80;
  }

  if (size === 3) {
    return 190;
  }

  if (size === 4) {
    return 260;
  }

  return -260 * (size - 5);
}

function getClusters(raids) {
  const clusters = new Map();

  for (const raid of raids) {
    const key = raid.color;

    if (!clusters.has(key)) {
      clusters.set(key, []);
    }

    clusters.get(key).push(raid);
  }

  return [...clusters.values()].sort((left, right) => {
    if (right.length !== left.length) {
      return right.length - left.length;
    }

    return left[0].color.localeCompare(right[0].color);
  });
}

function validateCluster(cluster) {
  if (cluster.length <= 1) {
    return [];
  }

  const expectedMembers = canonicalMembers(cluster[0].members);
  const mixedRuns = cluster.filter(
    (raid) => canonicalMembers(raid.members) !== expectedMembers
  );

  if (mixedRuns.length === 0) {
    return [];
  }

  return [
    "color mixes different player groups; every run in a color must have the exact same players"
  ];
}

function scoreState(raids) {
  let score = 0;
  const clusters = getClusters(raids);
  const singletonClusterCount = clusters.filter((cluster) => cluster.length === 1).length;
  const playerCompositionCounts = raids.reduce((counts, raid) => {
    const members = canonicalMembers(raid.members);
    counts.set(members, (counts.get(members) || 0) + 1);
    return counts;
  }, new Map());
  const playerSingletonClusterCount = [...playerCompositionCounts.values()]
    .filter((count) => count === 1).length;
  const validationProblems = [];

  if (singletonClusterCount > MAX_SINGLETON_CLUSTERS) {
    score -= (singletonClusterCount - MAX_SINGLETON_CLUSTERS) * 2500;
  }

  score -= playerSingletonClusterCount * 350;
  if (playerSingletonClusterCount > MAX_SINGLETON_CLUSTERS) {
    score -= (playerSingletonClusterCount - MAX_SINGLETON_CLUSTERS) * 3000;
  }

  for (const raid of raids) {
    const counts = getRoleCounts(raid);

    if (counts.dps === 3 && counts.supports === 1) {
      score += 12;
    } else if (counts.dps === 2 && counts.supports === 1 && raid.members.length === 3) {
      score -= 8;
    } else {
      score -= 35;
    }

    const raidProblems = validateRaid(raid);

    if (raidProblems.length > 0) {
      validationProblems.push({
        raid,
        problems: raidProblems
      });
      score -= 1000 * raidProblems.length;
    }
  }

  for (const cluster of clusters) {
    const clusterProblems = validateCluster(cluster);

    if (clusterProblems.length > 0) {
      validationProblems.push({
        raid: {
          color: cluster[0].color,
          difficulty: "cluster",
          name: "Color"
        },
        problems: clusterProblems
      });
      score -= 3000 * clusterProblems.length;
      continue;
    }

    score += scoreClusterSize(cluster.length);

    if (cluster.length > 5) {
      continue;
    }

    score += cluster.length * 80;
  }

  return {
    clusters,
    playerSingletonClusterCount,
    score,
    singletonClusterCount,
    validationProblems
  };
}

function getColorPool(raids) {
  return [...new Set([
    ...raids.map((raid) => raid.color),
    ...COLOR_POOL
  ])].filter(Boolean);
}

function getAllowedColorsForRaid(raids, raidIndex, colorPool) {
  const raid = raids[raidIndex];
  const raidMembers = canonicalMembers(raid.members);

  return colorPool.filter((color) =>
    raids.every((candidateRaid, candidateIndex) => {
      if (candidateIndex === raidIndex || candidateRaid.color !== color) {
        return true;
      }

      return canonicalMembers(candidateRaid.members) === raidMembers;
    })
  );
}

function getMovableSlots(raids) {
  const slots = [];

  raids.forEach((raid, raidIndex) => {
    if (raid.locked) {
      return;
    }

    raid.members.forEach((member, memberIndex) => {
      slots.push({
        difficulty: raid.difficulty,
        memberIndex,
        raidIndex,
        raidName: raid.name,
        role: member.role
      });
    });
  });

  return slots;
}

function getRecolorSlots(raids) {
  return raids.map((raid, raidIndex) => ({
    raidIndex
  }));
}

function canSwap(leftSlot, rightSlot, raids) {
  if (leftSlot.raidIndex === rightSlot.raidIndex) {
    return false;
  }

  if (leftSlot.raidName !== rightSlot.raidName || leftSlot.role !== rightSlot.role) {
    return false;
  }

  if (
    leftSlot.raidName === "Serca" &&
    leftSlot.difficulty !== rightSlot.difficulty
  ) {
    return false;
  }

  const leftRaid = raids[leftSlot.raidIndex];
  const rightRaid = raids[rightSlot.raidIndex];
  const leftMember = leftRaid.members[leftSlot.memberIndex];
  const rightMember = rightRaid.members[rightSlot.memberIndex];

  if (
    normalizeName(leftMember.lookupName || leftMember.name) ===
    normalizeName(rightMember.lookupName || rightMember.name)
  ) {
    return false;
  }

  if (leftRaid.name === "Cathedral" && leftRaid.difficulty === "3" && !rightMember.eligibleForCathedral3) {
    return false;
  }

  if (rightRaid.name === "Cathedral" && rightRaid.difficulty === "3" && !leftMember.eligibleForCathedral3) {
    return false;
  }

  if (leftRaid.name === "Cathedral" && leftRaid.difficulty === "2" && rightMember.eligibleForCathedral3) {
    return false;
  }

  if (rightRaid.name === "Cathedral" && rightRaid.difficulty === "2" && leftMember.eligibleForCathedral3) {
    return false;
  }

  return true;
}

function swapSlots(raids, leftSlot, rightSlot) {
  const leftRaid = raids[leftSlot.raidIndex];
  const rightRaid = raids[rightSlot.raidIndex];
  const leftMember = leftRaid.members[leftSlot.memberIndex];

  leftRaid.members[leftSlot.memberIndex] = rightRaid.members[rightSlot.memberIndex];
  rightRaid.members[rightSlot.memberIndex] = leftMember;
}

function consolidateSingletonPlayerGroups(raids, slots) {
  let currentSingletonCount = scoreState(raids).playerSingletonClusterCount;

  while (currentSingletonCount > MAX_SINGLETON_CLUSTERS) {
    let bestSingletonCount = currentSingletonCount;
    const bestSwaps = [];

    for (let leftIndex = 0; leftIndex < slots.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < slots.length; rightIndex += 1) {
        const leftSlot = slots[leftIndex];
        const rightSlot = slots[rightIndex];

        if (!canSwap(leftSlot, rightSlot, raids)) {
          continue;
        }

        swapSlots(raids, leftSlot, rightSlot);
        const singletonCount = scoreState(raids).playerSingletonClusterCount;
        swapSlots(raids, leftSlot, rightSlot);

        if (singletonCount < bestSingletonCount) {
          bestSingletonCount = singletonCount;
          bestSwaps.length = 0;
          bestSwaps.push([leftSlot, rightSlot]);
        } else if (singletonCount === bestSingletonCount && singletonCount < currentSingletonCount) {
          bestSwaps.push([leftSlot, rightSlot]);
        }
      }
    }

    if (bestSwaps.length === 0) {
      break;
    }

    const [leftSlot, rightSlot] = bestSwaps[randomInt(bestSwaps.length)];
    swapSlots(raids, leftSlot, rightSlot);
    currentSingletonCount = bestSingletonCount;
  }

  if (currentSingletonCount <= MAX_SINGLETON_CLUSTERS) {
    return currentSingletonCount;
  }

  let bestSingletonCount = currentSingletonCount;
  let bestRaids = cloneState(raids);
  const searchIterations = 20000;

  for (let iteration = 0; iteration < searchIterations; iteration += 1) {
    const leftSlot = slots[randomInt(slots.length)];
    const rightSlot = slots[randomInt(slots.length)];

    if (!leftSlot || !rightSlot || !canSwap(leftSlot, rightSlot, raids)) {
      continue;
    }

    swapSlots(raids, leftSlot, rightSlot);
    const nextSingletonCount = scoreState(raids).playerSingletonClusterCount;
    const temperature = Math.max(0.2, 1.5 * (1 - iteration / searchIterations));
    const shouldAccept =
      nextSingletonCount <= currentSingletonCount ||
      Math.exp((currentSingletonCount - nextSingletonCount) / temperature) > Math.random();

    if (shouldAccept) {
      currentSingletonCount = nextSingletonCount;

      if (nextSingletonCount < bestSingletonCount) {
        bestSingletonCount = nextSingletonCount;
        bestRaids = cloneState(raids);

        if (bestSingletonCount <= MAX_SINGLETON_CLUSTERS) {
          break;
        }
      }
    } else {
      swapSlots(raids, leftSlot, rightSlot);
    }
  }

  raids.splice(0, raids.length, ...bestRaids.map(cloneRaid));
  return bestSingletonCount;
}

function seedNightmarePlayerSwap(raids, slots) {
  const nightmareSlots = slots.filter(
    (slot) => slot.raidName === "Serca" && slot.difficulty === "Nightmare"
  );

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const leftSlot = nightmareSlots[randomInt(nightmareSlots.length)];
    const rightSlot = nightmareSlots[randomInt(nightmareSlots.length)];

    if (!leftSlot || !rightSlot || !canSwap(leftSlot, rightSlot, raids)) {
      continue;
    }

    swapSlots(raids, leftSlot, rightSlot);
    return true;
  }

  return false;
}

function alignColorsWithPlayerGroups(raids, colorPool) {
  const groups = new Map();

  for (const raid of raids) {
    const members = canonicalMembers(raid.members);
    if (!groups.has(members)) {
      groups.set(members, []);
    }
    groups.get(members).push(raid);
  }

  const orderedGroups = [...groups.values()].sort((left, right) => {
    const leftLocked = left.some((raid) => raid.locked);
    const rightLocked = right.some((raid) => raid.locked);
    return Number(rightLocked) - Number(leftLocked) || right.length - left.length;
  });
  const usedColors = new Set();

  for (const group of orderedGroups) {
    const preferredColors = [
      ...group.map((raid) => raid.originalColor),
      ...group.map((raid) => raid.color),
      ...colorPool
    ].filter(Boolean);
    const color = preferredColors.find((candidate) => !usedColors.has(candidate));

    if (!color) {
      continue;
    }

    usedColors.add(color);
    group.forEach((raid) => {
      raid.color = color;
    });
  }
}

function recolorRaid(raids, slot, color) {
  const raid = raids[slot.raidIndex];
  const previousColor = raid.color;

  raid.color = color;

  return previousColor;
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

function cloneState(raids) {
  return raids.map(cloneRaid);
}

function signatureForState(raids) {
  return raids
    .map((raid) => `${raid.originalIndex}:${canonicalMembers(raid.members)}`)
    .join(";");
}

function countPlayerChangedRaids(raids) {
  return raids.filter(
    (raid) => canonicalMembers(raid.members) !== raid.originalCanonicalMembers
  ).length;
}

function countNightmarePlayerChangedRaids(raids) {
  return raids.filter(
    (raid) =>
      raid.name === "Serca" &&
      raid.difficulty === "Nightmare" &&
      canonicalMembers(raid.members) !== raid.originalCanonicalMembers
  ).length;
}

function nightmareSignatureForState(raids) {
  return raids
    .filter((raid) => raid.name === "Serca" && raid.difficulty === "Nightmare")
    .map((raid) => `${raid.originalIndex}:${canonicalMembers(raid.members)}`)
    .join(";");
}

function countColorChangedRaids(raids) {
  return raids.filter((raid) => raid.color !== raid.originalColor).length;
}

function optionAdjustedScore(result, variety) {
  return (
    result.score +
    result.changedRaidCount * variety * 20 +
    result.nightmareChangedRaidCount * variety * 80 -
    result.singletonClusterCount * variety * 50 -
    result.playerSingletonClusterCount * variety * 80
  );
}

function optimizeOnce(
  sourceRaids,
  iterations,
  variety,
  excludedNightmareSignatures = new Set()
) {
  const raids = buildState(sourceRaids);
  const slots = getMovableSlots(raids);
  const recolorSlots = getRecolorSlots(raids);
  const colorPool = getColorPool(raids);
  seedNightmarePlayerSwap(raids, slots);
  const consolidatedSingletonCount = consolidateSingletonPlayerGroups(raids, slots);
  if (process.env.DEBUG_RAID_OPTIMIZER) {
    console.log(`Consolidated player singleton groups: ${consolidatedSingletonCount}`);
  }
  alignColorsWithPlayerGroups(raids, colorPool);
  let current = scoreState(raids);
  let bestRaids = cloneState(raids);
  let best = current;
  let bestChangedRaids = null;
  let bestChanged = null;
  let bestChangedAdjustedScore = -Infinity;
  const initialSignature = signatureForState(raids);
  let temperature = 28 + variety * 4;

  if (
    current.validationProblems.length === 0 &&
    countPlayerChangedRaids(raids) > 0 &&
    countNightmarePlayerChangedRaids(raids) > 0 &&
    current.singletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    current.playerSingletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    !excludedNightmareSignatures.has(nightmareSignatureForState(raids))
  ) {
    bestChanged = current;
    bestChangedRaids = cloneState(raids);
    bestChangedAdjustedScore = optionAdjustedScore({
      changedRaidCount: countPlayerChangedRaids(raids),
      colorChangedRaidCount: countColorChangedRaids(raids),
      nightmareChangedRaidCount: countNightmarePlayerChangedRaids(raids),
      playerSingletonClusterCount: current.playerSingletonClusterCount,
      score: current.score,
      singletonClusterCount: current.singletonClusterCount
    }, variety);
  }

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const useRecolor = Math.random() < 0.35;
    let undo = null;

    if (useRecolor) {
      const slot = recolorSlots[randomInt(recolorSlots.length)];
      const allowedColors = slot
        ? getAllowedColorsForRaid(raids, slot.raidIndex, colorPool)
        : [];
      const color = allowedColors[randomInt(allowedColors.length)];

      if (!slot || !color || raids[slot.raidIndex].color === color) {
        continue;
      }

      const previousColor = recolorRaid(raids, slot, color);
      undo = () => {
        raids[slot.raidIndex].color = previousColor;
      };
    } else {
      const leftSlot = slots[randomInt(slots.length)];
      const rightSlot = slots[randomInt(slots.length)];

      if (!leftSlot || !rightSlot || !canSwap(leftSlot, rightSlot, raids)) {
        continue;
      }

      swapSlots(raids, leftSlot, rightSlot);
      undo = () => swapSlots(raids, leftSlot, rightSlot);
    }

    const next = scoreState(raids);
    const delta = next.score - current.score;
    const shouldAccept = delta >= 0 || Math.exp(delta / temperature) > Math.random();

    if (
      next.validationProblems.length === 0 &&
      countPlayerChangedRaids(raids) > 0 &&
      countNightmarePlayerChangedRaids(raids) > 0 &&
      next.singletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
      next.playerSingletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
      !excludedNightmareSignatures.has(nightmareSignatureForState(raids)) &&
      signatureForState(raids) !== initialSignature
    ) {
      const candidate = {
        changedRaidCount: countPlayerChangedRaids(raids),
        colorChangedRaidCount: countColorChangedRaids(raids),
        nightmareChangedRaidCount: countNightmarePlayerChangedRaids(raids),
        playerSingletonClusterCount: next.playerSingletonClusterCount,
        score: next.score,
        singletonClusterCount: next.singletonClusterCount
      };
      const adjustedScore = optionAdjustedScore(candidate, variety);

      if (!bestChanged || adjustedScore > bestChangedAdjustedScore) {
        bestChanged = next;
        bestChangedAdjustedScore = adjustedScore;
        bestChangedRaids = cloneState(raids);
      }
    }

    if (shouldAccept) {
      current = next;

      if (next.score > best.score) {
        best = next;
        bestRaids = cloneState(raids);
      }
    } else {
      undo();
    }

    temperature = Math.max(0.35, temperature * 0.99992);
  }

  const bestRaidsAreEligible =
    countPlayerChangedRaids(bestRaids) > 0 &&
    countNightmarePlayerChangedRaids(bestRaids) > 0 &&
    !excludedNightmareSignatures.has(nightmareSignatureForState(bestRaids));
  const returnedRaids = bestRaidsAreEligible || !bestChangedRaids
    ? bestRaids
    : bestChangedRaids;
  const finalScore = scoreState(returnedRaids);

  return {
    changedRaidCount: countPlayerChangedRaids(returnedRaids),
    colorChangedRaidCount: countColorChangedRaids(returnedRaids),
    clusters: finalScore.clusters,
    nightmareChangedRaidCount: countNightmarePlayerChangedRaids(returnedRaids),
    playerSingletonClusterCount: finalScore.playerSingletonClusterCount,
    raids: returnedRaids,
    score: finalScore.score,
    singletonClusterCount: finalScore.singletonClusterCount,
    validationProblems: finalScore.validationProblems
  };
}

function hasImportedLabels(raids) {
  return raids.some((raid) =>
    raid.members.some((member) => typeof member.itemLevel === "number")
  );
}

function buildSuggestions({
  count = DEFAULT_SUGGESTION_COUNT,
  iterations = DEFAULT_ITERATIONS,
  raids = readRaids(),
  variety = DEFAULT_VARIETY
} = {}) {
  const baseState = buildState(raids);
  const baseline = scoreState(baseState);
  const suggestions = [];
  const seen = new Set([signatureForState(baseState)]);
  const seenNightmareLayouts = new Set([nightmareSignatureForState(baseState)]);
  const attempts = Math.max(count * 12, 20);

  for (let attempt = 0; attempt < attempts && suggestions.length < count; attempt += 1) {
    const suggestion = optimizeOnce(
      raids,
      iterations,
      variety + attempt,
      seenNightmareLayouts
    );
    const signature = signatureForState(suggestion.raids);
    const nightmareSignature = nightmareSignatureForState(suggestion.raids);

    if (
      seen.has(signature) ||
      seenNightmareLayouts.has(nightmareSignature) ||
      suggestion.changedRaidCount === 0 ||
      suggestion.nightmareChangedRaidCount === 0 ||
      suggestion.singletonClusterCount > MAX_SINGLETON_CLUSTERS ||
      suggestion.playerSingletonClusterCount > MAX_SINGLETON_CLUSTERS ||
      suggestion.validationProblems.length > 0
    ) {
      continue;
    }

    seen.add(signature);
    seenNightmareLayouts.add(nightmareSignature);
    suggestions.push(suggestion);
  }

  suggestions.sort((left, right) =>
    optionAdjustedScore(right, variety) - optionAdjustedScore(left, variety)
  );

  return {
    baseline: {
      clusters: baseline.clusters,
      score: baseline.score,
      playerSingletonClusterCount: baseline.playerSingletonClusterCount,
      singletonClusterCount: baseline.singletonClusterCount,
      validationProblems: baseline.validationProblems
    },
    itemLevelsAvailable: hasImportedLabels(raids),
    suggestions
  };
}

function formatRaid(raid) {
  const members = raid.members
    .map((member) => {
      const label = member.label || member.tier;
      const suffix = label ? `-${label}` : "";
      const itemLevel = typeof member.itemLevel === "number" ? ` ${member.itemLevel}` : "";
      return `${member.name}${suffix} (${member.role}${itemLevel})`;
    })
    .join(", ");

  return `${raid.color} ${raid.name} ${raid.difficulty}: ${members}`;
}

function formatCluster(cluster) {
  const raidLines = cluster.map((raid) => {
    const memberNames = raid.members
      .map((member) => member.name)
      .sort((left, right) => left.localeCompare(right))
      .join(", ");

    return `${raid.name} ${raid.difficulty} [${memberNames}]`;
  });
  const sharedMembers = cluster
    .reduce((shared, raid, index) => {
      const raidMembers = new Set(raid.members.map((member) => member.lookupName || normalizeName(member.name)));

      if (index === 0) {
        return raidMembers;
      }

      return new Set([...shared].filter((member) => raidMembers.has(member)));
    }, new Set());
  const sharedText = [...sharedMembers]
    .sort((left, right) => left.localeCompare(right))
    .join(", ");

  return `${cluster[0].color}: ${cluster.length} run(s), shared [${sharedText || "none"}] -> ${raidLines.join("; ")}`;
}

function formatValidationProblems(validationProblems) {
  if (validationProblems.length === 0) {
    return "None";
  }

  return validationProblems
    .map(({ raid, problems }) => `${raid.color} ${raid.name} ${raid.difficulty}: ${problems.join(", ")}`)
    .join("\n");
}

function formatSuggestionsReport(result) {
  const lines = [
    "Raid group suggestions",
    "======================",
    "",
    `Current score: ${result.baseline.score}`,
    `Current validation issues: ${formatValidationProblems(result.baseline.validationProblems)}`,
    ""
  ];

  if (!result.itemLevelsAvailable) {
    lines.push(
      "Note: no imported item levels were found, so Cathedral 3 eligibility was inferred from the current Cathedral 3 assignments.",
      "Re-uploading the workbook after this update will preserve item levels from the sheet.",
      ""
    );
  }

  if (result.suggestions.length === 0) {
    lines.push("No better alternatives were found with the current constraints.");
    return lines.join("\n");
  }

  result.suggestions.forEach((suggestion, index) => {
    lines.push(
      `Option ${index + 1}`,
      "-".repeat(8),
      `Score: ${suggestion.score} (${suggestion.score - result.baseline.score >= 0 ? "+" : ""}${suggestion.score - result.baseline.score})`,
      `Player-composition changes: ${suggestion.changedRaidCount}`,
      `Nightmare player-composition changes: ${suggestion.nightmareChangedRaidCount}`,
      `Singleton color clusters: ${suggestion.singletonClusterCount}/${MAX_SINGLETON_CLUSTERS} max`,
      `Singleton player compositions: ${suggestion.playerSingletonClusterCount}/${MAX_SINGLETON_CLUSTERS} max`,
      `Color changes: ${suggestion.colorChangedRaidCount}`,
      `Validation issues: ${formatValidationProblems(suggestion.validationProblems)}`,
      "",
      "Clusters:",
      ...suggestion.clusters.map(formatCluster),
      "",
      "Groups:",
      ...suggestion.raids
        .slice()
        .sort((left, right) => left.originalIndex - right.originalIndex)
        .map(formatRaid),
      ""
    );
  });

  return lines.join("\n");
}

module.exports = {
  buildSuggestions,
  formatSuggestionsReport,
  scoreState
};
