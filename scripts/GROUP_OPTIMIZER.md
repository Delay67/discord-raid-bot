# Local group optimizer

The optimizer reads `data/staticsheet.xlsx` and generates complete alternative
layouts for Serca and Cathedral. It uses [Google OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)
locally. No LLM, Discord connection, API key, or network request is involved in
parsing, solving, or validating a layout.

## Run

Requires Python 3.10 or newer.

```sh
python -m pip install -r scripts/active/requirements.txt
python scripts/active/optimize_groups.py --solutions 3 --time-limit 60
```

The default workbook path is relative to the project, independent of the current
working directory. Supply another workbook as the first argument:

```sh
python scripts/active/optimize_groups.py path/to/staticsheet.xlsx --solutions 5 --time-limit 120 --output data/my-groups.json
```

Outputs are JSON plus a readable Markdown report at the same path with a `.md`
extension. Each contains concrete characters, assigned roles, raid difficulties,
clusters/colors, scores, omitted optional entries, and validation results. JSON
also records the workbook SHA-256, active rules, solver settings, solve status,
and objective bound. The input workbook and the bot's saved raids are not changed.

`--solutions` is the desired number of complete alternative layouts.
`--runs N` optionally imposes an exact total number of runs across both raids in
each layout. Without it, the optimizer chooses the number needed to cover the
mandatory entries and improve the preferences. A requested count never permits
dropping mandatory characters. Impossible counts fail or return INFEASIBLE.

`--time-limit` is seconds **per solution**, excluding workbook loading/model
construction. The total search may take approximately `solutions × time-limit`.
`--workers` defaults to 8. Use `--workers 1 --seed 42` to reduce nondeterminism;
wall-clock cutoffs can still change results between runs/machines.

Exit codes: `0` means the requested number was generated, `1` means invalid input
or an execution error, and `2` means fewer layouts were found. In the last case,
the report distinguishes proven infeasibility/exhausted alternatives from a
search timeout. A timeout is never reported as proof that the rules are impossible.

## Workbook input

Only `Setup` and the character sheets for its required/optional members are read.
Sheet names match member names case-insensitively. Duplicate membership entries,
missing member sheets, malformed character tables, unknown raid tokens, and
invalid item levels/roles cause explicit errors.

`Setup` contains the headers `Required Members`, `Optional Members`, and
`Predefined Groups`. The predefined table has four adjacent role columns,
normally `DPS`, `DPS`, `DPS`, `SUP`. Each row specifies a raid/difficulty followed
by player names. Blank player cells are wildcards.

Each character sheet has the following row labels in one column, with each
character occupying a column to the right:

| Row | Meaning |
|---|---|
| Name | Character display name |
| Class | Preserved in output; no class-specific constraint yet |
| Item Level | Numeric eligibility value |
| Strength | Preserved in output; no strength-scoring rule yet |
| Raids | Comma, semicolon, slash, or newline-separated opt-ins |
| Role | `DPS`, `SUP`/`Support`, or `FLEX` |
| Serca Adapt | `Yes`, `No`, `Maybe`, or blank |
| Optional | Raid opt-ins that may be skipped |

Raid tokens are `Serca`, `Cath`/`Cathedral`, and `Kaz`/`Kazeros`, ignoring case.
Kazeros is recognized but excluded from this optimizer. Blank Raids means the
character is not opted into any run. Optional entries must also appear in Raids.
Character cells must contain plain values: formulas and Excel errors are rejected
instead of relying on possibly stale cached values.

Character identity is the worksheet and Name-cell coordinate, e.g. `Jan!C3`.
This preserves the workbook's five separate `JanDPS` columns as five characters.
Repeated display names are reported as warnings. Reordering columns changes
these IDs; solutions should be interpreted against their recorded workbook hash.

## Hard constraints

- Every run has 3 or 4 distinct players, each using one distinct character.
  Four-player runs have exactly 3 DPS and 1 Support. Three-player runs have either
  3 DPS or 2 DPS plus 1 Support.
- FLEX characters are assigned one concrete role per run. A character may use
  different roles in its Serca and Cathedral runs.
- Each character appears at most once per raid family, across all difficulties.
  It can appear once in Serca and once in Cathedral.
- Item-level minima: Serca Nightmare 1740, Serca Hard 1730,
  Cathedral 3 1750, Cathedral 2 1720.
