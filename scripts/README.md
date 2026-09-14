# Scripts

- `active/` contains repeatable operational tools used for bot deployment, raid imports and suggestions, schedule rendering, media preparation, and reports.
- `one-time/` contains migrations, historical backfills, and bulk acquisition utilities that are normally run once or only during recovery/setup.

Install the Python dependencies for the active tools with:

```sh
python -m pip install -r scripts/active/requirements.txt
```

The npm commands in the project root remain the preferred entry points for command registration and stats maintenance.

Generate raid optimizer groups and preview images from `data/staticsheet.xlsx`
with:

```sh
python scripts/active/generate_static_raid_suggestions.py
```

By default this imports the `Serca+Cath` sheet, refreshes `data/raids.json`,
runs the optimizer, and writes:

- `data/raid-suggestions-serca-cath.xlsx`
- `data/raid-suggestions-serca-cath-report.txt`
- `data/raid-suggestions-serca-cath-option-1.png`
- `data/raid-suggestions-serca-cath-option-2.png`
- `data/raid-suggestions-serca-cath-option-3.png`

If the tab name changes, pass it explicitly:

```sh
python scripts/active/generate_static_raid_suggestions.py --sheet "Temporary"
```

That will write matching filenames such as
`data/raid-suggestions-temporary-option-1.png`.

For a longer/harder search, increase `--iterations`:

```sh
python scripts/active/generate_static_raid_suggestions.py --iterations 250000
```

By default, the generator uses `--lock-mode colored-nightmare`, which locks
colored Serca Nightmare groups but still lets Hard and Cathedral groups move.
Other lock modes are available:

```sh
python scripts/active/generate_static_raid_suggestions.py --lock-mode none
python scripts/active/generate_static_raid_suggestions.py --lock-mode all-colored
```

In the raid sheet, role cells are read by fill color:

- green = DPS
- purple = Support
- yellow = Flex

Flex characters can be used by the optimizer to satisfy either a DPS or Support
slot. Four-member raid groups should be fillable as three DPS plus one Support.
Three-member raid groups are allowed, but the optimizer heavily penalizes them
and increases that penalty for each additional three-member group.

Preview or run the LLM-interaction history backfill with:

```sh
npm run backfill:llm-interactions -- --dry-run
npm run backfill:llm-interactions
```

It scans the default guild for explicit bot mentions and direct replies to bot
messages. Use `--guild ID` to override the guild. `--channel ID` is available
only with `--dry-run`, preventing a partial scan from replacing guild-wide data.
