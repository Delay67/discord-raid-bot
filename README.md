# discord-raid-bot

A Discord bot for looking up which fixed Lost Ark raid groups a player is included in for the week.

## Requirements

- Node.js 20 or newer
- A Discord application with a bot token
- A Discord server where you can install the bot

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Make sure `.env` contains your bot token and bot channel:

   ```env
   DISCORD_TOKEN=your-bot-token
   DISCORD_CHANNEL_ID=your-bot-channel-id
   PLANNED_TIMES_CHANNEL_ID=1265458054623789277
   CLEANUP_DELAY_MS=300000
   REDDIT_CLIENT_ID=your-reddit-client-id
   REDDIT_CLIENT_SECRET=your-reddit-client-secret
   REDDIT_USERNAME=your-reddit-username
   REDDIT_PASSWORD=your-reddit-password
   GROQ_API_KEY=your-groq-api-key
   GROQ_MODEL=openai/gpt-oss-120b
   ```

3. Register slash commands:

   ```bash
   npm run commands:register
   ```

4. Start the bot:

   ```bash
   npm start
   ```

## Raid Commands

Admin-only commands require the Discord `Manage Server` permission.
Commands only work in the channel configured as `DISCORD_CHANNEL_ID`.
Bot replies in that channel are deleted after `CLEANUP_DELAY_MS`.
Regular user messages in that channel are deleted immediately.
The bot needs `Manage Messages` in that channel to delete other users' messages.
Mention replies using Groq require the Discord Developer Portal `Message Content Intent` to be enabled for the bot.

```text
/raid-add color:Red raid:Serca difficulty:Nightmare dps:Ghonty-Glavier,Phil supports:Nonna-Artist
/raid-list
/raid-clear
/raids-upload file:<upload>
/llm mode:disable
/lookup name:Ghonty
/combo name:Ghonty with:Vierazy Phil
/overlap name:Ghonty
/complete color:Orange raid:Serca
/schedule-set image:<upload>
/schedule
/redpanda
/redpanda-delete-last
/health
/server-stats period:week
/topchatter period:week
/toppanda period:week
/commands
```

Mention the bot to ask Groq a short question:

```text
@delay raid helper why is Serca cursed?
```

Admins can disable or re-enable all mention replies:

```text
/llm mode:disable
/llm mode:enable
/llm mode:status
```

Some mention questions are answered directly from `data/raids.json` instead of Groq:

```text
@delay raid helper what raids do I have left?
@delay raid helper what raids does Ghonty have left?
```

Member names are matched by the text before the first hyphen, so `Ghonty-Downogeri` and `Ghonty-Catpounce` both match `/lookup Ghonty`.
If a raid block in the workbook has `DONE` in its status box, that raid is imported as done. `/lookup` and `/combo` show TODO raids first and DONE raids after.
`/lookup`, `/combo`, and `/complete color` support autocomplete from the current raid data.
All raids are automatically reset back to TODO every Wednesday at 09:00 Amsterdam time.

Lookup responses are formatted like:

```text
TODO
Red Serca x2 DPS
Red Cathedral x2 DPS

Orange Serca x2 DPS
Orange Cathedral x1 DPS

DONE
Light Blue Serca x1 DPS
```

## Red Panda Media

Local red panda media is read from `data/redpandas` by default, or from `REDPANDA_MEDIA_DIR` if it is set in `.env`.
The bot ignores local files over Discord's 10 MiB upload limit.
When `/redpanda` sends a local file, the bot logs the exact selected path so disliked files can be deleted later.
Admins can also delete the last local file the bot posted with `/redpanda-delete-last`.

## Server Stats

The bot tracks aggregate server activity in `data/activity-stats.json`, separated by Discord server.
It does not store message contents.
Use `/server-stats period:week`, `/server-stats period:month`, `/server-stats period:year`, or `/server-stats period:all` to show overall message and red panda counts.
Use `/topchatter period:all` or `/toppanda period:all` for focused all-time leaderboards.

Backfill historical chat message counts from readable channel history in server `977982426989101077`:

```bash
npm run backfill:messages -- --dry-run
npm run backfill:messages
```

Backfill one channel only:

```bash
npm run backfill:messages -- --channel 123456789012345678
```

The backfill replaces message-count buckets only. Command and red panda stats are preserved.
If yearly message stats already exist, build all-time message stats without rerunning backfill:

```bash
npm run stats:migrate-all-time
```

Watch the bot logs:

```bash
sudo journalctl -u discord-raid-bot -f
```

Delete a bad file using the logged path:

```bash
rm "/home/delay/discord-raid-bot/data/redpandas/example.jpg"
```

Create smaller Discord-ready copies of oversized local media:

```bash
sudo apt install ffmpeg
source .venv/bin/activate
python scripts/prepare_redpanda_media.py
```

The script creates `.discord.jpg`, `.discord.gif`, or `.discord.mp4` copies beside the originals. Oversized GIFs are compressed as GIFs first, then converted to MP4 only if they still cannot fit under the upload limit.
Add `--delete-originals` to delete oversized originals after their smaller copy is ready:

```bash
python scripts/prepare_redpanda_media.py --delete-originals
```

## Image Import

An `.xlsx` import is preferred because it can read values and fill colors directly from the workbook.

Install the Python import dependencies:

```bash
python -m pip install -r scripts/requirements.txt
```

Import raids from the `Serca+Cath` sheet:

```bash
python scripts/import_raids_from_xlsx.py path\to\schedule.xlsx
```

The script previews what it parsed first. It only wipes and replaces `data/raids.json` if you type `YES`.
Admins can also upload the workbook directly in Discord with `/raids-upload`.
The bot previews the parsed raids and only replaces `data/staticsheet.xlsx` and `data/raids.json` after the admin clicks `Confirm Import`.

`/schedule-set` posts and pins the uploaded image in the planned times channel. If another schedule was posted earlier in the same Amsterdam week, that earlier post is deleted. Older-week schedule posts are kept but unpinned so only the latest submitted schedule remains pinned.

The screenshot importer is available as a fallback, but it is less reliable because it uses OCR. It also needs the Tesseract OCR app installed. On Windows:

```bash
winget install UB-Mannheim.TesseractOCR
```

Import raids from a schedule screenshot:

```bash
python scripts/import_raids_from_image.py path\to\schedule.png
```
