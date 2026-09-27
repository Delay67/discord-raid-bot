"""Generate locally optimized Serca/Cathedral layouts from a static workbook."""

import argparse
from collections import defaultdict
from dataclasses import asdict
import hashlib
import json
from pathlib import Path
import sys
from zipfile import BadZipFile

from group_roster import DEFAULT_WORKBOOK, Rules, load_roster
from group_solver import solve_roster


COLORS = ("Red", "Orange", "Gold", "Green", "Cyan", "Blue", "Indigo", "Magenta",
          "Rose", "Brown", "Gray", "Lime", "Forest", "Yellow", "Brick")


def decorate_clusters(result):
    for solution in result["solutions"]:
        by_players = defaultdict(list)
        for number, run in enumerate(solution["runs"], 1):
            key = tuple(sorted(m["player"] for m in run["members"]))
            by_players[key].append(number)
        clusters = []
        for index, (players, numbers) in enumerate(sorted(by_players.items())):
            # Always unique, even if a solution needs more colors than the palette.
            color = COLORS[index] if index < len(COLORS) else f"Color {index + 1}"
            cluster_id = f"cluster-{index + 1}"
            clusters.append({"id": cluster_id, "color": color, "players": list(players), "runNumbers": numbers})
            for number in numbers:
                solution["runs"][number - 1].update(clusterId=cluster_id, color=color)
        solution["clusters"] = clusters


def markdown_report(result):
    def escape(value):
        return str(value).replace("|", "\\|").replace("\n", " ")

    lines = ["# Group solutions", "", f"Workbook: {result['workbook']}", "",
             f"Generated {len(result['solutions'])}/{result['requestedSolutions']} solutions. "
             f"Termination: {result['termination']}.", "",
             "Lower penalty is better. FEASIBLE means valid, but optimality was not proven within the time limit.", ""]
    for warning in result["warnings"]:
        lines.extend([f"- {warning}", ""])
    if not result["solutions"]:
        lines.extend(["No valid solution was found. INFEASIBLE means the constraints conflict; UNKNOWN means the search ran out of time without a solution.", ""])
    for index, solution in enumerate(result["solutions"], 1):
        score = solution["score"]
        lines.extend([f"## Solution {index}", "",
                      f"{solution['status']} · penalty {score['totalPenalty']} · "
                      f"{score['fullRuns']} full runs · {score['partialRuns']} partial runs", "",
                      f"Cluster sizes: {', '.join(map(str, score['clusterSizes']))}", "",
                      "All hard constraints independently validated.", "",
                      "| Cluster | Players | Runs |", "|---|---|---|"])
        for cluster in solution["clusters"]:
            lines.append(f"| {cluster['color']} | {escape(', '.join(cluster['players']))} | {len(cluster['runNumbers'])} |")
        lines.append("")
        for number, run in enumerate(solution["runs"], 1):
            lines.extend([f"### {number}. {run['color']} — {run['raid']} {run['difficulty']}", "",
                          "| Player | Character | Class | Item level | Strength | Role | Source |",
                          "|---|---|---|---:|---|---|---|"])
            for member in run["members"]:
                lines.append("| " + " | ".join(escape(member[key]) for key in (
                    "player", "name", "class", "itemLevel", "strength", "role", "characterId")) + " |")
            for role in run["openSlots"]:
                lines.append(f"| Open | | | | | {role} | |")
            lines.append("")
        lines.extend(["Penalty breakdown: " + ", ".join(f"{k}={v}" for k, v in score["penalties"].items()), "",
                      "Predefined group → run: " + ", ".join(f"{k} → {v}" for k, v in sorted(solution["validation"]["predefinedRunNumbers"].items())), "",
                      "Optional participation omitted:", ""])
        for omitted in solution["omittedOptional"]:
            lines.append(f"- {escape(omitted['player'])}: {escape(omitted['name'])} ({escape(omitted['characterId'])}) — {omitted['raid']}")
        if not solution["omittedOptional"]:
            lines.append("None.")
        lines.append("")
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", nargs="?", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--solutions", type=int, default=3, help="Number of distinct layouts to search for (default: 3)")
    parser.add_argument("--runs", type=int, help="Exact total run count across both raids; otherwise chosen by the solver")
    parser.add_argument("--time-limit", type=float, default=60, help="Maximum solver seconds per solution (default: 60)")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--workers", type=int, default=8, help="Use 1 for reproducible search with a fixed seed")
    parser.add_argument("--rules", type=Path, help="JSON overrides for Rules settings and soft penalty weights")
    parser.add_argument("--output", type=Path, default=DEFAULT_WORKBOOK.parent / "group-solutions.json",
                        help="JSON result path; a Markdown report is written beside it")
    args = parser.parse_args()
    try:
        if args.output.suffix.lower() != ".json":
            raise ValueError("--output must have a .json extension")
        overrides = json.loads(args.rules.read_text(encoding="utf-8")) if args.rules else {}
        if not isinstance(overrides, dict):
            raise ValueError("Rules file must contain a JSON object")
        rules = Rules(**overrides)
        workbook_hash = hashlib.sha256(args.workbook.read_bytes()).hexdigest()
        roster = load_roster(args.workbook)
        print(f"Read {len(roster.players)} players, {len(roster.characters)} characters, "
              f"{len(roster.predefined)} predefined groups.", file=sys.stderr, flush=True)
        result = solve_roster(roster, rules, args.solutions, args.time_limit, args.seed, args.workers, args.runs,
                              progress=lambda message: print(message, file=sys.stderr, flush=True))
        result.update(workbook=str(args.workbook.resolve()), workbookSha256=workbook_hash,
                      rules=asdict(rules), warnings=roster.warnings,
                      search={"seed": args.seed, "workers": args.workers, "secondsPerSolution": args.time_limit,
                              "requestedRuns": args.runs})
        decorate_clusters(result)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report_path = args.output.with_suffix(".md")
        report_path.write_text(markdown_report(result), encoding="utf-8")
        print(f"Saved {args.output}\nSaved {report_path}", flush=True)
        return 0 if len(result["solutions"]) == args.solutions else 2
    except (OSError, ValueError, TypeError, BadZipFile) as error:
        print(f"Unable to optimize groups: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
