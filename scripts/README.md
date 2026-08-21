# Scripts

- `active/` contains repeatable operational tools used for bot deployment, raid imports and suggestions, schedule rendering, media preparation, and reports.
- `one-time/` contains migrations, historical backfills, and bulk acquisition utilities that are normally run once or only during recovery/setup.

Install the Python dependencies for the active tools with:

```sh
python -m pip install -r scripts/active/requirements.txt
```

The npm commands in the project root remain the preferred entry points for command registration and stats maintenance.

Preview or run the LLM-interaction history backfill with:

```sh
npm run backfill:llm-interactions -- --dry-run
npm run backfill:llm-interactions
```

It scans the default guild for explicit bot mentions and direct replies to bot
messages. Use `--guild ID` to override the guild. `--channel ID` is available
only with `--dry-run`, preventing a partial scan from replacing guild-wide data.
