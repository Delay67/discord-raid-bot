from copy import deepcopy
from contextlib import redirect_stderr, redirect_stdout
from dataclasses import asdict
import hashlib
import io
from itertools import combinations
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from ortools.sat.python import cp_model

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "active"))
from group_diversity import pairing_distance, player_pair_counts, validate_samples
from group_roster import Rules
from group_solver import solve_roster
from test_group_optimizer import char, roster


def two_group_roster():
    return roster([char(p, role) for p, role in [
        ("a", "DPS"), ("b", "DPS"), ("c", "DPS"), ("d", "Support"),
        ("e", "DPS"), ("f", "DPS"), ("g", "DPS"), ("h", "Support")]])


class PairingDistanceTests(unittest.TestCase):
    def setUp(self):
        self.value = roster([char(f"p{i}", "Support" if i % 4 == 3 else "DPS") for i in range(32)])
        self.runs = [{"raid": "Serca", "difficulty": "Nightmare", "members": [
            {"characterId": c.id, "role": c.role} for c in self.value.characters[i:i + 4]]}
            for i in range(0, 32, 4)]

    def test_one_player_swap_in_a_large_layout_is_below_default_diversity(self):
        alternative = deepcopy(self.runs)
        alternative[0]["members"][0], alternative[1]["members"][0] = (
            alternative[1]["members"][0], alternative[0]["members"][0])
        left, right = [player_pair_counts(self.value, runs) for runs in (self.runs, alternative)]
        self.assertEqual(pairing_distance(left, right), 0.125)
        samples = [{"score": {"totalPenalty": 0}, "runs": runs} for runs in (self.runs, alternative)]
        with self.assertRaisesRegex(ValueError, "player-pairing diversity"):
            validate_samples(self.value, samples, 25, 100)

    def test_roles_difficulties_colors_and_order_do_not_count_as_diversity(self):
        alternative = deepcopy(self.runs[::-1])
        for run in alternative:
            run.update(raid="Cathedral", difficulty="3", color="New color")
            run["members"].reverse()
            for member in run["members"]:
                member["role"] = "DPS" if member["role"] == "Support" else "Support"
        self.assertEqual(pairing_distance(player_pair_counts(self.value, self.runs),
                                          player_pair_counts(self.value, alternative)), 0)

    def test_padding_with_extra_runs_cannot_create_diversity(self):
        smaller = player_pair_counts(self.value, self.runs[:4])
        larger = player_pair_counts(self.value, self.runs)
        self.assertEqual(pairing_distance(smaller, larger), 0)
        self.assertEqual(pairing_distance(larger, smaller), 0)

    def test_pairings_are_weighted_by_number_of_runs(self):
        pairs = player_pair_counts(self.value, self.runs[:1] * 3)
        self.assertEqual(len(pairs), 6)
        self.assertEqual(set(pairs.values()), {3})

    def test_collection_validator_uses_best_score_not_first_score(self):
        samples = [{"score": {"totalPenalty": penalty}, "runs": self.runs}
                   for penalty in (500, 399)]
        with self.assertRaisesRegex(ValueError, "penalty gap"):
            validate_samples(self.value, samples, 0, 100)
        samples[1]["score"]["totalPenalty"] = 400
        result = validate_samples(self.value, samples, 0, 100)
        self.assertEqual(result["bestScore"], 400)
        self.assertEqual([s["scoreGapFromBest"] for s in samples], [100, 0])


