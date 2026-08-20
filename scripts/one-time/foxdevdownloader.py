#!/usr/bin/env python3
"""
foxdevdownloader.py

Resumable TinyFox red-panda ("wah") collector.

What it does:
- Polls TinyFox's random-image API for animal=wah.
- Downloads newly discovered media concurrently.
- Persists all state in SQLite, so rerunning resumes where it left off.
- Deduplicates downloaded media by SHA-256 content hash.
- Uses atomic .part downloads.
- Honors HTTP 429 Retry-After and exponential backoff.
- Watches TinyFox's `remaining_api_calls` field and stops before exhausting it.
- Estimates collection saturation using:
    1) rolling discovery rate, and
    2) the Chao1 unseen-species estimator.
- Exports a JSONL manifest for easy server-side use.

This can get statistically very close to the full set, but a random API cannot
prove completeness unless the service exposes an authoritative enumeration.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import random
import signal
import sqlite3
import sys
import threading
import time
from concurrent.futures import FIRST_COMPLETED, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

import requests

API_URL = "https://api.tinyfox.dev/img.json?animal=wah"
BASE_URL = "https://api.tinyfox.dev/"
DEFAULT_USER_AGENT = (
    "tinyfox-wah-mirror/1.0 "
    "(personal archival downloader; resumable, deduplicating, rate-limited)"
)

CONTENT_TYPE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/webm": ".webm",
    "video/mp4": ".mp4",
}


@dataclass
class Stats:
    samples: int
    unique_locs: int
    unique_files: int
    singleton_locs: int
    doubleton_locs: int
    recent_samples: int
    recent_new: int
    chao1_total: float
    completeness: float

    @property
    def recent_new_rate(self) -> float:
        if not self.recent_samples:
            return 1.0
        return self.recent_new / self.recent_samples


class State:
    def __init__(self, db_path: Path):
        self.lock = threading.RLock()
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        with self.lock:
            self.db.execute("PRAGMA journal_mode=WAL")
            self.db.execute("PRAGMA synchronous=NORMAL")
            self.db.executescript(
                """
                CREATE TABLE IF NOT EXISTS locations (
                    loc TEXT PRIMARY KEY,
                    hits INTEGER NOT NULL DEFAULT 0,
                    first_seen TEXT NOT NULL,
                    last_seen TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    content_sha256 TEXT,
                    file_path TEXT,
                    content_type TEXT,
                    byte_size INTEGER,
                    last_error TEXT
                );

                CREATE TABLE IF NOT EXISTS content (
                    content_sha256 TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL,
                    content_type TEXT,
                    byte_size INTEGER NOT NULL,
                    first_loc TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS samples (
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    sampled_at TEXT NOT NULL,
                    loc TEXT NOT NULL,
                    is_new INTEGER NOT NULL CHECK (is_new IN (0, 1))
                );

                CREATE INDEX IF NOT EXISTS idx_locations_status
                    ON locations(status);
                CREATE INDEX IF NOT EXISTS idx_locations_hits
                    ON locations(hits);
                CREATE INDEX IF NOT EXISTS idx_samples_seq
                    ON samples(seq);
                """
            )
            self.db.commit()

    def close(self) -> None:
        with self.lock:
            self.db.close()

    def record_sample(self, loc: str) -> bool:
        now = utc_now()
        with self.lock:
            row = self.db.execute(
                "SELECT hits FROM locations WHERE loc = ?", (loc,)
            ).fetchone()

            is_new = row is None
            if is_new:
                self.db.execute(
                    """
                    INSERT INTO locations
                        (loc, hits, first_seen, last_seen, status)
                    VALUES (?, 1, ?, ?, 'pending')
                    """,
                    (loc, now, now),
                )
            else:
                self.db.execute(
                    """
                    UPDATE locations
                    SET hits = hits + 1, last_seen = ?
                    WHERE loc = ?
                    """,
                    (now, loc),
                )

            self.db.execute(
                """
                INSERT INTO samples(sampled_at, loc, is_new)
                VALUES (?, ?, ?)
                """,
                (now, loc, 1 if is_new else 0),
            )
            self.db.commit()
            return is_new

    def pending_locations(self) -> list[str]:
        with self.lock:
            rows = self.db.execute(
                """
                SELECT loc
                FROM locations
                WHERE status != 'done'
                ORDER BY first_seen
                """
            ).fetchall()
            return [r["loc"] for r in rows]

    def mark_download_error(self, loc: str, error: str) -> None:
        with self.lock:
            self.db.execute(
                """
                UPDATE locations
                SET status = 'error', last_error = ?
                WHERE loc = ?
                """,
                (error[:2000], loc),
            )
            self.db.commit()

    def finalize_download(
        self,
        *,
        loc: str,
        sha256: str,
        proposed_file: Path,
        content_type: str | None,
        byte_size: int,
        output_dir: Path,
    ) -> tuple[Path, bool]:
        """
        Register content and atomically place the file.

        Returns (canonical_file_path, was_duplicate_content).
        """
        with self.lock:
            existing = self.db.execute(
                """
                SELECT file_path
                FROM content
                WHERE content_sha256 = ?
                """,
                (sha256,),
            ).fetchone()

            if existing:
                canonical = output_dir / existing["file_path"]
                # If the DB survived but the canonical file was manually deleted,
                # restore it from the newly downloaded bytes.
                if canonical.exists():
                    proposed_file.unlink(missing_ok=True)
                else:
                    canonical.parent.mkdir(parents=True, exist_ok=True)
                    os.replace(proposed_file, canonical)
                duplicate = True
            else:
                ext = choose_extension(content_type, loc)
                rel_path = Path("files") / f"{sha256}{ext}"
                canonical = output_dir / rel_path
                canonical.parent.mkdir(parents=True, exist_ok=True)

                if canonical.exists():
                    # The file may have been left by a previous interrupted DB commit.
                    proposed_file.unlink(missing_ok=True)
                else:
                    os.replace(proposed_file, canonical)

                self.db.execute(
                    """
                    INSERT OR IGNORE INTO content
                        (content_sha256, file_path, content_type,
                         byte_size, first_loc, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        sha256,
                        str(rel_path),
                        content_type,
                        byte_size,
                        loc,
                        utc_now(),
                    ),
                )
                duplicate = False

            canonical_rel = str(canonical.relative_to(output_dir))
            self.db.execute(
                """
                UPDATE locations
                SET status = 'done',
                    content_sha256 = ?,
                    file_path = ?,
                    content_type = ?,
                    byte_size = ?,
                    last_error = NULL
                WHERE loc = ?
                """,
                (sha256, canonical_rel, content_type, byte_size, loc),
            )
            self.db.commit()
            return canonical, duplicate

    def stats(self, window: int) -> Stats:
        with self.lock:
            row = self.db.execute(
                """
                SELECT
                    COUNT(*) AS unique_locs,
                    SUM(CASE WHEN hits = 1 THEN 1 ELSE 0 END) AS f1,
                    SUM(CASE WHEN hits = 2 THEN 1 ELSE 0 END) AS f2
                FROM locations
                """
            ).fetchone()

            samples = self.db.execute(
                "SELECT COUNT(*) AS n FROM samples"
            ).fetchone()["n"]

            unique_files = self.db.execute(
                "SELECT COUNT(*) AS n FROM content"
            ).fetchone()["n"]

            recent = self.db.execute(
                """
                SELECT COUNT(*) AS n, COALESCE(SUM(is_new), 0) AS new_count
                FROM (
                    SELECT is_new
                    FROM samples
                    ORDER BY seq DESC
                    LIMIT ?
                )
                """,
                (window,),
            ).fetchone()

        unique_locs = int(row["unique_locs"] or 0)
        f1 = int(row["f1"] or 0)
        f2 = int(row["f2"] or 0)

        # Bias-corrected Chao1 lower-bound estimate.
        if unique_locs == 0:
            chao1 = 0.0
        elif f2 > 0:
            chao1 = unique_locs + (f1 * f1) / (2.0 * f2)
        else:
            chao1 = unique_locs + (f1 * (f1 - 1)) / 2.0

        completeness = (
            unique_locs / chao1 if chao1 > 0 else 0.0
        )

        return Stats(
            samples=int(samples),
            unique_locs=unique_locs,
            unique_files=int(unique_files),
            singleton_locs=f1,
            doubleton_locs=f2,
            recent_samples=int(recent["n"] or 0),
            recent_new=int(recent["new_count"] or 0),
            chao1_total=chao1,
            completeness=completeness,
        )

    def export_manifest(self, output_dir: Path) -> Path:
        path = output_dir / "manifest.jsonl"
        temp = path.with_suffix(".jsonl.part")

        with self.lock, temp.open("w", encoding="utf-8") as f:
            rows = self.db.execute(
                """
                SELECT
                    loc, hits, first_seen, last_seen, status,
                    content_sha256, file_path, content_type,
                    byte_size, last_error
                FROM locations
                ORDER BY first_seen, loc
                """
            )
            for row in rows:
                obj = dict(row)
                obj["url"] = media_url(row["loc"])
                f.write(json.dumps(obj, ensure_ascii=False) + "\n")

        os.replace(temp, path)
        return path


