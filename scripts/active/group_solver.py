"""CP-SAT model with exact player-pool aggregation and character allocation."""

from collections import Counter, defaultdict
from dataclasses import dataclass
from itertools import combinations
import math
import random

from ortools.sat.python import cp_model

from group_roster import RAIDS, LIMITS, assignment_cost, cluster_cost, eligible_difficulties, is_required
from group_validation import score_solution, validate_solution
from group_bounds import add_capacity_cuts, cluster_upper, derive_capacity_bounds


@dataclass(frozen=True)
class Template:
    raid: str
    difficulty: str
    players: tuple
    support: str | None
    upper: int

    def role(self, player):
        return "Support" if player == self.support else "DPS"


def template_matches(group, template):
    return (group.raid, group.difficulty) == (template.raid, template.difficulty) and all(
        player is None or (player in template.players and (role == "Flex" or template.role(player) == role))
        for player, role in group.slots
    )


def build_model(roster, rules, requested_runs=None, min_jan_runs=0, *, capacity_bounds=None):
    if type(min_jan_runs) is not int or min_jan_runs < 0:
        raise ValueError("min_jan_runs must be a nonnegative integer")
    model = cp_model.CpModel()
    pools = defaultdict(list)
    assignments = {}
    objective = []
    mandatory_count = 0
    possible_count = 0
    for character in roster.characters:
        for raid in RAIDS:
            if raid not in character.raids:
                continue
            mandatory = is_required(character, raid, rules)
            difficulties = eligible_difficulties(character, raid, rules)
            if mandatory and not difficulties:
                raise ValueError(f"Mandatory character {character.id} ({character.name}) is below the minimum item level for {raid}")
            mandatory_count += mandatory
            possible_count += bool(difficulties)
            choices = []
            for difficulty in difficulties:
                for role in ("DPS", "Support") if character.role == "Flex" else (character.role,):
                    variable = model.new_bool_var(f"assign_{character.id}_{raid}_{difficulty}_{role}")
                    assignments[character.id, raid, difficulty, role] = variable
                    pools[character.player, raid, difficulty, role].append(variable)
                    choices.append(variable)
                    objective.append(sum(assignment_cost(character, raid, difficulty, rules).values()) * variable)
            if mandatory:
                model.add(sum(choices) == 1)
            else:
                model.add(sum(choices) <= 1)

    min_runs = max(1, math.ceil(mandatory_count / 4))
    max_runs = possible_count // 3
    if requested_runs is not None and not min_runs <= requested_runs <= max_runs:
        raise ValueError(f"Requested {requested_runs} runs is outside the coverage bounds {min_runs}..{max_runs}; mandatory characters cannot be dropped")
    if max_runs < min_runs:
        raise ValueError("Not enough eligible characters to form 3- or 4-player runs")
    bounds = capacity_bounds if capacity_bounds is not None else derive_capacity_bounds(roster, rules)

    templates, counts = [], []
    pool_runs = defaultdict(list)
    cluster_runs = defaultdict(list)
    for size in (4, 3):
        for players in combinations(sorted(roster.players), size):
            if "jan" in players and "nonna" not in players:
                continue
            for raid, difficulty in LIMITS:
                for support in players + ((None,) if size == 3 else ()):
                    keys = [(p, raid, difficulty, "Support" if p == support else "DPS") for p in players]
                    upper = min(min(len(pools[key]) for key in keys), bounds[raid, (difficulty,)].max_runs)
                    if not upper:
                        continue
                    template = Template(raid, difficulty, players, support, upper)
                    count = model.new_int_var(0, upper, f"runs_{len(templates)}")
                    templates.append(template)
                    counts.append(count)
                    for key in keys:
                        pool_runs[key].append(count)
                    cluster_runs[players].append(count)
                    if size == 3:
                        objective.append((rules.missing_support if support is None else rules.missing_dps) * count)
    for key, variables in pools.items():
        model.add(sum(variables) == sum(pool_runs[key]))
    if requested_runs is not None:
        model.add(sum(counts) == requested_runs)
    else:
        model.add(sum(counts) >= min_runs)
    if min_jan_runs:
        model.add(sum(count for template, count in zip(templates, counts)
                      if "jan" in template.players) >= min_jan_runs)

    # Predefined rows consume separate runs even when their patterns overlap.
    required_templates = defaultdict(list)
    for index, group in enumerate(roster.predefined):
        matches = []
        for t, template in enumerate(templates):
            if template_matches(group, template):
                chosen = model.new_bool_var(f"predefined_{index}_{t}")
                matches.append(chosen)
                required_templates[t].append(chosen)
        if not matches:
            raise ValueError(f"Predefined group {index + 1} ({group.raid} {group.difficulty}) cannot be filled by eligible players/roles")
        model.add(sum(matches) == 1)
    for t, matches in required_templates.items():
        model.add(sum(matches) <= counts[t])

    add_capacity_cuts(model, templates, counts, assignments, roster, bounds, rules)
    for index, (players, variables) in enumerate(cluster_runs.items()):
        upper = min(max_runs, cluster_upper(bounds, players))
        total = model.new_int_var(0, upper, f"cluster_count_{index}")
        model.add(total == sum(variables))
        penalties = [cluster_cost(n, rules) for n in range(upper + 1)]
        cost = model.new_int_var(0, max(penalties), f"cluster_cost_{index}")
        model.add_element(total, penalties, cost)
        objective.append(cost)
    model.minimize(sum(objective))
    return model, templates, counts, assignments


