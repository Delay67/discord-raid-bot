const { readRaids } = require("./raidStore");

const DEFAULT_ITERATIONS = 45000;
const DEFAULT_SUGGESTION_COUNT = 3;
const DEFAULT_VARIETY = 3;
const MAX_COLOR_CLUSTERS = 13;
const MAX_SINGLETON_CLUSTERS = 5;
const DEFAULT_LOCK_MODE = "colored-nightmare";
const COLOR_POOL = [
  "Red",
  "Orange",
  "Gold",
  "Yellow",
  "Lime",
  "Green",
  "Forest",
  "Cyan",
  "Blue",
  "Indigo",
  "Magenta",
  "Rose",
  "Brown",
  "Gray",
  "Brick"
];

function normalizeName(value) {
  return String(value || "").trim().toLowerCase();
}

function isRealColor(color) {
  const normalized = normalizeName(color);
  return Boolean(normalized) && normalized !== "unknown";
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
      } else if (member.role === "Flex") {
        counts.flex += 1;
      } else {
        counts.dps += 1;
      }

      return counts;
    },
    {
      dps: 0,
      flex: 0,
      supports: 0
    }
  );
}

function canFillRaidRoles(raid) {
  const counts = getRoleCounts(raid);

  if (raid.members.length === 3) {
    return counts.dps <= 3 && counts.supports <= 1;
  }

  return (
    raid.members.length === 4 &&
    counts.dps <= 3 &&
    counts.supports <= 1 &&
    counts.dps + counts.flex >= 3 &&
    counts.supports + counts.flex >= 1
  );
}