class DiverseSolverTests(unittest.TestCase):
    def test_cli_resume_checks_workbook_and_rules_before_overwriting_output(self):
        import optimize_groups
        value = two_group_roster()
        saved = solve_roster(value, Rules(), solutions=1, time_limit=1, workers=1)
        with TemporaryDirectory() as directory:
            workbook = Path(directory) / "input.xlsx"
            workbook.write_bytes(b"mock workbook contents")
            output = Path(directory) / "saved.json"
            saved.update(workbookSha256=hashlib.sha256(workbook.read_bytes()).hexdigest(), rules=asdict(Rules()))
            args = ["optimize_groups.py", str(workbook), "--resume", str(output),
                    "--output", str(output), "--solutions", "1"]
            for mismatch in ("workbook", "rules", None):
                candidate = deepcopy(saved)
                if mismatch == "workbook":
                    candidate["workbookSha256"] = "different"
                if mismatch == "rules":
                    candidate["rules"]["cluster_five"] = 99
                original = json.dumps(candidate)
                output.write_text(original, encoding="utf8")
                with patch.object(sys, "argv", args), patch.object(optimize_groups, "load_roster", return_value=value), \
                        redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                    status = optimize_groups.main()
                if mismatch:
                    self.assertEqual(status, 1)
                    self.assertEqual(output.read_text(encoding="utf8"), original)
                else:
                    self.assertEqual(status, 0)
                    self.assertEqual(json.loads(output.read_text(encoding="utf8"))["solutions"][0]["source"], "saved solution")

    def test_timeout_retries_instead_of_abandoning_remaining_budget(self):
        value = two_group_roster()
        saved = solve_roster(value, Rules(), solutions=1, time_limit=1, workers=1)["solutions"]
        original_solve = cp_model.CpSolver.solve
        calls = []

        def timeout_once(solver, model, callback=None):
            calls.append(1)
            if len(calls) == 1:
                limit = solver.parameters.max_time_in_seconds
                solver.parameters.max_time_in_seconds = 1e-9
                status = original_solve(solver, model, callback)
                solver.parameters.max_time_in_seconds = limit
                self.assertEqual(status, cp_model.UNKNOWN)
                return status
            return original_solve(solver, model, callback)

        messages = []
        with patch.object(cp_model.CpSolver, "solve", timeout_once):
            result = solve_roster(value, Rules(), solutions=2, time_limit=1, workers=1,
                                  initial_solutions=saved, progress=messages.append)
        self.assertEqual(len(result["solutions"]), 2)
        self.assertEqual(result["attempts"][0]["status"], "UNKNOWN")
        self.assertTrue(any("Retrying with another seed" in m for m in messages))
        self.assertEqual(result["termination"], "requested_count_reached")

    def test_saved_candidates_are_revalidated_rescored_and_reused_without_solving(self):
        value = two_group_roster()
        saved = solve_roster(value, Rules(), solutions=3, time_limit=1, workers=1)["solutions"]
        for solution in saved:
            solution["score"]["totalPenalty"] = -1
        with patch.object(cp_model.CpSolver, "solve", side_effect=AssertionError("Unnecessary solve")):
            result = solve_roster(value, Rules(), solutions=3, initial_solutions=saved)
        self.assertEqual(len(result["solutions"]), 3)
        self.assertTrue(all(s["score"]["totalPenalty"] == 240 for s in result["solutions"]))
        self.assertTrue(all(not s["optimalForRemainingLayouts"] for s in result["solutions"]))
        saved[0]["runs"][0]["members"][0]["characterId"] = "missing"
        with self.assertRaisesRegex(ValueError, "unknown character"):
            solve_roster(value, Rules(), initial_solutions=saved)

    def test_timeout_report_explains_fewer_samples_are_not_proven_impossible(self):
        from optimize_groups import decorate_clusters, markdown_report
        value = two_group_roster()
        saved = solve_roster(value, Rules(), solutions=1, time_limit=1, workers=1)["solutions"]
        result = solve_roster(value, Rules(), solutions=2, time_limit=1e-9, workers=1,
                              initial_solutions=saved)
        result.update(workbook="test.xlsx", warnings=[])
        decorate_clusters(result)
        self.assertIn("does not prove that further variations are impossible", markdown_report(result))

    def test_finds_varied_equal_quality_samples_even_after_proving_optimality(self):
        value = two_group_roster()
        result = solve_roster(value, Rules(), solutions=3, time_limit=5, workers=1,
                              diversity_percent=25, max_score_gap=0)
        self.assertEqual(len(result["solutions"]), 3)
        self.assertTrue(all(s["status"] == "OPTIMAL" for s in result["solutions"]))
        self.assertEqual(len({s["score"]["totalPenalty"] for s in result["solutions"]}), 1)
        for a, b in combinations(result["solutions"], 2):
            self.assertGreaterEqual(pairing_distance(player_pair_counts(value, a["runs"]),
                                                     player_pair_counts(value, b["runs"])), 0.25)
        self.assertEqual(len(result["sampling"]["comparisons"]), 3)

    def test_impossible_diversity_returns_fewer_without_weakening_limits(self):
        result = solve_roster(two_group_roster(), Rules(), solutions=3, time_limit=5, workers=1,
                              diversity_percent=100, max_score_gap=0)
        self.assertEqual(len(result["solutions"]), 1)
        self.assertEqual(result["termination"], "no_more_comparable_samples")
        self.assertEqual(result["sampling"]["diversityPercent"], 100)
        self.assertEqual(result["sampling"]["maxScoreGap"], 0)

    def test_sampling_validates_controls(self):
        for setting in ({"diversity_percent": -1}, {"diversity_percent": 101},
                        {"diversity_percent": 2.5}, {"max_score_gap": -1}, {"max_score_gap": True}):
            with self.subTest(setting=setting), self.assertRaises(ValueError):
                solve_roster(two_group_roster(), Rules(), solutions=1, **setting)


if __name__ == "__main__":
    unittest.main()
