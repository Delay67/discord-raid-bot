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
GROQ_API_KEY=your-key
BOT_TIME_ZONE=Europe/Amsterdam
```

## Commands

**Raid Management:**
- `/raid-add color:Red raid:Serca difficulty:Nightmare dps:player-class,player2` — Add a raid
- `/raid-list` — Show all raids
- `/raid-clear` — Clear all raids
- `/raids-upload file:workbook.xlsx` — Import raids from Excel workbook
- `/complete color:Orange raid:Serca` — Mark a raid as done
- `/raid-suggest options:3 search:3 variety:3` — Generate alternative raid group layouts

**Lookups:**
- `/lookup name:Ghonty` — Show a player's raids (matched by name prefix)
- `/combo name:Ghonty with:Vierazy Phil` — Show raids for multiple players
- `/overlap name:Ghonty` — Show players in same raids

**Scheduling:**
- `/schedule-set image:schedule.png` — Post and pin a raid schedule
- `/schedule` — Show the current schedule

**Fun & Stats:**
- `/redpanda` — Send a random red panda image
- `/server-stats period:week` — Show activity stats
- `/topchatter period:week` — Leaderboard of most active chatters
- `/toppanda period:week` — Leaderboard of red panda senders

**AI & Admin:**
- `@bot message` — Ask the bot a question (uses Groq LLM)
- `@bot image` — Analyze up to 2 images with your question (up to 20 MiB each)
- `/llm mode:enable|disable|status` — Control AI responses (admin only)

## Features

- **Raid tracking:** Track raids by color, type, and difficulty
- **Player lookup:** Find raids by player name (matches prefix before hyphen)
- **Auto-suggestions:** Generate alternative team layouts with optimization
- **Schedule management:** Upload Excel workbooks or images to manage raids
- **Activity stats:** Track message counts and red panda sends by server/time period
- **AI chat:** Ask Groq about raids or analyze images
- **Auto-reset:** Raids reset to TODO every Wednesday at 09:00 Amsterdam time

## Importing Raids

**From Excel (recommended):**
```bash
python -m pip install -r scripts/requirements.txt
python scripts/import_raids_from_xlsx.py path/to/schedule.xlsx
```
Or use `/raids-upload` in Discord.

**From Screenshot (fallback, needs OCR):**
```bash
# Windows: winget install UB-Mannheim.TesseractOCR
python scripts/import_raids_from_image.py path/to/schedule.png
```

## Configuration Notes

- Commands only work in `DISCORD_CHANNEL_ID`
- Requires `Manage Server` permission for admin commands
- Bot replies are auto-deleted after `CLEANUP_DELAY_MS` (default: 5 minutes)
- For mention replies to work, enable `Message Content Intent` in Discord Developer Portal
- Red panda media is read from `data/redpandas` or `REDPANDA_MEDIA_DIR`