- Cathedral always uses the character's highest eligible difficulty: 1750+
  characters must run level 3 and cannot fill level 2 runs.
- All opted-in, non-optional entries of required members must appear. Mandatory
  entries below a raid's minimum level fail explicitly; they are not skipped.
  Optional members can contribute any subset of their opted-in characters.
- Every predefined row must match a **distinct** run at its specified difficulty,
  with the named players in the specified roles. Overlapping or identical rows
  cannot share one run. An unnamed slot may be filled by any eligible other
  player, or remain open in a valid three-player run.
- Jan may appear only in a run containing Nonna. Nonna does not require Jan.

## Workbook interpretations

The workbook fields have the following meanings:

- A character defaults to the highest difficulty its item level permits.
- `Serca Adapt = Yes` permits Nightmare → Hard with a downgrade penalty.
  Blank/No forbids it. Maybe permits it with an additional penalty.
- Cathedral 3 characters cannot run level 2.
- A required member's Optional raid can be skipped. Other opted-in raids for
  that character remain mandatory.
- A three-player cluster is its actual set of three players; it is not merged
  with a four-player cluster merely because the latter contains those players.

Override settings/weights with `--rules path/to/rules.json`. For example:

```json
{
  "maybe_adapt": "penalize",
  "character_optional": true,
  "missing_dps": 1000,
  "missing_support": 1100,
  "cluster_good": 35,
  "cluster_bad": 120,
  "cluster_excess": 40,
  "downgrade": 20,
  "maybe_downgrade": 100,
  "optional_use": 1
}
```

All fields are optional overrides. `maybe_adapt` accepts `penalize` (default),
`yes`, or `no`. Unknown settings are errors. Weights must be nonnegative integers.

## Soft score

The solver minimizes the sum of penalties; hard constraints cannot be traded
away for a better score. Defaults:

| Preference | Penalty |
|---|---:|
| Full run | 0 |
| Three-player run missing DPS | 1000 |
| Three-player run missing Support | 1100 |
| Cluster with 3 or 4 runs | 0 |
| Cluster with 2 or 5 runs | 35 |
| Singleton cluster | 120 |
| Cluster with 6+ runs | 120 + 40 per run above 6 |
| Each allowed Serca Nightmare → Hard downgrade | 20 |
| Serca downgrade with Maybe, in penalize mode | Additional 100 |
| Each optional character/raid participation used | 1 |

The small optional-use cost avoids adding unnecessary characters solely because
they are available; it is outweighed by completing a run or improving a cluster.
These are weighted preferences, not a strict lexicographic ranking. A full run is
strongly preferred, but enough improvements elsewhere can outweigh a vacancy.
Colors are assigned to exact player sets across both raid families and do not
affect the score. Color IDs remain unique when more clusters than named colors
are needed.

## Model and independent checks

The model enumerates legal player/role/difficulty run templates and chooses an
integer count for each. Separately, each character chooses at most one
difficulty/role per raid. Equalities connect those choices to the required player
pools in the selected templates. This is exact for the implemented rules:
characters in the same player/difficulty/role pool are interchangeable. It avoids
enumerating every four-character combination.

Adding future rules about interactions between specific characters, classes, or
strengths may require extending the model beyond these interchangeable pools.
Such rules must be encoded explicitly; workbook prose is never interpreted.

After solving, characters are allocated from the chosen pools. A separate
validator checks each concrete run, all mandatory coverage, and a one-to-one
matching of predefined groups to runs. It recomputes the score and requires exact
agreement with the solver's objective before any solution is exported.

For each subsequent alternative, a constraint excludes the previous entire
multiset of player/raid/difficulty combinations. Reordering runs, changing
colors, swapping roles, or shuffling characters within those same combinations
does not count as a new layout. The optimizer may return fewer alternatives when layouts are
exhausted or the next search times out. Results are sorted by penalty.

`OPTIMAL` means the solver proved the best score for the layouts still allowed
in that search. `FEASIBLE` means every hard rule holds, but optimality was not
proven. Later searches exclude earlier layouts, so their optimality flags are
explicitly labeled `optimalForRemainingLayouts`.

## Tests

```sh
python -m unittest discover -s test -p "test_*.py"
```

Tests cover table parsing, eligibility boundaries, adaptation, FLEX, optional
coverage, player uniqueness, Jan/Nonna, predefined roles/wildcards/multiplicity,
partial runs, requested counts, distinct alternatives, and validation failures.