function isLockedRaid(raid, lockMode = DEFAULT_LOCK_MODE) {
  if (lockMode === "none") {
    return false;
  }

  const hasInputColor = isRealColor(raid.originalColor || raid.color);

  if (lockMode === "all-colored") {
    return hasInputColor;
  }

  return hasInputColor && raid.name === "Serca" && raid.difficulty === "Nightmare";
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

function buildState(raids, lockMode = DEFAULT_LOCK_MODE) {
  return raids.map((raid, raidIndex) => ({
    ...cloneRaid(raid),
    originalIndex: raidIndex,
    originalColor: raid.color,
    originalCanonicalMembers: canonicalMembers(raid.members),
    locked: isLockedRaid(raid, lockMode),
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

  if (raid.members.length < 3) {
    problems.push(`fewer than 3 members (${raid.members.length})`);
  }

  if (raid.members.length > 4) {
    problems.push(`more than 4 members (${raid.members.length}/4)`);
  }

  if (!canFillRaidRoles(raid)) {
    const targetDps = 3;

    if (counts.dps > targetDps) {
      problems.push(`more than ${targetDps} fixed DPS`);
    }

    if (counts.supports > 1) {
      problems.push("more than 1 fixed Support");
    }

    if (counts.dps + counts.flex < targetDps) {
      problems.push(`cannot fill ${targetDps} DPS slots`);
    }

    if (raid.members.length === 4 && counts.supports + counts.flex < 1) {
      problems.push("cannot fill 1 Support slot");
    }
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
  const threeMemberRaidCount = raids.filter((raid) => raid.members.length === 3).length;
  const playerCompositionCounts = raids.reduce((counts, raid) => {
    const members = canonicalMembers(raid.members);
    counts.set(members, (counts.get(members) || 0) + 1);
    return counts;
  }, new Map());
  const playerSingletonClusterCount = [...playerCompositionCounts.values()]
    .filter((count) => count === 1).length;
  const playerCompositionClusterCount = playerCompositionCounts.size;
  const validationProblems = [];

  if (clusters.length > MAX_COLOR_CLUSTERS) {
    score -= (clusters.length - MAX_COLOR_CLUSTERS) * 3000;
  }

  if (singletonClusterCount > MAX_SINGLETON_CLUSTERS) {
    score -= (singletonClusterCount - MAX_SINGLETON_CLUSTERS) * 2500;
  }

  if (threeMemberRaidCount > 0) {
    score -= threeMemberRaidCount * threeMemberRaidCount * 750;
  }

  score -= playerSingletonClusterCount * 350;
  if (playerSingletonClusterCount > MAX_SINGLETON_CLUSTERS) {
    score -= (playerSingletonClusterCount - MAX_SINGLETON_CLUSTERS) * 3000;
  }
  if (playerCompositionClusterCount > MAX_COLOR_CLUSTERS) {
    score -= (playerCompositionClusterCount - MAX_COLOR_CLUSTERS) * 3500;
  }

  for (const raid of raids) {
    const counts = getRoleCounts(raid);

    if (canFillRaidRoles(raid)) {
      score += raid.members.length === 3 ? -60 : 12;
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
    playerCompositionClusterCount,
    playerSingletonClusterCount,
    score,
    singletonClusterCount,
    threeMemberRaidCount,
    validationProblems
  };
}

function getColorPool(raids) {
  return [...new Set([
    ...raids.map((raid) => raid.color),
    ...COLOR_POOL
  ])].filter(isRealColor);
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
  return raids
    .map((raid, raidIndex) => ({
      raid,
      raidIndex
    }))
    .filter((slot) => !slot.raid.locked)
    .map((slot) => ({
      raidIndex: slot.raidIndex
    }));
}

function canSwap(leftSlot, rightSlot, raids) {
  if (leftSlot.raidIndex === rightSlot.raidIndex) {
    return false;
  }

  if (leftSlot.raidName !== rightSlot.raidName) {
    return false;
  }

  if (leftSlot.difficulty !== rightSlot.difficulty) {
    return false;
  }

  const rolesAreCompatible =
    leftSlot.role === rightSlot.role ||
    leftSlot.role === "Flex" ||
    rightSlot.role === "Flex";

  if (!rolesAreCompatible) {
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

  return true;
}

function canMoveMemberToRaid(donorRaid, memberIndex, targetRaid) {
  if (donorRaid.locked || targetRaid.locked) {
    return false;
  }

  if (donorRaid.members.length <= 3 || targetRaid.members.length >= 4) {
    return false;
  }

  if (donorRaid.name !== targetRaid.name) {
    return false;
  }

  if (donorRaid.difficulty !== targetRaid.difficulty) {
    return false;
  }

  const member = donorRaid.members[memberIndex];
  if (!member) {
    return false;
  }

  if (targetRaid.name === "Cathedral" && targetRaid.difficulty === "3" && !member.eligibleForCathedral3) {
    return false;
  }

  const memberName = normalizeName(member.lookupName || member.name);
  if (
    targetRaid.members.some(
      (targetMember) => normalizeName(targetMember.lookupName || targetMember.name) === memberName
    )
  ) {
    return false;
  }

  const nextDonor = {
    ...donorRaid,
    members: donorRaid.members.filter((_, index) => index !== memberIndex)
  };
  const nextTarget = {
    ...targetRaid,
    members: [...targetRaid.members, member]
  };

  return canFillRaidRoles(nextDonor) && canFillRaidRoles(nextTarget);
}

function raidBucketKey(raid) {
  return `${raid.name}|${raid.difficulty}`;
}

function targetGroupSizes(memberCount) {
  if (memberCount < 3) {
    return null;
  }

  let groupCount = Math.ceil(memberCount / 4);

  while (groupCount * 3 > memberCount) {
    groupCount += 1;
  }

  const sizes = Array.from({ length: groupCount }, () => 3);
  let remaining = memberCount - groupCount * 3;

  for (let index = 0; index < sizes.length && remaining > 0; index += 1) {
    sizes[index] += 1;
    remaining -= 1;
  }

  return sizes;
}

function shuffled(values) {
  const copy = values.slice();

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function memberFitsGroup(member, group, targetSize) {
  const memberName = normalizeName(member.lookupName || member.name);

  if (
    group.some(
      (candidate) => normalizeName(candidate.lookupName || candidate.name) === memberName
    )
  ) {
    return false;
  }

  const nextGroup = [...group, member];
  const counts = getRoleCounts({ members: nextGroup });

  if (counts.dps > 3 || counts.supports > 1 || nextGroup.length > targetSize) {
    return false;
  }

  const remainingSlots = targetSize - nextGroup.length;

  if (targetSize === 4) {
    if (counts.dps + counts.flex + remainingSlots < 3) {
      return false;
    }

    if (counts.supports + counts.flex + remainingSlots < 1) {
      return false;
    }
  }

  return true;
}

function packMembersIntoGroups(members, sizes) {
  const attempts = 700;
  const sizeIndexes = sizes
    .map((size, index) => ({ index, size }))
    .sort((left, right) => right.size - left.size || left.index - right.index);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const groups = sizes.map(() => []);
    const supports = shuffled(members.filter((member) => member.role === "Support"));
    const flex = shuffled(members.filter((member) => member.role === "Flex"));
    const dps = shuffled(members.filter((member) => member.role !== "Support" && member.role !== "Flex"));
    const orderedMembers = [...supports, ...flex, ...dps];

    for (const member of orderedMembers) {
      const candidates = sizeIndexes
        .filter(({ index, size }) => memberFitsGroup(member, groups[index], size))
        .sort((left, right) => {
          const leftNeedSupport =
            left.size === 4 && getRoleCounts({ members: groups[left.index] }).supports === 0;
          const rightNeedSupport =
            right.size === 4 && getRoleCounts({ members: groups[right.index] }).supports === 0;

          if (member.role === "Support" && leftNeedSupport !== rightNeedSupport) {
            return Number(rightNeedSupport) - Number(leftNeedSupport);
          }

          return groups[right.index].length - groups[left.index].length;
        });

      if (!candidates.length) {
        break;
      }

      groups[candidates[0].index].push(member);
    }

    if (
      groups.every((group, index) => group.length === sizes[index] && canFillRaidRoles({ members: group }))
    ) {
      return groups;
    }
  }

  return null;
}

function consolidateRaidCounts(raids) {
  const buckets = new Map();

  raids.forEach((raid, index) => {
    if (raid.locked) {
      return;
    }

    const key = raidBucketKey(raid);

    if (!buckets.has(key)) {
      buckets.set(key, []);
    }

    buckets.get(key).push({ index, raid });
  });

  const replacements = new Map();
  let removedRaidCount = 0;

  for (const bucket of buckets.values()) {
    const memberCount = bucket.reduce(
      (total, entry) => total + entry.raid.members.length,
      0
    );
    const sizes = targetGroupSizes(memberCount);

    if (!sizes || sizes.length >= bucket.length) {
      continue;
    }

    const members = bucket.flatMap((entry) =>
      entry.raid.members.map((member) => ({ ...member }))
    );
    const packedGroups = packMembersIntoGroups(members, sizes);

    if (!packedGroups) {
      continue;
    }

    packedGroups.forEach((membersForRaid, groupIndex) => {
      const sourceRaid = bucket[Math.min(groupIndex, bucket.length - 1)].raid;
      replacements.set(bucket[groupIndex].index, {
        ...cloneRaid(sourceRaid),
        color: "Unknown",
        locked: false,
        members: membersForRaid.map((member) => ({ ...member }))
      });
    });

    for (let index = packedGroups.length; index < bucket.length; index += 1) {
      replacements.set(bucket[index].index, null);
      removedRaidCount += 1;
    }
  }

  if (replacements.size > 0) {
    const nextRaids = raids
      .map((raid, index) =>
        replacements.has(index) ? replacements.get(index) : raid
      )
      .filter(Boolean);

    raids.splice(0, raids.length, ...nextRaids);
  }

  return removedRaidCount;
}

function moveMemberToRaid(raids, donorIndex, memberIndex, targetIndex) {
  const donorRaid = raids[donorIndex];
  const targetRaid = raids[targetIndex];
  const [member] = donorRaid.members.splice(memberIndex, 1);
  targetRaid.members.push(member);
}

function repairUnderfilledRaids(raids) {
  let repairCount = 0;

  while (raids.some((raid) => raid.members.length < 3)) {
    let bestMove = null;
    let bestScore = -Infinity;

    for (let targetIndex = 0; targetIndex < raids.length; targetIndex += 1) {
      const targetRaid = raids[targetIndex];

      if (targetRaid.members.length >= 3) {
        continue;
      }

      for (let donorIndex = 0; donorIndex < raids.length; donorIndex += 1) {
        if (donorIndex === targetIndex) {
          continue;
        }

        const donorRaid = raids[donorIndex];

        for (let memberIndex = 0; memberIndex < donorRaid.members.length; memberIndex += 1) {
          if (!canMoveMemberToRaid(donorRaid, memberIndex, targetRaid)) {
            continue;
          }

          const previousState = cloneState(raids);
          moveMemberToRaid(raids, donorIndex, memberIndex, targetIndex);
          const state = scoreState(raids);
          const score =
            state.score -
            state.validationProblems.length * 10000 -
            Math.abs(3 - targetRaid.members.length) * 250;
          restoreState(raids, previousState);

          if (score > bestScore) {
            bestScore = score;
            bestMove = {
              donorIndex,
              memberIndex,
              targetIndex
            };
          }
        }
      }
    }

    if (!bestMove) {
      break;
    }

    moveMemberToRaid(
      raids,
      bestMove.donorIndex,
      bestMove.memberIndex,
      bestMove.targetIndex
    );
    repairCount += 1;
  }

  return repairCount;
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

  if (
    currentSingletonCount <= MAX_SINGLETON_CLUSTERS &&
    scoreState(raids).playerCompositionClusterCount <= MAX_COLOR_CLUSTERS
  ) {
    return currentSingletonCount;
  }

  let currentState = scoreState(raids);
  const consolidationCost = (state) =>
    Math.max(0, state.playerSingletonClusterCount - MAX_SINGLETON_CLUSTERS) * 5 +
    Math.max(0, state.playerCompositionClusterCount - MAX_COLOR_CLUSTERS) * 7 +
    state.playerSingletonClusterCount * 0.02 +
    state.playerCompositionClusterCount * 0.01;
  let currentCost = consolidationCost(currentState);
  let bestCost = currentCost;
  let bestSingletonCount = currentState.playerSingletonClusterCount;
  let bestRaids = cloneState(raids);
  const searchIterations = 20000;

  for (let iteration = 0; iteration < searchIterations; iteration += 1) {
    const leftSlot = slots[randomInt(slots.length)];
    const rightSlot = slots[randomInt(slots.length)];

    if (!leftSlot || !rightSlot || !canSwap(leftSlot, rightSlot, raids)) {
      continue;
    }

    swapSlots(raids, leftSlot, rightSlot);
    const nextState = scoreState(raids);
    const nextSingletonCount = nextState.playerSingletonClusterCount;
    const nextCost = consolidationCost(nextState);
    const temperature = Math.max(0.2, 1.5 * (1 - iteration / searchIterations));
    const shouldAccept =
      nextCost <= currentCost ||
      Math.exp((currentCost - nextCost) / temperature) > Math.random();

    if (shouldAccept) {
      currentSingletonCount = nextSingletonCount;
      currentCost = nextCost;
      currentState = nextState;

      if (nextCost < bestCost) {
        bestCost = nextCost;
        bestSingletonCount = nextSingletonCount;
        bestRaids = cloneState(raids);

        if (
          bestSingletonCount <= MAX_SINGLETON_CLUSTERS &&
          nextState.playerCompositionClusterCount <= MAX_COLOR_CLUSTERS
        ) {
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
    ].filter(isRealColor);
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

function restoreState(targetRaids, sourceRaids) {
  for (let index = 0; index < targetRaids.length; index += 1) {
    targetRaids[index].color = sourceRaids[index].color;
    targetRaids[index].members = sourceRaids[index].members.map((member) => ({ ...member }));
  }
}

function signatureForState(raids) {
  return raids
    .map((raid) => `${raid.originalIndex}:${canonicalMembers(raid.members)}`)
    .join(";");
}

function raidKind(raid) {
  return `${raid.name} ${raid.difficulty}`;
}

function clusterConfigurationSignature(raids) {
  const clusters = new Map();

  for (const raid of raids) {
    const members = canonicalMembers(raid.members);

    if (!clusters.has(members)) {
      clusters.set(members, new Map());
    }

    const raidCounts = clusters.get(members);
    const kind = raidKind(raid);
    raidCounts.set(kind, (raidCounts.get(kind) || 0) + 1);
  }

  return [...clusters.entries()]
    .map(([members, raidCounts]) => {
      const raidText = [...raidCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([kind, count]) => `${kind}:${count}`)
        .join(",");

      return `${members}=>${raidText}`;
    })
    .sort((left, right) => left.localeCompare(right))
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
    result.colorClusterCount * variety * 60 -
    result.singletonClusterCount * variety * 50 -
    result.playerSingletonClusterCount * variety * 80 -
    result.threeMemberRaidCount * result.threeMemberRaidCount * variety * 250
  );
}

function optimizeOnce(
  sourceRaids,
  iterations,
  variety,
  excludedNightmareSignatures = new Set(),
  lockMode = DEFAULT_LOCK_MODE,
  requireNightmareChange = true,
  excludedClusterConfigurations = new Set()
) {
  const raids = buildState(sourceRaids, lockMode);
  const colorPool = getColorPool(raids);
  const consolidatedRaidCount = consolidateRaidCounts(raids);
  const repairedUnderfilledRaidCount = repairUnderfilledRaids(raids);
  const slots = getMovableSlots(raids);
  const recolorSlots = getRecolorSlots(raids);
  seedNightmarePlayerSwap(raids, slots);
  const consolidatedSingletonCount = consolidateSingletonPlayerGroups(raids, slots);
  if (process.env.DEBUG_RAID_OPTIMIZER) {
    console.log(`Consolidated raids removed: ${consolidatedRaidCount}`);
    console.log(`Repaired underfilled raids: ${repairedUnderfilledRaidCount}`);
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
    (!requireNightmareChange || countNightmarePlayerChangedRaids(raids) > 0) &&
    current.clusters.length <= MAX_COLOR_CLUSTERS &&
    current.playerCompositionClusterCount <= MAX_COLOR_CLUSTERS &&
    current.singletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    current.playerSingletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    (!requireNightmareChange || !excludedNightmareSignatures.has(nightmareSignatureForState(raids))) &&
    !excludedClusterConfigurations.has(clusterConfigurationSignature(raids))
  ) {
    bestChanged = current;
    bestChangedRaids = cloneState(raids);
    bestChangedAdjustedScore = optionAdjustedScore({
      changedRaidCount: countPlayerChangedRaids(raids),
      colorClusterCount: current.clusters.length,
      colorChangedRaidCount: countColorChangedRaids(raids),
      nightmareChangedRaidCount: countNightmarePlayerChangedRaids(raids),
      playerSingletonClusterCount: current.playerSingletonClusterCount,
      score: current.score,
      singletonClusterCount: current.singletonClusterCount,
      threeMemberRaidCount: current.threeMemberRaidCount
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

      const previousState = cloneState(raids);
      swapSlots(raids, leftSlot, rightSlot);
      alignColorsWithPlayerGroups(raids, colorPool);
      undo = () => restoreState(raids, previousState);
    }

    const next = scoreState(raids);
    const delta = next.score - current.score;
    const shouldAccept = delta >= 0 || Math.exp(delta / temperature) > Math.random();

    if (
      next.validationProblems.length === 0 &&
      countPlayerChangedRaids(raids) > 0 &&
      (!requireNightmareChange || countNightmarePlayerChangedRaids(raids) > 0) &&
      next.clusters.length <= MAX_COLOR_CLUSTERS &&
      next.playerCompositionClusterCount <= MAX_COLOR_CLUSTERS &&
      next.singletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
      next.playerSingletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
      (!requireNightmareChange || !excludedNightmareSignatures.has(nightmareSignatureForState(raids))) &&
      !excludedClusterConfigurations.has(clusterConfigurationSignature(raids)) &&
      signatureForState(raids) !== initialSignature
    ) {
      const candidate = {
        changedRaidCount: countPlayerChangedRaids(raids),
        colorClusterCount: next.clusters.length,
        colorChangedRaidCount: countColorChangedRaids(raids),
        nightmareChangedRaidCount: countNightmarePlayerChangedRaids(raids),
        playerSingletonClusterCount: next.playerSingletonClusterCount,
        score: next.score,
        singletonClusterCount: next.singletonClusterCount,
        threeMemberRaidCount: next.threeMemberRaidCount
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

  const bestRaidsScore = scoreState(bestRaids);
  const bestRaidsAreEligible =
    countPlayerChangedRaids(bestRaids) > 0 &&
    (!requireNightmareChange || countNightmarePlayerChangedRaids(bestRaids) > 0) &&
    bestRaidsScore.clusters.length <= MAX_COLOR_CLUSTERS &&
    bestRaidsScore.playerCompositionClusterCount <= MAX_COLOR_CLUSTERS &&
    bestRaidsScore.singletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    bestRaidsScore.playerSingletonClusterCount <= MAX_SINGLETON_CLUSTERS &&
    (!requireNightmareChange || !excludedNightmareSignatures.has(nightmareSignatureForState(bestRaids))) &&
    !excludedClusterConfigurations.has(clusterConfigurationSignature(bestRaids));
  const returnedRaids = bestRaidsAreEligible || !bestChangedRaids
    ? bestRaids
    : bestChangedRaids;
  const finalScore = scoreState(returnedRaids);

  return {
    changedRaidCount: countPlayerChangedRaids(returnedRaids),
    colorClusterCount: finalScore.clusters.length,
    colorChangedRaidCount: countColorChangedRaids(returnedRaids),
    clusters: finalScore.clusters,
    nightmareChangedRaidCount: countNightmarePlayerChangedRaids(returnedRaids),
    playerCompositionClusterCount: finalScore.playerCompositionClusterCount,
    playerSingletonClusterCount: finalScore.playerSingletonClusterCount,
    raids: returnedRaids,
    removedRaidCount: sourceRaids.length - returnedRaids.length,
    score: finalScore.score,
    singletonClusterCount: finalScore.singletonClusterCount,
    threeMemberRaidCount: finalScore.threeMemberRaidCount,
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
  fallbackAttempts,
  iterations = DEFAULT_ITERATIONS,
  lockMode = DEFAULT_LOCK_MODE,
  preferredAttempts,
  raids = readRaids(),
  variety = DEFAULT_VARIETY
} = {}) {
  const baseState = buildState(raids, lockMode);
  const baseline = scoreState(baseState);
  const suggestions = [];
  const seen = new Set([signatureForState(baseState)]);
  const seenClusterConfigurations = new Set();
  const baselineNightmareSignature = nightmareSignatureForState(baseState);
  const seenNightmareLayouts = new Set([baselineNightmareSignature]);
  const requireNightmareChange = baseState.some(
    (raid) => raid.name === "Serca" && raid.difficulty === "Nightmare" && !raid.locked
  );
  const isAcceptable = (suggestion, requireUniqueNightmare) => {
    const signature = signatureForState(suggestion.raids);
    const clusterSignature = clusterConfigurationSignature(suggestion.raids);
    const nightmareSignature = nightmareSignatureForState(suggestion.raids);

    return !(
      seen.has(signature) ||
      seenClusterConfigurations.has(clusterSignature) ||
      (requireNightmareChange && requireUniqueNightmare && seenNightmareLayouts.has(nightmareSignature)) ||
      suggestion.changedRaidCount === 0 ||
      suggestion.colorClusterCount > MAX_COLOR_CLUSTERS ||
      (requireNightmareChange && suggestion.nightmareChangedRaidCount === 0) ||
      suggestion.playerCompositionClusterCount > MAX_COLOR_CLUSTERS ||
      suggestion.singletonClusterCount > MAX_SINGLETON_CLUSTERS ||
      suggestion.playerSingletonClusterCount > MAX_SINGLETON_CLUSTERS ||
      suggestion.validationProblems.length > 0
    );
  };
  const addSuggestion = (suggestion) => {
    seen.add(signatureForState(suggestion.raids));
    seenClusterConfigurations.add(clusterConfigurationSignature(suggestion.raids));
    seenNightmareLayouts.add(nightmareSignatureForState(suggestion.raids));
    suggestions.push(suggestion);
  };
  const preferredAttemptLimit = preferredAttempts ?? Math.max(count * 30, 60);

  for (
    let attempt = 0;
    attempt < preferredAttemptLimit && suggestions.length < count;
    attempt += 1
  ) {
    const suggestion = optimizeOnce(
      raids,
      iterations,
      variety + attempt,
      seenNightmareLayouts,
      lockMode,
      requireNightmareChange,
      seenClusterConfigurations
    );

    if (!isAcceptable(suggestion, true)) {
      continue;
    }

    addSuggestion(suggestion);
  }

  const fallbackAttemptLimit = fallbackAttempts ?? Math.max(count * 45, 90);
  const baselineNightmareLayouts = new Set([baselineNightmareSignature]);

  for (
    let attempt = 0;
    attempt < fallbackAttemptLimit && suggestions.length < count;
    attempt += 1
  ) {
    const suggestion = optimizeOnce(
      raids,
      iterations,
      variety + preferredAttemptLimit + attempt,
      baselineNightmareLayouts,
      lockMode,
      requireNightmareChange,
      seenClusterConfigurations
    );

    if (!isAcceptable(suggestion, false)) {
      continue;
    }

    addSuggestion(suggestion);
  }

  suggestions.sort((left, right) =>
    optionAdjustedScore(right, variety) - optionAdjustedScore(left, variety)
  );

  return {
    baseline: {
      clusters: baseline.clusters,
      colorClusterCount: baseline.clusters.length,
      playerCompositionClusterCount: baseline.playerCompositionClusterCount,
      score: baseline.score,
      playerSingletonClusterCount: baseline.playerSingletonClusterCount,
      singletonClusterCount: baseline.singletonClusterCount,
      threeMemberRaidCount: baseline.threeMemberRaidCount,
      validationProblems: baseline.validationProblems
    },
    itemLevelsAvailable: hasImportedLabels(raids),
    lockMode,
    requireNightmareChange,
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
    `Lock mode: ${result.lockMode || DEFAULT_LOCK_MODE}`,
    `Nightmare changes required: ${result.requireNightmareChange ? "yes" : "no"}`,
    `Current 3-member raids: ${result.baseline.threeMemberRaidCount}`,
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
      `Raids removed: ${suggestion.removedRaidCount || 0}`,
      `Singleton color clusters: ${suggestion.singletonClusterCount}/${MAX_SINGLETON_CLUSTERS} max`,
      `Singleton player compositions: ${suggestion.playerSingletonClusterCount}/${MAX_SINGLETON_CLUSTERS} max`,
      `3-member raids: ${suggestion.threeMemberRaidCount}`,
      `Color changes: ${suggestion.colorChangedRaidCount}`,
      `Color clusters: ${suggestion.colorClusterCount}/${MAX_COLOR_CLUSTERS} max`,
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