def extract_runs(roster, templates, counts, assignments, solver, seed):
    characters = {c.id: c for c in roster.characters}
    pools = defaultdict(list)
    for (character_id, raid, difficulty, role), variable in assignments.items():
        if solver.value(variable):
            character = characters[character_id]
            pools[character.player, raid, difficulty, role].append(character)
    rng = random.Random(seed)
    for pool in pools.values():
        rng.shuffle(pool)
    runs = []
    for template, count in zip(templates, counts):
        for _ in range(solver.value(count)):
            members = []
            for player in template.players:
                role = template.role(player)
                character = pools[player, template.raid, template.difficulty, role].pop()
                members.append({"characterId": character.id, "player": roster.players[player],
                                "name": character.name, "class": character.character_class,
                                "itemLevel": character.item_level, "strength": character.strength,
                                "role": role, "originalRole": character.role})
            members.sort(key=lambda m: (m["role"] == "Support", m["player"].casefold()))
            runs.append({"raid": template.raid, "difficulty": template.difficulty, "members": members,
                         "openSlots": [] if len(members) == 4 else ["Support" if template.support is None else "DPS"]})
    if any(pools.values()):
        raise RuntimeError("Unallocated characters remain after extraction")
    runs.sort(key=lambda run: (tuple(sorted(m["player"].casefold() for m in run["members"])), run["raid"], run["difficulty"]))
    return runs


def solve_roster(roster, rules, solutions=3, time_limit=60, seed=1, workers=8, requested_runs=None, progress=None, min_jan_runs=0):
    if solutions < 1 or not math.isfinite(time_limit) or time_limit <= 0 or workers < 1:
        raise ValueError("solutions, time_limit and workers must be positive")
    bounds = derive_capacity_bounds(roster, rules)
    model, templates, counts, assignments = build_model(roster, rules, requested_runs, min_jan_runs,
                                                       capacity_bounds=bounds)
    # Alternative layouts must differ even after ignoring role assignments.
    layout_groups = defaultdict(list)
    for template, count in zip(templates, counts):
        layout_groups[template.raid, template.difficulty, template.players].append((template, count))
    layout_counts = []
    for index, ((raid, difficulty, players), entries) in enumerate(layout_groups.items()):
        upper = min(sum(t.upper for t, _ in entries), bounds[raid, (difficulty,)].player_set_upper(players))
        count = model.new_int_var(0, upper, f"layout_count_{index}")
        model.add(count == sum(variable for _, variable in entries))
        layout_counts.append(count)
    error = model.validate()
    if error:
        raise ValueError(f"Invalid optimization model: {error}")
    results, attempts = [], []
    if progress:
        progress(f"Model: {len(templates)} run templates, {len(assignments)} character choices")
    for index in range(solutions):
        solver = cp_model.CpSolver()
        solver.parameters.max_time_in_seconds = time_limit
        solver.parameters.num_search_workers = workers
        solver.parameters.random_seed = seed + index
        if progress:
            progress(f"Searching solution {index + 1}/{solutions} (up to {time_limit:g}s)...")
        status = solver.solve(model)
        status_name = solver.status_name(status)
        attempts.append({"status": status_name, "seconds": solver.wall_time})
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            break
        runs = extract_runs(roster, templates, counts, assignments, solver, seed + index)
        validation = validate_solution(roster, runs, rules, requested_runs, min_jan_runs)
        score = score_solution(roster, runs, rules)
        if score["totalPenalty"] != round(solver.objective_value):
            raise RuntimeError("Independent score does not match the solver objective")
        selected = Counter((m["characterId"], run["raid"]) for run in runs for m in run["members"])
        omitted = [{"characterId": c.id, "player": roster.players[c.player], "name": c.name, "raid": raid}
                   for c in roster.characters for raid in RAIDS if raid in c.raids and not selected[c.id, raid]]
        result = {"status": status_name, "optimalForRemainingLayouts": status == cp_model.OPTIMAL,
                  "bestBound": solver.best_objective_bound, "solveSeconds": solver.wall_time,
                  "score": score, "validation": validation, "runs": runs, "omittedOptional": omitted}
        results.append(result)
        if progress:
            progress(f"{status_name}: {len(runs)} runs, penalty {score['totalPenalty']}, clusters {score['clusterSizes']}")
        # Exclude the player/raid/difficulty multiset, independent of roles/colors/order/characters.
        model.add_forbidden_assignments(layout_counts, [[solver.value(variable) for variable in layout_counts]])
        model.clear_hints()
        for variable in list(counts) + layout_counts + list(assignments.values()):
            model.add_hint(variable, solver.value(variable))
    results.sort(key=lambda result: result["score"]["totalPenalty"])
    return {"solutions": results, "attempts": attempts, "requestedSolutions": solutions,
            "capacityBounds": [bound.summary() for bound in bounds.values()],
            "termination": "requested_count_reached" if len(results) == solutions else (
                "no_more_layouts" if results and attempts[-1]["status"] == "INFEASIBLE" else attempts[-1]["status"].lower())}
