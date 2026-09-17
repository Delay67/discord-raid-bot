# discord-raid-bot

A Discord bot for managing Lost Ark raid groups and team assignments.

## Quick Start

**Requirements:** Node.js 20+, Discord bot token, Discord server

**Install & Run:**
```bash
npm install
npm run commands:register
npm start
```

**Environment Setup:** Create `.env` with:
```env
DISCORD_TOKEN=your-token
DISCORD_CHANNEL_ID=channel-id
PLANNED_TIMES_CHANNEL_ID=channel-id
RAID_PLANS_CHANNEL_ID=1550172613668503682
GROQ_API_KEY=your-key
BOT_TIME_ZONE=Europe/Amsterdam
```

## Commands

**Raid Management:**
- `/raid-add color:Red raid:Serca difficulty:Nightmare dps:player-class,player2` — Add a raid
- `/raid-list` — Show all raids
- `/raid-clear` — Clear all raids
- `/raids-upload file:workbook.xlsx` — Replace current raids or prepare next week's raids
- `/complete color:Orange raid:Serca` — Mark a raid as done
- `/raid-suggest options:3 search:3 variety:3` — Generate alternative raid group layouts

**Lookups:**
- `/lookup name:Ghonty` — Show a player's raids (matched by name prefix)
- `/combo name:Ghonty with:Vierazy Phil` — Show raids for multiple players
- `/overlap name:Ghonty` — Show players in same raids

**Scheduling:**
- `/schedule-set image:schedule.png` — Post and pin a raid schedule
- `/schedule` — Show the current schedule
- `/plan color:Red description:after Thursday Kazeros` — Propose a time for this week's Serca and Cathedral runs of that color; add `raid:Serca` or `raid:Cathedral` to select one

**Fun & Stats:**
- `/redpanda` — Send a random red panda image
- `/server-stats period:week` — Show activity stats
- `/topchatter period:week` — Leaderboard of most active chatters
- `/toppanda period:week` — Leaderboard of red panda senders
- `/favoritepandas` — Top frogblushed red pandas from the rolling past 5 days

Favorite reaction data records each reacting user's ID, display label, and
per-image reaction count in `data/redpanda-favorites.json`.

**AI & Admin:**
- `@bot message` — Ask the bot a question (uses Groq LLM)
- `@bot image` — Analyze up to 2 images with your question (up to 20 MiB each)
- `/llm mode:enable|disable|status` — Control AI responses (admin only)

## Run planning

`/plan` works in any channel in the server and posts a **Pending Plan** in
`RAID_PLANS_CHANNEL_ID` (default: `1550172613668503682`). Color autocomplete uses
the current week's Serca/Cathedral roster, excluding unassigned `Unknown` colors.
The description is free text, for example `18:00 on Saturday` or
`after Thursday Kazeros` (up to 1,000 characters).

The bot pings each unique member and adds ✅, ❌, and
`<:juststop:1503113067309961400>` reactions. Only the run members listed in the
original pending plan count for ✅ and ❌; other users' votes are ignored.
Normally everyone, including the creator if they are in the run, must confirm.
Once all members currently have ✅ selected, the bot adds the run and description
to **Planned Times** and deletes the pending message. Any member's ❌ rejects the
plan, deletes its message, and posts a channel notice mentioning the creator and
identifying the member who rejected it.

The original plan creator can react with `:juststop:` to immediately add a pending
plan to **Planned Times** without waiting for checkmarks, even if the creator is
not part of the run. Other users' `:juststop:` reactions are ignored. The override
uses the exact emoji ID and also works after bot downtime; it cannot restore a
plan that was already rejected or expired. The bot must have access to this emoji
to add the third reaction.

The same **Planned Times** message is cleared every Wednesday at 10:00 Amsterdam
time, and previous-week pending plans expire. The bot creates the message on
startup if needed; it catches up after downtime and saves plan state in
`data/raid-plans.json`. Long summaries use additional messages, which are removed
at the weekly reset. Existing schedule images and Kazeros reminders continue to
use `PLANNED_TIMES_CHANNEL_ID`.

Configure roster names and Discord user IDs privately on the bot host:

```env
RAID_PLAN_DISCORD_IDS=PlayerOne:123456789012345678,PlayerTwo:234567890123456789
```

Existing `KAZEROS_DISCORD_IDS` mappings are reused; `RAID_PLAN_DISCORD_IDS` can add
or override names. Match the player's roster name (before any class suffix),
not the character name. Every run member needs a mapping; the command lists any
missing members instead of creating a plan that cannot be confirmed. The bot
needs View Channel, Send Messages, Read Message History, and Add Reactions in
the planning channel. Run `npm run commands:register` and restart the bot after
installing this update.

## Features

- **Raid tracking:** Track raids by color, type, and difficulty
- **Player lookup:** Find raids by player name (matches prefix before hyphen)
- **Auto-suggestions:** Generate alternative team layouts with optimization
- **Schedule management:** Upload Excel workbooks or images to manage raids
- **Activity stats:** Track message counts and red panda sends by server/time period
- **AI chat:** Ask Groq about raids or analyze images
- **Weekly rollover:** Every Wednesday at 10:00 Amsterdam time, current raids are
  archived, prepared raids become current (when present), and all current raids
  reset to TODO
- **Week history:** `/lookup`, `/combo`, `/overlap`, and `/raid-list` include a
  selector for the current week, a prepared next week, and archived Wednesday dates
- **Kazeros reminders:** The first timed entry under each day on the `Kazeros`
  workbook sheet pings its named player columns and any names in `Extras` 30
  minutes before the start time. Discord IDs are configured privately through
  `KAZEROS_DISCORD_IDS`.

## Importing Raids

**From Excel (recommended):**
```bash
python -m pip install -r scripts/active/requirements.txt
python scripts/active/import_raids_from_xlsx.py path/to/schedule.xlsx
```
Or use `/raids-upload` in Discord.

**From Screenshot (fallback, needs OCR):**
```bash
# Windows: winget install UB-Mannheim.TesseractOCR
python scripts/active/import_raids_from_image.py path/to/schedule.png
```

## Configuration Notes

- Most commands only work in `DISCORD_CHANNEL_ID`; `/plan` works in any server channel
- Requires `Manage Server` permission for admin commands
- Bot replies are auto-deleted after `CLEANUP_DELAY_MS` (default: 5 minutes)
- For mention replies to work, enable `Message Content Intent` in Discord Developer Portal
- Red panda media is read from `data/redpandas` or `REDPANDA_MEDIA_DIR`

## Favorite Panda Scores

On the bot host, print the top 10 favorite red pandas with:

```bash
python3 scripts/active/top_favorite_pandas.py
```

Use `--guild-id SERVER_ID` to restrict the results to one Discord server. Run
`python3 scripts/active/top_favorite_pandas.py --help` for the remaining options.