_thread_local = threading.local()


def session() -> requests.Session:
    s = getattr(_thread_local, "session", None)
    if s is None:
        s = requests.Session()
        s.headers.update({"User-Agent": DEFAULT_USER_AGENT})
        _thread_local.session = s
    return s


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def media_url(loc: str) -> str:
    url = urljoin(BASE_URL, loc)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Refusing non-HTTP media URL: {url}")
    return url


def choose_extension(content_type: str | None, loc: str) -> str:
    if content_type:
        clean = content_type.split(";", 1)[0].strip().lower()
        if clean in CONTENT_TYPE_EXTENSIONS:
            return CONTENT_TYPE_EXTENSIONS[clean]
        guessed = mimetypes.guess_extension(clean)
        if guessed:
            return guessed

    suffix = Path(urlparse(loc).path).suffix.lower()
    if 1 < len(suffix) <= 8 and suffix.replace(".", "").isalnum():
        return suffix
    return ".bin"


def retry_after_seconds(response: requests.Response) -> float | None:
    value = response.headers.get("Retry-After")
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None


def get_json_with_backoff(
    url: str,
    *,
    timeout: float,
    max_retries: int,
    stop_event: threading.Event,
) -> dict[str, Any]:
    delay = 1.0
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        if stop_event.is_set():
            raise RuntimeError("Stopping")

        try:
            r = session().get(url, timeout=timeout)

            if r.status_code == 429:
                retry = retry_after_seconds(r)
                sleep_for = retry if retry is not None else delay
                print(
                    f"[api] HTTP 429; backing off for {sleep_for:.1f}s",
                    file=sys.stderr,
                )
                stop_event.wait(sleep_for)
                delay = min(delay * 2.0, 120.0)
                continue

            r.raise_for_status()
            data = r.json()
            if not isinstance(data, dict):
                raise ValueError("API returned JSON that is not an object")
            return data

        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            if attempt >= max_retries:
                break
            sleep_for = delay + random.uniform(0, delay * 0.2)
            print(
                f"[api] {type(exc).__name__}: {exc}; "
                f"retrying after {sleep_for:.1f}s",
                file=sys.stderr,
            )
            stop_event.wait(sleep_for)
            delay = min(delay * 2.0, 120.0)

    raise RuntimeError(f"API request failed after retries: {last_error}")


