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
   CLEANUP_DELAY_MS=300000
   REDDIT_CLIENT_ID=your-reddit-client-id
   REDDIT_CLIENT_SECRET=your-reddit-client-secret
   REDDIT_USERNAME=your-reddit-username
   REDDIT_PASSWORD=your-reddit-password
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

```text
/raid-add color:Red raid:Serca difficulty:Nightmare dps:Ghonty-Glavier,Phil supports:Nonna-Artist
/raid-list
/raid-clear
/raids-upload file:<upload>
/lookup name:Ghonty
/combo name:Ghonty with:Vierazy Phil
/schedule-set image:<upload>
/schedule
/redpanda
/commands
```

Member names are matched by the text before the first hyphen, so `Ghonty-Downogeri` and `Ghonty-Catpounce` both match `/lookup Ghonty`.

Lookup responses are formatted like:

```text
Red Serca x2 DPS
Red Cathedral x2 DPS

Orange Serca x2 DPS
Orange Cathedral x1 DPS
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

The screenshot importer is available as a fallback, but it is less reliable because it uses OCR. It also needs the Tesseract OCR app installed. On Windows:

```bash
winget install UB-Mannheim.TesseractOCR
```

Import raids from a schedule screenshot:

```bash
python scripts/import_raids_from_image.py path\to\schedule.png
```
