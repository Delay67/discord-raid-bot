# Scripts

- `active/` contains repeatable operational tools used for bot deployment, raid imports, schedule rendering, media preparation, and reports.
- `one-time/` contains migrations, historical backfills, and bulk acquisition utilities that are normally run once or only during recovery/setup.

Install the Python dependencies for the active tools with:

```sh
python -m pip install -r scripts/active/requirements.txt
```

The npm commands in the project root remain the preferred entry points for command registration and stats maintenance.

Generate local Serca/Cathedral group layouts from `data/staticsheet.xlsx`:

```sh
python scripts/active/optimize_groups.py --solutions 3 --time-limit 60
```

See [the optimizer guide](GROUP_OPTIMIZER.md) for the workbook schema, hard rules,
soft scoring, configurable interpretations, output format, and solver options.

Read the `Setup` tab from `data/staticsheet.xlsx` as JSON:

```sh
python scripts/active/parse_static_setup.py
```

An explicit workbook path can also be passed as the first argument. The default
path is resolved relative to the project, regardless of the working directory.
This reads the workbook without updating it or the saved raids.

The parser locates the `Required Members`, `Optional Members`, and
`Predefined Groups` headers. JSON contains `requiredMembers` and `optionalMembers`
name lists, plus `predefinedGroups`. Each group keeps its full `raid` label and
an ordered `slots` list with `role` and `name`. `SUP` becomes `Support`; blank
slots have a `null` name. Empty rows are skipped. Setup values must be plain text;
formulas, Excel errors, missing headers, and groups without a raid label are
reported as errors.

Run the setup parser tests with:

```sh
python -m unittest discover -s test -p "test_static_setup.py"
```

Preview or run the LLM-interaction history backfill with:

```sh
npm run backfill:llm-interactions -- --dry-run
npm run backfill:llm-interactions
```

It scans the default guild for explicit bot mentions and direct replies to bot
messages. Use `--guild ID` to override the guild. `--channel ID` is available
only with `--dry-run`, preventing a partial scan from replacing guild-wide data.