def download_one(
    loc: str,
    *,
    state: State,
    output_dir: Path,
    timeout: float,
    max_retries: int,
    stop_event: threading.Event,
) -> tuple[str, bool]:
    url = media_url(loc)
    tmp_dir = output_dir / ".tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    temp_name = hashlib.sha256(loc.encode("utf-8")).hexdigest() + ".part"
    temp_path = tmp_dir / temp_name

    delay = 1.0
    last_error: Exception | None = None

    for attempt in range(max_retries + 1):
        if stop_event.is_set():
            raise RuntimeError("Stopping")

        try:
            h = hashlib.sha256()
            byte_size = 0

            with session().get(url, stream=True, timeout=timeout) as r:
                if r.status_code == 429:
                    retry = retry_after_seconds(r)
                    sleep_for = retry if retry is not None else delay
                    stop_event.wait(sleep_for)
                    delay = min(delay * 2.0, 120.0)
                    continue

                r.raise_for_status()
                content_type = r.headers.get("Content-Type")

                with temp_path.open("wb") as f:
                    for chunk in r.iter_content(chunk_size=1024 * 256):
                        if stop_event.is_set():
                            raise RuntimeError("Stopping")
                        if not chunk:
                            continue
                        f.write(chunk)
                        h.update(chunk)
                        byte_size += len(chunk)

            sha256 = h.hexdigest()
            canonical, duplicate = state.finalize_download(
                loc=loc,
                sha256=sha256,
                proposed_file=temp_path,
                content_type=content_type,
                byte_size=byte_size,
                output_dir=output_dir,
            )
            return str(canonical), duplicate

        except (requests.RequestException, OSError, RuntimeError) as exc:
            last_error = exc
            temp_path.unlink(missing_ok=True)

            if stop_event.is_set():
                break
            if attempt >= max_retries:
                break

            sleep_for = delay + random.uniform(0, delay * 0.2)
            stop_event.wait(sleep_for)
            delay = min(delay * 2.0, 120.0)

    message = f"{type(last_error).__name__}: {last_error}"
    state.mark_download_error(loc, message)
    raise RuntimeError(f"Download failed for {loc}: {message}")


