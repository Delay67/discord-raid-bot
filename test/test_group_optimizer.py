from copy import deepcopy
from dataclasses import replace
import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "active"))
from group_roster import (Character, FIELDS, Predefined, Roster, Rules, assignment_cost,
                          cluster_cost, eligible_difficulties, parse_character_rows)
from group_solver import solve_roster
from group_validation import validate_solution
from optimize_groups import decorate_clusters, markdown_report


def char(player, role="DPS", level=1750, raids=("Serca",), required=True, number=1, **kwargs):
    return Character(f"{player}!{number}", player, f"{player}{number}", "Test class", level,
                     "Strong", raids, role, kwargs.get("adapt", "no"), kwargs.get("optional", ()), required)


def roster(characters, predefined=()):
    return Roster({c.player: c.player.title() for c in characters}, characters, list(predefined), [])


def solve(value, **kwargs):
    return solve_roster(value, kwargs.pop("rules", Rules()), solutions=kwargs.pop("solutions", 1),
                        time_limit=5, workers=1, **kwargs)


def signature(solution):
    return tuple(sorted((r["raid"], r["difficulty"], tuple(sorted(m["player"] for m in r["members"])))
                        for r in solution["runs"]))


class CharacterParserTests(unittest.TestCase):
    def rows(self):
        values = ["A character", "Valkyrie", 1750, "Main", "Cath,Serca,Kaz", "FLEX", "Maybe", "Cath"]
        return [["Serca Adapt", "Unrelated title"], [], *[[None, field, value] for field, value in zip(FIELDS, values)]]

    def test_reads_character_columns_and_ignores_stray_label(self):
        character, = parse_character_rows(self.rows(), "Player", "player", True)
        self.assertEqual(character.id, "Player!C3")
        self.assertEqual(character.raids, ("Cathedral", "Serca", "Kazeros"))
        self.assertEqual(character.optional, ("Cathedral",))
        self.assertEqual(character.role, "Flex")
        self.assertEqual(character.serca_adapt, "maybe")
        self.assertEqual(character.strength, "Main")

    def test_repeated_names_are_distinct_columns(self):
        rows = self.rows()
        for row in rows[2:]:
            row.append(row[2])
        first, second = parse_character_rows(rows, "Jan", "jan", False)
        self.assertEqual(first.name, second.name)
        self.assertNotEqual(first.id, second.id)

    def test_bad_values_fail_instead_of_silently_skipping(self):
        for field, value in [("Raids", "Sreca"), ("Item Level", "nan"), ("Role", "Tank"),
                             ("Serca Adapt", "Perhaps"), ("Optional", "Other"),
                             ("Name", None), ("Strength", "=C4")]:
            with self.subTest(field=field):
                rows = self.rows()
                rows[2 + FIELDS.index(field)][2] = value
                with self.assertRaises(ValueError):
                    parse_character_rows(rows, "Player", "player", True)

    def test_optional_raid_must_be_opted_into(self):
        rows = self.rows()
        rows[2 + FIELDS.index("Raids")][2] = "Serca"
        with self.assertRaisesRegex(ValueError, "absent from Raids"):
            parse_character_rows(rows, "Player", "player", True)


class EligibilityTests(unittest.TestCase):
    def test_item_level_boundaries(self):
        for level, serca, cath in [(1719, (), ()), (1720, (), ("2",)), (1729, (), ("2",)),
                                   (1730, ("Hard",), ("2",)), (1739, ("Hard",), ("2",)),
                                   (1740, ("Nightmare",), ("2",)), (1749, ("Nightmare",), ("2",)),
                                   (1750, ("Nightmare",), ("3",))]:
            with self.subTest(level=level):
                c = char("a", level=level, raids=("Serca", "Cathedral"))
                self.assertEqual(eligible_difficulties(c, "Serca", Rules()), serca)
                self.assertEqual(eligible_difficulties(c, "Cathedral", Rules()), cath)

    def test_adapt_permissions_and_penalties(self):
        c = char("a", adapt="maybe")
        self.assertEqual(eligible_difficulties(c, "Serca", Rules()), ("Nightmare", "Hard"))
        self.assertEqual(eligible_difficulties(c, "Serca", Rules(maybe_adapt="no")), ("Nightmare",))
        self.assertGreater(sum(assignment_cost(c, "Serca", "Hard", Rules()).values()),
                           sum(assignment_cost(c, "Serca", "Hard", Rules(maybe_adapt="yes")).values()))
        self.assertEqual(eligible_difficulties(replace(c, serca_adapt="yes"), "Serca", Rules()), ("Nightmare", "Hard"))

    def test_cathedral_is_always_locked_to_highest_difficulty(self):
        c = char("a", raids=("Cathedral",))
        self.assertEqual(eligible_difficulties(c, "Cathedral", Rules()), ("3",))
        self.assertEqual(eligible_difficulties(c, "Serca", Rules()), ())

    def test_cluster_preference_order(self):
        rules = Rules()
        self.assertEqual(cluster_cost(3, rules), cluster_cost(4, rules))
        self.assertLess(cluster_cost(3, rules), cluster_cost(2, rules))
        self.assertEqual(cluster_cost(2, rules), 35)
        self.assertEqual(cluster_cost(5, rules), 25)
        self.assertLess(cluster_cost(3, rules), cluster_cost(5, rules))
        self.assertLess(cluster_cost(5, rules), cluster_cost(2, rules))
        self.assertLess(cluster_cost(5, rules), cluster_cost(1, rules))
        self.assertLessEqual(cluster_cost(1, rules), cluster_cost(6, rules))
        self.assertLess(cluster_cost(6, rules), cluster_cost(7, rules))


