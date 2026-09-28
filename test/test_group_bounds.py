"""Check the bounds against exhaustively enumerated small concrete layouts."""

from collections import Counter
from dataclasses import replace
from itertools import combinations, product
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "active"))
from group_bounds import bound_band, cluster_upper, derive_capacity_bounds
from group_roster import LIMITS, RAIDS, Predefined, Rules, eligible_difficulties
from group_solver import solve_roster
from group_validation import score_solution, validate_solution
from test_group_optimizer import char, roster


def concrete_layouts(value, rules, min_jan_runs=0):
    """Enumerate character combinations, not solver templates or pool counts."""
    family_layouts = []
    for raid in RAIDS:
        candidates = []
        eligible = [c for c in value.characters if eligible_difficulties(c, raid, rules)]
        for size in (3, 4):
            for members in combinations(eligible, size):
                players = {c.player for c in members}
                if len(players) != size or ("jan" in players and "nonna" not in players):
                    continue
                for family, difficulty in LIMITS:
                    if family != raid or not all(difficulty in eligible_difficulties(c, raid, rules) for c in members):
                        continue
                    for roles in product(*[("DPS", "Support") if c.role == "Flex" else (c.role,) for c in members]):
                        if roles.count("DPS") > 3 or roles.count("Support") > 1:
                            continue
                        candidates.append({"raid": raid, "difficulty": difficulty, "members": [
                            {"characterId": c.id, "role": role} for c, role in zip(members, roles)]})
        layouts = [[]]
        for size in range(1, len(eligible) // 3 + 1):
            for runs in combinations(candidates, size):
                ids = [m["characterId"] for run in runs for m in run["members"]]
                if len(ids) == len(set(ids)):
                    layouts.append(list(runs))
        family_layouts.append(layouts)
    for pieces in product(*family_layouts):
        runs = sum(pieces, [])
        if not runs:
            continue
        try:
            validate_solution(value, runs, rules, min_jan_runs=min_jan_runs)
        except ValueError:
            continue
        yield runs


class CapacityBoundsTests(unittest.TestCase):
    def test_player_restrictions_prove_cathedral_vacancy_floor(self):
        # Nonna needs three separate runs. Eight mandatory seats plus one
        # optional seat force three partial runs, not two full runs.
        value = roster([
            char("nonna", "Support", level=1730, raids=("Cathedral",)),
            char("nonna", level=1730, raids=("Cathedral",), number=2),
            char("nonna", level=1740, raids=("Cathedral",), number=3),
            char("a", level=1730, raids=("Cathedral",)),
            char("a", level=1730, raids=("Cathedral",), number=2),
            char("b", level=1730, raids=("Cathedral",)),
            char("c", level=1730, raids=("Cathedral",)),
            char("d", level=1730, raids=("Cathedral",)),
            char("e", level=1730, raids=("Cathedral",), required=False),
        ])
        bound = bound_band(value, Rules(), "Cathedral", ("2",))
        self.assertTrue(bound.feasible)
        self.assertEqual((bound.min_runs, bound.max_runs), (3, 3))
        self.assertEqual(bound.min_vacancy_penalty, 3200)
        cheaper = bound_band(value, Rules(missing_dps=5, missing_support=7), "Cathedral", ("2",))
        self.assertEqual(cheaper.min_vacancy_penalty, 19)

    def test_adaptable_characters_are_not_forced_into_both_difficulties(self):
        value = roster([char("a", adapt="yes"), char("b", adapt="maybe"), char("c", "Support", adapt="yes")])
        bounds = derive_capacity_bounds(value, Rules())
        self.assertEqual(bounds["Serca", ("Nightmare",)].min_runs, 0)
        self.assertEqual(bounds["Serca", ("Hard",)].min_runs, 0)
        self.assertEqual(bounds["Serca", ("Nightmare", "Hard")].min_runs, 1)
        self.assertEqual(bounds["Serca", ("Nightmare", "Hard")].max_runs, 1)
        self.assertEqual(cluster_upper(bounds, ("a", "b", "c")), 1)

    def test_flex_counts_once_as_a_character_but_can_fill_either_role(self):
        value = roster([char(p, "Flex") for p in ("a", "b", "c", "d")])
        bound = bound_band(value, Rules(), "Serca", ("Nightmare",))
        self.assertEqual((bound.min_runs, bound.max_runs, bound.min_vacancy_penalty), (1, 1, 0))

    def test_support_heavy_roster_cannot_form_extra_runs(self):
        value = roster([char("a"), char("b"), *[char(p, "Support", required=False) for p in ("c", "d", "e", "f")]])
        bound = bound_band(value, Rules(), "Serca", ("Nightmare",))
        self.assertEqual(bound.max_runs, 1)

    def test_repeated_full_cluster_is_limited_by_its_own_support_pool(self):
        characters = [char(p, number=n) for p in ("a", "b", "c", "d") for n in (1, 2, 3)]
        characters.append(char("a", "Flex", number=4))
        characters.extend(char("outside", "Support", number=n, required=False) for n in (1, 2, 3, 4))
        bound = bound_band(roster(characters), Rules(), "Serca", ("Nightmare",))
        self.assertGreater(bound.max_runs, 1)
        self.assertEqual(bound.player_set_upper(("a", "b", "c", "d")), 1)
        self.assertEqual(bound.player_set_upper(("b", "c", "d")), 3)

    def test_empty_optional_band_may_use_zero_runs(self):
        value = roster([char("a", required=False)])
        bound = bound_band(value, Rules(), "Serca", ("Nightmare",))
        self.assertTrue(bound.feasible)
        self.assertEqual((bound.min_runs, bound.max_runs, bound.min_vacancy_penalty), (0, 0, 0))

    def test_predefined_and_required_participation_are_not_added_twice(self):
        group = Predefined("Serca", "Nightmare", (("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")))
        value = roster([char("a"), char("b"), char("c"), char("d", "Support")], [group])
        bound = bound_band(value, Rules(), "Serca", ("Nightmare",))
        self.assertTrue(bound.feasible)
        self.assertEqual((bound.min_runs, bound.max_runs), (1, 1))

    def test_all_small_valid_layouts_survive_bounds_and_optima_match_enumeration(self):
        repeated = [char(p, role, number=n) for p, role in [("a", "DPS"), ("b", "DPS"), ("c", "Flex")]
                    for n in (1, 2)]
        adapted = [replace(c, serca_adapt="yes", required_player=c.id != "a!2") for c in repeated]
        predefined = Predefined("Serca", "Nightmare", (("a", "DPS"), ("b", "DPS"), ("c", "DPS"), (None, "Support")))
        fixed = [char(p, role, number=n) for p, role in [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")]
                 for n in (1, 2)]
        jan = [char(p, role, number=n, required=p != "jan") for p, role in
               [("a", "DPS"), ("b", "DPS"), ("nonna", "Support"), ("jan", "DPS")] for n in (1, 2)]
        cathedral = [char(p, role, number=n, level=level, raids=("Cathedral",))
                     for p, role in [("a", "DPS"), ("b", "DPS"), ("c", "Support")]
                     for n, level in [(1, 1730), (2, 1750)]]
        both_raids = [char(p, role, raids=RAIDS) for p, role in
                      [("a", "DPS"), ("b", "DPS"), ("c", "Flex"), ("d", "Flex")]]
        fixtures = [(roster(repeated), 0), (roster(adapted), 0), (roster(fixed, [predefined, predefined]), 0),
                    (roster(jan), 1), (roster(cathedral), 0), (roster(both_raids), 0)]
        checked = 0
        for fixture, (value, jan_min) in enumerate(fixtures):
            with self.subTest(fixture=fixture):
                rules = Rules()
                bounds = derive_capacity_bounds(value, rules)
                characters = {c.id: c for c in value.characters}
                optimum = None
                fixture_count = 0
                for runs in concrete_layouts(value, rules, jan_min):
                    fixture_count += 1
                    clusters = Counter(tuple(sorted(characters[m["characterId"]].player for m in run["members"])) for run in runs)
                    for players, count in clusters.items():
                        self.assertLessEqual(count, cluster_upper(bounds, players))
                    for (raid, difficulties), bound in bounds.items():
                        subset = [r for r in runs if r["raid"] == raid and r["difficulty"] in difficulties]
                        self.assertTrue(bound.feasible)
                        self.assertLessEqual(bound.min_runs, len(subset))
                        self.assertLessEqual(len(subset), bound.max_runs)
                        costs = score_solution(value, subset, rules)["penalties"]
                        self.assertLessEqual(bound.min_vacancy_penalty, costs["vacancies"])
                        layouts = Counter(tuple(sorted(characters[m["characterId"]].player for m in r["members"])) for r in subset)
                        for players, count in layouts.items():
                            self.assertLessEqual(count, bound.player_set_upper(players))
                    score = score_solution(value, runs, rules)["totalPenalty"]
                    optimum = score if optimum is None else min(optimum, score)
                self.assertGreater(fixture_count, 0)
                checked += fixture_count
                result = solve_roster(value, rules, solutions=1, time_limit=5, workers=1, min_jan_runs=jan_min)
                self.assertEqual(result["solutions"][0]["status"], "OPTIMAL")
                self.assertEqual(result["solutions"][0]["score"]["totalPenalty"], optimum)
        self.assertGreater(checked, 100)


if __name__ == "__main__":
    unittest.main()
