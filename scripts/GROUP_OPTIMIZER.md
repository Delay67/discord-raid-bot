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
By default, each sample must change at least **25% of run-weighted player
pairings** compared with every other returned sample, and every returned score
must be within **100 penalty points** of the best one found. These limits are
adjustable:

```sh
python scripts/active/optimize_groups.py --solutions 3 --diversity-percent 25 --max-score-gap 100
```

Use `--max-score-gap 0` for equal-score samples. If the first search proves an
optimum, this requests different optimal samples. If it only finds a feasible
score, the solver continues seeking improvements without claiming optimality.
`--diversity-percent 0` disables the pairing threshold, but still requires distinct
player/raid/difficulty layouts. Both settings use integers; diversity is 0–100
and the score gap must be nonnegative.

`--runs N` optionally imposes an exact total number of runs across both raids in
each layout. Without it, the optimizer chooses the number needed to cover the
mandatory entries and improve the preferences. A requested count never permits
dropping mandatory characters. Impossible counts fail or return INFEASIBLE.

Use `--min-jan-runs N` to require Jan in at least N runs **per solution**, counting
Serca and Cathedral together:

```sh
python scripts/active/optimize_groups.py --solutions 3 --min-jan-runs 4
```

This is a hard minimum, not a target or maximum; Jan may appear in more runs.
Omitting it (or using `0`) imposes no minimum. The value must be a nonnegative
integer. Nonna must still be present in every Jan run, and all character, role,
eligibility, and uniqueness rules still apply. If the minimum cannot be met, the
solver reports infeasibility instead of reducing it. The reports include both
the requested minimum and Jan's actual run count.

`--time-limit` is the maximum seconds **per search attempt**, excluding workbook
loading/model construction. Total solver time is budgeted at
`solutions × time-limit` (with small solver shutdown overruns possible). If a
better score disqualifies earlier samples or an attempt times out without a
solution, replacement/retry attempts use the remaining budget, up to three times
the requested sample count in total. A timeout prints `UNKNOWN`, explains that
infeasibility has not been proven, and reports the remaining retry budget.
`--workers` defaults to 8. Use `--workers 1 --seed 42` to reduce nondeterminism;
wall-clock cutoffs can still change results between runs/machines.

Exit codes: `0` means the requested number was generated, `1` means invalid input
or an execution error, and `2` means fewer layouts were found. In the last case,
the report distinguishes proven infeasibility, exhausted comparable alternatives,
and search/budget limits. `no_more_comparable_samples` means no additional sample
meets the quality/diversity constraints relative to the retained samples; it does
not mean the workbook's hard rules are infeasible or that a larger collection
with a different first sample could not exist. Limits are never silently relaxed.

Reuse saved solutions without repeating the first optimization:

```sh
python scripts/active/optimize_groups.py --resume data/group-solutions.json --solutions 3 --min-jan-runs 3 --max-score-gap 200 --time-limit 240
```

`--resume` requires the exact same workbook contents and scoring rules. Saved
runs are independently validated against the current hard constraints and their
scores recomputed. Existing compatible samples count toward `--solutions`;
incompatible diversity/score candidates are not returned. Saved optimality claims
are not treated as new proofs, so resumed samples are labeled `FEASIBLE` with
`source: "saved solution"`. The resume file can also be the output path: it is read
before the new report is written.

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
  "cluster_five": 25,
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
| Cluster with 2 runs | 35 |
| Cluster with 5 runs | 25 |
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

### Proven capacity bounds

The model automatically derives necessary bounds for each difficulty and for
each raid family. No additional flag is needed. JSON results include these in
`capacityBounds`, with minimum/maximum run counts, a lower bound on vacancy
penalties, and whether the relaxed capacity conditions are feasible. Passing
these conditions does not by itself guarantee that a complete layout exists.

The bounds use only consequences of the hard rules:

- Each run has 3–4 characters, 2–3 DPS, and at most one Support.
- Each player can supply at most one character per run.
- Mandatory participation and distinct predefined rows impose minimum counts.
  When those requirements overlap, their counts are not added twice.
- An adaptable Serca character is counted once in the raid-wide capacity. It is
  mandatory in a specific difficulty only if it has no alternative difficulty.
- Optional characters contribute to possible capacity, not mandatory coverage.
- FLEX contributes to both possible role capacities, but only once to the
  distinct-character capacity.