def print_stats(stats: Stats, window: int) -> None:
    estimated_unseen = max(0.0, stats.chao1_total - stats.unique_locs)
    print(
        "[stats] "
        f"samples={stats.samples:,}  "
        f"unique_urls={stats.unique_locs:,}  "
        f"unique_files={stats.unique_files:,}  "
        f"new_in_last_{min(window, stats.recent_samples):,}="
        f"{stats.recent_new:,} "
        f"({stats.recent_new_rate:.4%})  "
        f"Chao1≈{stats.chao1_total:,.1f}  "
        f"estimated_unseen≈{estimated_unseen:,.1f}  "
        f"estimated_completeness={stats.completeness:.4%}"
    )


def should_stop_for_saturation(args: argparse.Namespace, stats: Stats) -> bool:
    if args.no_saturation_stop:
        return False
    if stats.samples < args.min_samples:
        return False
    if stats.unique_locs < args.min_unique:
        return False
    if stats.recent_samples < args.window:
        return False

    return (
        stats.recent_new_rate <= args.stop_new_rate
        and stats.completeness >= args.min_completeness
    )


def drain_completed(
    pending: set[Future],
    *,
    block: bool = False,
) -> tuple[set[Future], int, int]:
    if not pending:
        return pending, 0, 0

    done, not_done = wait(
        pending,
        timeout=None if block else 0,
        return_when=FIRST_COMPLETED if block else FIRST_COMPLETED,
    )

    success = 0
    failures = 0
    for fut in done:
        try:
            path, duplicate = fut.result()
            success += 1
            tag = "duplicate-content" if duplicate else "saved"
            print(f"[download] {tag}: {path}")
        except Exception as exc:
            failures += 1
            print(f"[download] ERROR: {exc}", file=sys.stderr)

    return set(not_done), success, failures


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description=(
            "Resumable, SHA-256-deduplicating TinyFox red-panda collector."
        )
    )
    p.add_argument(
        "--out",
        type=Path,
        default=Path("tinyfox_wahs"),
        help="Output directory (default: ./tinyfox_wahs)",
    )
    p.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Concurrent media download workers (default: 4)",
    )
    p.add_argument(
        "--delay",
        type=float,
        default=1.0,
        help=(
            "Minimum seconds between random API samples. "
            "Keep this conservative unless TinyFox documents otherwise "
            "(default: 1.0)"
        ),
    )
    p.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="HTTP timeout in seconds (default: 30)",
    )
    p.add_argument(
        "--retries",
        type=int,
        default=5,
        help="Retries for HTTP failures (default: 5)",
    )
    p.add_argument(
        "--remaining-floor",
        type=int,
        default=5,
        help=(
            "Stop the run when API remaining_api_calls is at or below this "
            "value; rerun later to resume (default: 5)"
        ),
    )
    p.add_argument(
        "--window",
        type=int,
        default=2000,
        help="Rolling sample window for saturation detection (default: 2000)",
    )
    p.add_argument(
        "--stop-new-rate",
        type=float,
        default=0.001,
        help=(
            "Saturation requires rolling new-URL rate <= this value "
            "(default: 0.001 = 0.1%%)"
        ),
    )
    p.add_argument(
        "--min-completeness",
        type=float,
        default=0.999,
        help=(
            "Saturation also requires Chao1 estimated completeness >= this "
            "(default: 0.999 = 99.9%%)"
        ),
    )
    p.add_argument(
        "--min-samples",
        type=int,
        default=3000,
        help="Never stop for saturation before this many total samples (default: 3000)",
    )
    p.add_argument(
        "--min-unique",
        type=int,
        default=100,
        help="Never stop for saturation before this many unique URLs (default: 100)",
    )
    p.add_argument(
        "--max-api-calls",
        type=int,
        default=0,
        help="Maximum API samples this run; 0 means no per-run cap (default: 0)",
    )
    p.add_argument(
        "--stats-every",
        type=int,
        default=100,
        help="Print saturation stats every N API samples this run (default: 100)",
    )
    p.add_argument(
        "--no-saturation-stop",
        action="store_true",
        help="Disable automatic statistical saturation stopping",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()

    if args.workers < 1:
        raise SystemExit("--workers must be >= 1")
    if args.delay < 0:
        raise SystemExit("--delay must be >= 0")
    if args.window < 10:
        raise SystemExit("--window must be >= 10")
    if not (0 <= args.stop_new_rate <= 1):
        raise SystemExit("--stop-new-rate must be between 0 and 1")
    if not (0 < args.min_completeness <= 1):
        raise SystemExit("--min-completeness must be in (0, 1]")

    output_dir = args.out.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "files").mkdir(exist_ok=True)

    state = State(output_dir / "state.sqlite3")
    stop_event = threading.Event()

    def request_stop(signum: int, frame: Any) -> None:
        if not stop_event.is_set():
            print(
                f"\n[signal] received signal {signum}; stopping cleanly...",
                file=sys.stderr,
            )
            stop_event.set()

    signal.signal(signal.SIGINT, request_stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, request_stop)

    pending: set[Future] = set()
    submitted: set[str] = set()
    calls_this_run = 0
    downloads_ok = 0
    downloads_failed = 0

    try:
        initial = state.stats(args.window)
        print("[resume] Current persistent state:")
        print_stats(initial, args.window)

        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            # First retry any unfinished/error downloads from previous runs.
            for loc in state.pending_locations():
                if loc in submitted:
                    continue
                pending.add(
                    pool.submit(
                        download_one,
                        loc,
                        state=state,
                        output_dir=output_dir,
                        timeout=args.timeout,
                        max_retries=args.retries,
                        stop_event=stop_event,
                    )
                )
                submitted.add(loc)

                # Bound queued work so memory cannot grow without limit.
                if len(pending) >= args.workers * 4:
                    pending, ok, failed = drain_completed(pending, block=True)
                    downloads_ok += ok
                    downloads_failed += failed

            while not stop_event.is_set():
                if args.max_api_calls and calls_this_run >= args.max_api_calls:
                    print("[stop] Reached --max-api-calls for this run.")
                    break

                started = time.monotonic()

                try:
                    data = get_json_with_backoff(
                        API_URL,
                        timeout=args.timeout,
                        max_retries=args.retries,
                        stop_event=stop_event,
                    )
                except RuntimeError as exc:
                    if stop_event.is_set():
                        break
                    print(f"[api] ERROR: {exc}", file=sys.stderr)
                    break

                loc = data.get("loc")
                if not isinstance(loc, str) or not loc.strip():
                    print(
                        f"[api] Invalid response: missing string 'loc': {data!r}",
                        file=sys.stderr,
                    )
                    break

                loc = loc.strip()
                is_new = state.record_sample(loc)
                calls_this_run += 1

                if is_new and loc not in submitted:
                    pending.add(
                        pool.submit(
                            download_one,
                            loc,
                            state=state,
                            output_dir=output_dir,
                            timeout=args.timeout,
                            max_retries=args.retries,
                            stop_event=stop_event,
                        )
                    )
                    submitted.add(loc)

                pending, ok, failed = drain_completed(pending, block=False)
                downloads_ok += ok
                downloads_failed += failed

                while len(pending) >= args.workers * 4:
                    pending, ok, failed = drain_completed(pending, block=True)
                    downloads_ok += ok
                    downloads_failed += failed

                if (
                    calls_this_run == 1
                    or calls_this_run % args.stats_every == 0
                ):
                    stats = state.stats(args.window)
                    print_stats(stats, args.window)

                    if should_stop_for_saturation(args, stats):
                        print(
                            "[stop] Saturation criteria met: "
                            f"rolling discovery rate <= {args.stop_new_rate:.4%} "
                            f"and Chao1 completeness >= {args.min_completeness:.4%}."
                        )
                        break

                remaining = data.get("remaining_api_calls")
                try:
                    remaining_num = float(remaining)
                except (TypeError, ValueError):
                    remaining_num = None

                if remaining_num is not None and remaining_num <= args.remaining_floor:
                    print(
                        "[stop] TinyFox reports only "
                        f"{remaining} API calls remaining; preserving quota. "
                        "Rerun the same command later to resume."
                    )
                    break

                elapsed = time.monotonic() - started
                sleep_for = max(0.0, args.delay - elapsed)
                if sleep_for:
                    stop_event.wait(sleep_for)

            # Finish the small bounded set of already-submitted downloads.
            while pending:
                pending, ok, failed = drain_completed(pending, block=True)
                downloads_ok += ok
                downloads_failed += failed

    finally:
        try:
            manifest = state.export_manifest(output_dir)
            final_stats = state.stats(args.window)
            print("\n[final]")
            print_stats(final_stats, args.window)
            print(f"[final] manifest={manifest}")
            print(
                f"[final] downloads_this_run_ok={downloads_ok:,} "
                f"failed={downloads_failed:,}"
            )
        finally:
            state.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
