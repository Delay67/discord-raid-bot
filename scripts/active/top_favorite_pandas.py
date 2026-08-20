#!/usr/bin/env python3
"""Print the highest-scoring red pandas from the bot's favorites data."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


DEFAULT_DATA_FILE = (
    Path(__file__).resolve().parents[2] / "data" / "redpanda-favorites.json"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Show the red pandas with the highest favorite scores."
    )
    parser.add_argument(
        "--data-file",
        type=Path,
        default=DEFAULT_DATA_FILE,
        help=f"path to redpanda-favorites.json (default: {DEFAULT_DATA_FILE})",
    )
    parser.add_argument(
        "--guild-id",
        help="only include scores from this Discord server",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=10,
        help="number of pandas to show (default: 10)",
    )
    return parser.parse_args()


def load_scores(data_file: Path) -> list[dict[str, Any]]:
    try:
        with data_file.open(encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError:
        raise ValueError(f"favorites data file not found: {data_file}") from None
    except json.JSONDecodeError as error:
        raise ValueError(
            f"favorites data is not valid JSON: {data_file} "
            f"(line {error.lineno}, column {error.colno})"
        ) from None
    except OSError as error:
        raise ValueError(f"could not read {data_file}: {error}") from None

    scores = data.get("scores", {}) if isinstance(data, dict) else {}
    if not isinstance(scores, dict):
        raise ValueError(f"'scores' must be an object in {data_file}")

    return [entry for entry in scores.values() if isinstance(entry, dict)]


def get_leaders(
    scores: list[dict[str, Any]], guild_id: str | None, limit: int
) -> list[tuple[str, int]]:
    totals: dict[str, int] = {}

    for entry in scores:
        if guild_id is not None and str(entry.get("guildId")) != guild_id:
            continue

        media = entry.get("media")
        score = entry.get("score")
        if not isinstance(media, str) or not isinstance(score, (int, float)):
            continue
        if isinstance(score, bool) or score <= 0:
            continue

        totals[media] = totals.get(media, 0) + int(score)

    return sorted(totals.items(), key=lambda item: (-item[1], item[0]))[:limit]


def print_leaders(leaders: list[tuple[str, int]]) -> None:
    if not leaders:
        print("No favorite red pandas with a positive score were found.")
        return

    rank_width = len(str(len(leaders)))
    score_width = max(5, *(len(str(score)) for _, score in leaders))
    print(f"{'#':>{rank_width}}  {'Score':>{score_width}}  Panda")
    print(f"{'-' * rank_width}  {'-' * score_width}  {'-' * 5}")
    for rank, (media, score) in enumerate(leaders, start=1):
        print(f"{rank:>{rank_width}}  {score:>{score_width}}  {media}")


def main() -> int:
    args = parse_args()
    if args.limit < 1:
        print("error: --limit must be at least 1", file=sys.stderr)
        return 2

    try:
        scores = load_scores(args.data_file.expanduser())
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print_leaders(get_leaders(scores, args.guild_id, args.limit))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
