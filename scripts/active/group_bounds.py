"""Necessary capacity conditions; these relax, never strengthen, the raid rules.

Characters eligible for multiple difficulties are counted once in a raid-wide
band. Only mandatory characters whose ENTIRE eligibility lies in a band are
forced into it. FLEX contributes to both role capacities, but only once to seats.
"""

from collections import Counter
from dataclasses import dataclass

from group_roster import LIMITS, RAIDS, eligible_difficulties, is_required


@dataclass
class CapacityBound:
    raid: str
    difficulties: tuple
    min_runs: int
    max_runs: int
    min_vacancy_penalty: int
    possible_by_player: Counter
    possible_dps_by_player: Counter
    possible_support_by_player: Counter
    feasible: bool

    def player_set_upper(self, players):
        # Each repeated run consumes one distinct eligible character per player.
        upper = min(self.max_runs, *(self.possible_by_player[p] for p in players))
        for runs in range(upper, -1, -1):
            # A player's n selected characters require at least n-D supports,
            # and can supply at most S supports. FLEX belongs to both role
            # capacities, but the distinct-character limit above still applies.
            min_support = sum(max(0, runs - self.possible_dps_by_player[p]) for p in players)
            max_support = sum(min(runs, self.possible_support_by_player[p]) for p in players)
            if min_support <= runs and (len(players) == 3 or runs <= max_support):
                return runs
        return 0

    def summary(self):
        return {"raid": self.raid, "difficulties": list(self.difficulties),
                "minRuns": self.min_runs, "maxRuns": self.max_runs,
                "minVacancyPenalty": self.min_vacancy_penalty,
                "capacityFeasible": self.feasible}


def raid_difficulties(raid):
    return tuple(difficulty for name, difficulty in LIMITS if name == raid)


def bound_band(roster, rules, raid, difficulties):
    difficulties = tuple(difficulties)
    allowed = set(difficulties)
    possible, possible_dps, possible_support = Counter(), Counter(), Counter()
    forced, forced_dps, forced_support = Counter(), 0, 0
    for character in roster.characters:
        eligible = set(eligible_difficulties(character, raid, rules))
        if not eligible.intersection(allowed):
            continue
        possible[character.player] += 1
        if character.role in ("DPS", "Flex"):
            possible_dps[character.player] += 1
        if character.role in ("Support", "Flex"):
            possible_support[character.player] += 1
        if is_required(character, raid, rules) and eligible.issubset(allowed):
            forced[character.player] += 1
            forced_dps += character.role == "DPS"
            forced_support += character.role == "Support"

    # Every predefined row consumes a distinct run. Its named players/roles also
    # impose minima, but may overlap mandatory characters: use max, never sum.
    predefined = [g for g in roster.predefined if g.raid == raid and g.difficulty in allowed]
    predefined_players = Counter(p for g in predefined for p, _ in g.slots if p)
    predefined_dps = sum(p is not None and role == "DPS" for g in predefined for p, role in g.slots)
    predefined_support = sum(p is not None and role == "Support" for g in predefined for p, role in g.slots)
    min_player = {p: max(forced[p], predefined_players[p]) for p in roster.players}
    min_seats = sum(min_player.values())
    min_dps = max(forced_dps, predefined_dps)
    min_support = max(forced_support, predefined_support)
    lower = max((min_seats + 3) // 4, (min_dps + 2) // 3, min_support,
                max(min_player.values(), default=0), len(predefined))
    upper = min(sum(possible.values()) // 3, sum(possible_dps.values()) // 2)

    feasible_counts, vacancy_costs = [], []
    for runs in range(lower, upper + 1):
        # A player cannot provide more than one character to each of these runs.
        seat_cap = min(4 * runs, sum(min(n, runs) for n in possible.values()))
        dps_cap = min(3 * runs, sum(min(n, runs) for n in possible_dps.values()))
        support_cap = min(runs, sum(min(n, runs) for n in possible_support.values()))
        best_cost = None
        for supports in range(min_support, support_cap + 1):
            # Nonnegative vacancy weights mean using the greatest relaxed DPS
            # count is never worse for this fixed run/support count.
            dps = min(dps_cap, seat_cap - supports)
            if dps < max(min_dps, 2 * runs, 3 * runs - supports, min_seats - supports):
                continue
            missing_dps = 3 * runs - dps
            missing_support = runs - supports
            cost = rules.missing_dps * missing_dps + rules.missing_support * missing_support
            best_cost = cost if best_cost is None else min(best_cost, cost)
        if best_cost is not None:
            feasible_counts.append(runs)
            vacancy_costs.append(best_cost)
    if not feasible_counts:
        # The full model is infeasible too. Keep safe nonnegative upper bounds
        # so callers can construct it and report INFEASIBLE normally.
        return CapacityBound(raid, difficulties, lower, upper, 0, possible, possible_dps, possible_support, False)
    return CapacityBound(raid, difficulties, min(feasible_counts), max(feasible_counts),
                         min(vacancy_costs), possible, possible_dps, possible_support, True)


def derive_capacity_bounds(roster, rules):
    result = {}
    for raid in RAIDS:
        difficulties = raid_difficulties(raid)
        for band in [(d,) for d in difficulties] + [difficulties]:
            result[raid, band] = bound_band(roster, rules, raid, band)
    return result


def cluster_upper(bounds, players):
    total = 0
    for raid in RAIDS:
        difficulties = raid_difficulties(raid)
        # Across difficulties, consume each character only once per raid.
        total += min(bounds[raid, difficulties].player_set_upper(players),
                     sum(bounds[raid, (d,)].player_set_upper(players) for d in difficulties))
    return total


def add_capacity_cuts(model, templates, counts, assignments, roster, bounds, rules):
    """Redundant aggregate equalities/inequalities expose bounds to CP-SAT."""
    characters = {c.id: c for c in roster.characters}
    for index, ((raid, difficulties), bound) in enumerate(bounds.items()):
        if not bound.feasible:
            model.add(False)
            continue
        entries = [(t, v) for t, v in zip(templates, counts)
                   if t.raid == raid and t.difficulty in difficulties]
        runs = model.new_int_var(bound.min_runs, bound.max_runs, f"band_runs_{index}")
        model.add(runs == sum(v for _, v in entries))
        dps, supports = [], []
        by_player = {p: [] for p in roster.players}
        for (cid, family, difficulty, role), variable in assignments.items():
            if family == raid and difficulty in difficulties:
                (dps if role == "DPS" else supports).append(variable)
                by_player[characters[cid].player].append(variable)
        for variables in by_player.values():
            model.add(sum(variables) <= runs)
        missing_dps = sum(v for t, v in entries if len(t.players) == 3 and t.support is not None)
        missing_support = sum(v for t, v in entries if len(t.players) == 3 and t.support is None)
        model.add(sum(dps) + missing_dps == 3 * runs)
        model.add(sum(supports) + missing_support == runs)
        model.add(missing_dps + missing_support <= runs)
        model.add(rules.missing_dps * missing_dps + rules.missing_support * missing_support
                  >= bound.min_vacancy_penalty)
