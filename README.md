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
/lookup name:Ghonty
/schedule-set image:<upload>
/schedule
```

Member names are matched by the text before the first hyphen, so `Ghonty-Downogeri` and `Ghonty-Catpounce` both match `/lookup Ghonty`.

Lookup responses are formatted like:

```text
Red Serca x2 DPS
Red Cathedral x1 DPS
Orange Serca x1 Support
```
