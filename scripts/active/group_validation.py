"""Validate concrete runs independently of the optimization model."""

from collections import Counter, defaultdict

from group_roster import RAIDS, LIMITS, assignment_cost, cluster_cost, eligible_difficulties, is_required


def predefined_matches(group, run, characters):
    if (group.raid, group.difficulty) != (run["raid"], run["difficulty"]):
        return False
    assigned = {characters[m["characterId"]].player: m["role"] for m in run["members"]}
    return all(player is None or (player in assigned and (role == "Flex" or assigned[player] == role))
               for player, role in group.slots)


def match_predefined(roster, runs):
    """One-to-one matching: each predefined row needs a distinct concrete run."""
    characters = {c.id: c for c in roster.characters}
    choices = [[i for i, run in enumerate(runs) if predefined_matches(group, run, characters)]
               for group in roster.predefined]
    owners = {}

    def place(group_index, seen):
        for run_index in choices[group_index]:
            if run_index in seen:
                continue
            seen.add(run_index)
            if run_index not in owners or place(owners[run_index], seen):
                owners[run_index] = group_index
                return True
        return False

    for index in range(len(choices)):
        if not place(index, set()):
            raise ValueError(f"Predefined group {index + 1} has no distinct matching run")
    return {group + 1: run + 1 for run, group in owners.items()}


def validate_solution(roster, runs, rules, requested_runs=None):
    characters = {c.id: c for c in roster.characters}
    seen = Counter()
    if requested_runs is not None and len(runs) != requested_runs:
        raise ValueError(f"Expected {requested_runs} runs, got {len(runs)}")
    for index, run in enumerate(runs, 1):
        raid, difficulty = run["raid"], run["difficulty"]
        if (raid, difficulty) not in LIMITS:
            raise ValueError(f"Run {index}: unknown raid/difficulty")
        if len(run["members"]) not in (3, 4):
            raise ValueError(f"Run {index}: must contain 3 or 4 characters")
        players, roles = set(), Counter()
        for member in run["members"]:
            character = characters.get(member["characterId"])
            if character is None:
                raise ValueError(f"Run {index}: unknown character")
            if character.player in players:
                raise ValueError(f"Run {index}: player {character.player} appears twice")
            players.add(character.player)
            seen[character.id, raid] += 1
            if seen[character.id, raid] > 1:
                raise ValueError(f"{character.id} appears in multiple {raid} runs")
            if raid not in character.raids or difficulty not in eligible_difficulties(character, raid, rules):
                raise ValueError(f"Run {index}: {character.id} is not eligible for {raid} {difficulty}")
            if character.item_level < LIMITS[raid, difficulty]:
                raise ValueError(f"Run {index}: character below item-level threshold")
            role = member["role"]
            if role not in ("DPS", "Support") or (character.role != "Flex" and character.role != role):
                raise ValueError(f"Run {index}: illegal role for {character.id}")
            roles[role] += 1
        if roles["DPS"] > 3 or roles["Support"] > 1:
            raise ValueError(f"Run {index}: exceeds 3 DPS / 1 Support capacity")
        if "jan" in players and "nonna" not in players:
            raise ValueError(f"Run {index}: Jan requires Nonna")
    missing = [f"{c.id} / {raid}" for c in roster.characters for raid in RAIDS
               if raid in c.raids and is_required(c, raid, rules) and seen[c.id, raid] != 1]
    if missing:
        raise ValueError("Missing mandatory participation: " + ", ".join(missing))
    matches = match_predefined(roster, runs)
    return {"valid": True, "mandatoryParticipations": sum(
        1 for c in roster.characters for raid in RAIDS if raid in c.raids and is_required(c, raid, rules)
    ), "predefinedRunNumbers": matches}


def score_solution(roster, runs, rules):
    characters = {c.id: c for c in roster.characters}
    costs = {"vacancies": 0, "clusters": 0, "optionalUse": 0, "downgrades": 0, "maybeDowngrades": 0}
    clusters = defaultdict(list)
    for index, run in enumerate(runs, 1):
        players = tuple(sorted(characters[m["characterId"]].player for m in run["members"]))
        clusters[players].append(index)
        if len(run["members"]) == 3:
            costs["vacancies"] += rules.missing_dps if any(m["role"] == "Support" for m in run["members"]) else rules.missing_support
        for member in run["members"]:
            for key, cost in assignment_cost(characters[member["characterId"]], run["raid"], run["difficulty"], rules).items():
                costs[key] += cost
    costs["clusters"] = sum(cluster_cost(len(indices), rules) for indices in clusters.values())
    return {"totalPenalty": sum(costs.values()), "penalties": costs,
            "fullRuns": sum(len(r["members"]) == 4 for r in runs),
            "partialRuns": sum(len(r["members"]) == 3 for r in runs),
            "clusterSizes": sorted((len(v) for v in clusters.values()), reverse=True)}