- Repeated player combinations cannot consume more eligible characters or
  support capacity than those players actually have. Cluster bounds combine the
  per-difficulty limits with the once-per-raid character limit.

For a band of difficulties with `R` runs, `D` assigned DPS and `S` assigned
Supports, the vacancy counts are exactly `3R - D` and `R - S`. The preprocessing
step minimizes their weighted penalty over a relaxed set of feasible aggregate
counts. That relaxation includes every actual layout, so its minimum is a safe
lower bound. Counts are constrained by mandatory coverage, possible roles and
seats, and each player's maximum of `R` appearances.

The model adds those bounds plus redundant role/seat balance equations. It does
not fix a preferred run count, cap cluster sizes heuristically, or remove valid
layouts. Bounds for overlapping bands must **not** be added together: a raid-wide
bound and its difficulty-specific bounds cover some of the same runs.

For the workbook used during development, these conditions prove that Cathedral
2 needs exactly three runs and at least 3,200 vacancy-penalty points with the
default weights. These are derived values, not hard-coded roster assumptions.

Small-roster tests enumerate concrete character layouts, check that every valid
layout survives the bounds, and compare the solver's optimal score against the
exhaustive optimum. Tighter bounds can change search order; faster searches and
better time-limited scores are not guaranteed on every instance or random seed.

Adding future rules about interactions between specific characters, classes, or
strengths may require extending the model beyond these interchangeable pools.
Such rules must be encoded explicitly; workbook prose is never interpreted.

After solving, characters are allocated from the chosen pools. A separate
validator checks each concrete run, all mandatory coverage, and a one-to-one
matching of predefined groups to runs. It recomputes the score and requires exact
agreement with the solver's objective before any solution is exported.

### Comparable, varied samples

The first search minimizes the normal penalty and retains up to 100 distinct
intermediate layouts. After it finishes, any intermediate layouts meeting the
final score and diversity limits can become samples immediately. This avoids
throwing away useful alternatives discovered on the way to the optimum.

Further searches enforce a score ceiling and minimum diversity from **every**
retained sample. They stop at the first qualifying solution, rather than spending
time proving the best second or third score. Retries change the random seed and
alternate partial character-choice hints with unhinted search. The previous group
layout itself is not hinted because it violates the new diversity constraints.
There is no random distortion of the score and no relaxation of raid hard rules.

Pairing diversity measures how often each unordered pair of players shares a
run, counting across both raids. A four-player run contributes six pairings; a
three-player run contributes three. For example, Delay/Marcel sharing four runs
counts four times. Let `overlap` be the sum of the smaller shared-run count for
each pair across two samples. Diversity is:

```text
100 × (1 - overlap / min(total pairings in sample A, total pairings in sample B))
```

This requires the specified percentage to change in both samples. Keeping all
the original relationships and adding extra runs does not create diversity.
Character, role, difficulty, color, and run-order changes alone do not count.
For perspective, swapping two players between two runs in a layout of eight
full runs changes only 12.5% of pairings and fails the 25% default. The threshold
is relative to roster size, so smaller layouts can differ substantially with
fewer player moves. This metric compares player relationships, not exact
four-player cluster membership; it is deliberately stricter than merely finding
a different layout.

An exact player/raid/difficulty-layout exclusion also prevents duplicate layouts
when the pairing threshold is set to zero. If a newly found score improves enough
that earlier samples exceed the configured gap, those samples are retired and
their diversity restrictions are removed before searching for replacements.
Every returned sample must satisfy the gap relative to the **best returned score**.
The script can return fewer samples when the limits cannot be met or the search
budget is exhausted. Results are sorted by penalty.

JSON `sampling` metadata and the Markdown report show the quality/diversity
settings, each sample's score gap, and pairwise measured differences. The final
collection is independently checked for both limits before export.

`OPTIMAL` means the solver proved the best score for the layouts still allowed
in that search. `FEASIBLE` means every hard rule holds, but optimality was not
proven. Later searches also include diversity and quality constraints, so their
optimality flags are explicitly labeled `optimalForRemainingLayouts`.

## Tests

```sh
python -m unittest discover -s test -p "test_*.py"
```

Tests cover table parsing, eligibility boundaries, adaptation, FLEX, optional
coverage, player uniqueness, Jan/Nonna, predefined roles/wildcards/multiplicity,
partial runs, requested counts, distinct alternatives, and validation failures.