class SolverTests(unittest.TestCase):
    def test_full_run_and_each_character_can_do_both_raids(self):
        value = roster([char(p, role, raids=("Serca", "Cathedral")) for p, role in
                        [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")]])
        result = solve(value)["solutions"][0]
        self.assertEqual(result["score"]["fullRuns"], 2)
        self.assertEqual(result["validation"]["mandatoryParticipations"], 8)
        self.assertEqual(result["score"]["clusterSizes"], [2])

    def test_flex_can_be_support_or_dps(self):
        for support in (True, False):
            with self.subTest(support=support):
                value = roster([char("a"), char("b"), char("c", "DPS" if support else "Support"), char("flex", "Flex")])
                result = solve(value)["solutions"][0]
                member = next(m for m in result["runs"][0]["members"] if m["player"] == "Flex")
                self.assertEqual(member["role"], "Support" if support else "DPS")

    def test_optional_support_fills_full_run(self):
        value = roster([char("a"), char("b"), char("c"), char("d", "Support", required=False)])
        result = solve(value)["solutions"][0]
        self.assertEqual(result["score"]["fullRuns"], 1)
        self.assertEqual(result["score"]["penalties"]["optionalUse"], 1)

    def test_three_player_runs_and_vacancy_preference(self):
        results = []
        for role in ("DPS", "Support"):
            value = roster([char("a"), char("b"), char("c", role)])
            results.append(solve(value)["solutions"][0])
        self.assertEqual(results[0]["runs"][0]["openSlots"], ["Support"])
        self.assertEqual(results[1]["runs"][0]["openSlots"], ["DPS"])
        self.assertGreater(results[0]["score"]["totalPenalty"], results[1]["score"]["totalPenalty"])

    def test_same_player_cannot_fill_two_slots(self):
        value = roster([char("a"), char("a", number=2), char("b"), char("c", "Support")])
        result = solve(value)
        self.assertEqual(result["solutions"], [])
        self.assertEqual(result["termination"], "infeasible")

    def test_jan_requires_nonna_but_nonna_does_not_require_jan(self):
        value = roster([char("a"), char("b"), char("nonna", "Support"), char("jan", required=False)])
        result = solve(value)["solutions"][0]
        self.assertEqual(result["score"]["fullRuns"], 1)
        without_nonna = roster([char("a"), char("b"), char("d", "Support"), char("jan", required=False)])
        result = solve(without_nonna)["solutions"][0]
        self.assertTrue(all(m["player"] != "Jan" for r in result["runs"] for m in r["members"]))
        nonna_only = roster(value.characters[:3])
        self.assertEqual(len(solve(nonna_only)["solutions"]), 1)

    def test_predefined_wildcard_and_multiplicity(self):
        group = Predefined("Serca", "Nightmare", (("a", "DPS"), ("b", "DPS"), ("c", "DPS"), (None, "Support")))
        characters = [char(p, role, number=n) for p, role in [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")]
                      for n in (1, 2)]
        result = solve(roster(characters, [group, group]))["solutions"][0]
        self.assertEqual(len(result["runs"]), 2)
        self.assertEqual(len(set(result["validation"]["predefinedRunNumbers"].values())), 2)
        impossible = roster(characters[::2], [group, group])
        self.assertEqual(solve(impossible)["termination"], "infeasible")

    def test_jan_minimum_is_hard_and_counts_both_raid_families(self):
        value = roster([char(p, role, raids=("Serca", "Cathedral"), required=p != "jan")
                        for p, role in [("a", "DPS"), ("b", "DPS"), ("nonna", "Support"), ("jan", "DPS")]])
        rules = Rules(optional_use=10000)
        baseline = solve(value, rules=rules)["solutions"][0]
        self.assertEqual(baseline["validation"]["janRuns"], 0)
        result = solve(value, rules=rules, min_jan_runs=2)["solutions"][0]
        self.assertEqual(result["validation"]["janRuns"], 2)
        self.assertEqual(result["validation"]["minJanRuns"], 2)
        self.assertEqual({r["raid"] for r in result["runs"]}, {"Serca", "Cathedral"})
        self.assertTrue(all({"Jan", "Nonna"}.issubset({m["player"] for m in r["members"]}) for r in result["runs"]))

    def test_jan_minimum_never_relaxes_other_hard_rules(self):
        value = roster([char("a"), char("b"), char("nonna", "Support"), char("jan", required=False)])
        self.assertEqual(solve(value, min_jan_runs=2)["termination"], "infeasible")
        value.characters[2] = replace(value.characters[2], player="d")
        self.assertEqual(solve(roster(value.characters), min_jan_runs=1)["termination"], "infeasible")

    def test_jan_minimum_when_jan_is_absent(self):
        value = roster([char("a"), char("b"), char("c", "Support")])
        self.assertEqual(solve(value, min_jan_runs=0)["solutions"][0]["validation"]["janRuns"], 0)
        self.assertEqual(solve(value, min_jan_runs=1)["termination"], "infeasible")

    def test_jan_minimum_rejects_negative_and_noninteger_values(self):
        value = roster([char("a"), char("b"), char("c", "Support")])
        for minimum in (-1, 1.5, True):
            with self.subTest(minimum=minimum), self.assertRaisesRegex(ValueError, "nonnegative integer"):
                solve(value, min_jan_runs=minimum)

    def test_predefined_role_is_hard(self):
        group = Predefined("Serca", "Nightmare", (("a", "Support"), ("b", "DPS"), ("c", "DPS"), (None, "DPS")))
        with self.assertRaisesRegex(ValueError, "Predefined group 1"):
            solve(roster([char("a"), char("b"), char("c"), char("d", "Support")], [group]))

    def test_serca_downgrade_permission_changes_feasibility(self):
        value = roster([char(p, level=1730) for p in ("a", "b", "c")] +
                       [char("d", "Support", level=1740, adapt="yes")])
        self.assertEqual(solve(value)["solutions"][0]["score"]["fullRuns"], 1)
        value.characters[-1] = replace(value.characters[-1], serca_adapt="no")
        self.assertEqual(solve(value)["termination"], "infeasible")

    def test_cathedral_never_downgrades_to_make_a_solution_feasible(self):
        value = roster([char(p, level=1720, raids=("Cathedral",)) for p in ("a", "b", "c")] +
                       [char("d", "Support", level=1750, raids=("Cathedral",))])
        self.assertEqual(solve(value)["termination"], "infeasible")

    def test_clustering_prefers_repeated_player_sets(self):
        value = roster([char(p, role, number=n) for p, role in
                        [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support"),
                         ("e", "DPS"), ("f", "DPS"), ("g", "DPS"), ("h", "Support")]
                        for n in (1, 2, 3)])
        result = solve(value)["solutions"][0]
        self.assertEqual(result["score"]["clusterSizes"], [3, 3])
        self.assertEqual(result["score"]["totalPenalty"], 0)

    def test_character_optional_can_be_omitted_and_can_be_made_mandatory(self):
        value = roster([char("a"), char("b"), char("c", "Support"), char("d", level=1720, optional=("Serca",))])
        result = solve(value)["solutions"][0]
        self.assertEqual(result["omittedOptional"][0]["characterId"], "d!1")
        with self.assertRaisesRegex(ValueError, "below the minimum"):
            solve(value, rules=Rules(character_optional=False))

    def test_explicit_run_count_does_not_drop_mandatory_characters(self):
        value = roster([char(p, role, number=n) for p, role in
                        [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")] for n in (1, 2)])
        result = solve(value, requested_runs=2)["solutions"][0]
        self.assertEqual(len(result["runs"]), 2)
        with self.assertRaisesRegex(ValueError, "coverage bounds"):
            solve(value, requested_runs=1)

    def test_distinct_layouts_are_not_just_reordering_or_recoloring(self):
        value = roster([char(p, role) for p, role in
                        [("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support"),
                         ("e", "DPS"), ("f", "DPS"), ("g", "DPS"), ("h", "Support")]])
        result = solve(value, solutions=3)
        self.assertEqual(len(result["solutions"]), 3)
        self.assertEqual(len({signature(s) for s in result["solutions"]}), 3)

    def test_reports_exhausted_layouts_honestly(self):
        result = solve(roster([char("a"), char("b"), char("c", "Support")]), solutions=2)
        self.assertEqual(len(result["solutions"]), 1)
        self.assertEqual(result["termination"], "no_more_comparable_samples")

    def test_role_swaps_alone_are_not_new_layouts(self):
        value = roster([char("a"), char("b"), char("c", "Flex"), char("d", "Flex")])
        result = solve(value, solutions=2)
        self.assertEqual(len(result["solutions"]), 1)
        self.assertEqual(result["termination"], "no_more_comparable_samples")

    def test_timeout_is_not_reported_as_infeasible(self):
        value = roster([char("a"), char("b"), char("c", "Support")])
        result = solve_roster(value, Rules(), solutions=1, time_limit=1e-9, workers=1)
        self.assertEqual(result["solutions"], [])
        self.assertEqual(result["termination"], "unknown")

    def test_output_colors_match_exact_player_sets(self):
        result = solve(roster([char("a", raids=("Serca", "Cathedral")), char("b", raids=("Serca", "Cathedral")),
                               char("c", "Support", raids=("Serca", "Cathedral"))]))
        decorate_clusters(result)
        solution = result["solutions"][0]
        self.assertEqual(len(solution["clusters"]), 1)
        self.assertEqual(solution["runs"][0]["color"], solution["runs"][1]["color"])
        result.update(workbook="test.xlsx", warnings=[])
        self.assertIn("All hard constraints independently validated", markdown_report(result))
        self.assertIn("Jan participation: 0 runs (minimum required: 0)", markdown_report(result))


class ValidatorTests(unittest.TestCase):
    def setUp(self):
        self.roster = roster([char("a"), char("b"), char("c"), char("d", "Support")])
        self.runs = [{"raid": "Serca", "difficulty": "Nightmare", "members": [
            {"characterId": c.id, "role": c.role} for c in self.roster.characters]}]

    def test_rejects_reused_character(self):
        with self.assertRaisesRegex(ValueError, "multiple Serca"):
            validate_solution(self.roster, self.runs * 2, Rules())

    def test_rejects_unmet_jan_minimum(self):
        with self.assertRaisesRegex(ValueError, "Jan must appear in at least 1 runs; found 0"):
            validate_solution(self.roster, self.runs, Rules(), min_jan_runs=1)

    def test_rejects_missing_mandatory_character(self):
        self.runs[0]["members"].pop()
        with self.assertRaisesRegex(ValueError, "Missing mandatory"):
            validate_solution(self.roster, self.runs, Rules())

    def test_rejects_illegal_role_and_downgrade(self):
        for mutation in ("role", "difficulty"):
            with self.subTest(mutation=mutation):
                runs = deepcopy(self.runs)
                if mutation == "role":
                    runs[0]["members"][0]["role"] = "Support"
                else:
                    runs[0]["difficulty"] = "Hard"
                with self.assertRaises(ValueError):
                    validate_solution(self.roster, runs, Rules())

    def test_rejects_jan_without_nonna(self):
        self.roster.characters[0] = replace(self.roster.characters[0], player="jan")
        with self.assertRaisesRegex(ValueError, "Jan requires Nonna"):
            validate_solution(self.roster, self.runs, Rules())

    def test_rejects_four_dps_even_when_each_character_role_is_valid(self):
        self.roster.characters[-1] = replace(self.roster.characters[-1], role="DPS")
        self.runs[0]["members"][-1]["role"] = "DPS"
        with self.assertRaisesRegex(ValueError, "capacity"):
            validate_solution(self.roster, self.runs, Rules())

    def test_predefined_rows_cannot_reuse_one_run(self):
        group = Predefined("Serca", "Nightmare", (("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support")))
        self.roster.predefined = [group, group]
        with self.assertRaisesRegex(ValueError, "distinct matching run"):
            validate_solution(self.roster, self.runs, Rules())


if __name__ == "__main__":
    unittest.main()
