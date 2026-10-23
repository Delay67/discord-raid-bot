# Pi voice dark caller

The existing bot plays cached speech into a normal Discord voice channel. A
Windows helper sends next/reset actions through your existing SSH access.
Names are configured per server in Discord and saved under `data/dark-caller/`.
Keep that directory when deploying updates. The default voice is US female
`en-US-AriaNeural`, generated using Edge's online text-to-speech service through
the third-party `edge-tts` package. Text, including player names, is sent to that
service when generating clips. Cached clips play locally without a new request.
Names are spoken as written; use phonetic spelling when needed.

## Pi setup

Use a 64-bit Pi OS and Node.js 22.12 or newer (check `node --version`). The
voice encryption dependency must support the Pi's architecture; verify with a
solo voice test before raid night. Node 20 is sufficient for the old bot but
not the new voice feature. Do not run a second copy with the same bot token.

In the bot directory on the Pi, install the updated dependencies:

```sh
npm ci
sudo apt-get update
sudo apt-get install espeak-ng ffmpeg
sudo apt-get install python3-venv
python3 -m venv .venv-dark
.venv-dark/bin/python -m pip install -r scripts/active/requirements-dark-caller.txt
```

Add this setting to the Pi's existing `.env`, then register commands and restart
the existing bot service using your usual process:

```env
DARK_CALLER_ENABLED=true
DARK_CALLER_VOICE=en-US-AriaNeural
DARK_CALLER_PYTHON=/home/delay/discord-raid-bot/.venv-dark/bin/python
```

```sh
npm run commands:register
```

`DARK_CALLER_VOICE` is optional and defaults to `en-US-AriaNeural`. After changing it,
restart the bot and use `/dark join` again. Clips are cached per voice, so old
recordings do not need to be deleted. The first join prepares the new clips.
Set `DARK_CALLER_PYTHON` to your virtual environment's absolute Python path
so the systemd service finds `edge-tts`. Adjust the path if your bot lives elsewhere.

| Voice | DARK_CALLER_VOICE |
| --- | --- |
| British female | `en-GB-SoniaNeural` |
| British female (alternative) | `en-GB-LibbyNeural` |
| US male | `en-US-GuyNeural` |
| US female | `en-US-AriaNeural` |
| Australian female | `en-AU-NatashaNeural` |
| Australian male | `en-AU-WilliamNeural` |
| Irish male | `en-IE-ConnorNeural` |

Online voice availability depends on the service. To list available voices:
`.venv-dark/bin/python -m edge_tts --list-voices`.
Generation requires internet access. If it fails, the command reports an error
instead of silently using a different voice. For offline synthetic speech,
set `DARK_CALLER_VOICE=en-us+f3` instead.

The bot needs View Channel, Connect and Speak in the voice channel. Only
members with Manage Server permission can use `/dark`. While connected, only
the member who started the caller can change or control it. Others can view status.

## Discord setup

1. `/dark players names:Alice, Bob, Charlie` saves the order. Any 1–24 names work.
   Each gets three turns, cycling through the list. This prepares audio clips;
   initial setup may take a little time. Leave the caller before changing names.
2. Join a normal voice channel and use `/dark join`.
3. Copy the temporary token from the private reply. It controls this session only;
   do not share it. The token expires on leave, disconnect cleanup, or bot restart.
4. `/dark next` and `/dark reset` allow testing without the PC helper.
5. `/dark status` shows the rotation and turns remaining. `/dark leave` disconnects.

Every next action consumes a turn, including when skipping a dead player.
The last-round warning sounds when one full round remains. After all three
rounds, calls say “No darks left” until reset. The bot leaves after two minutes
with no human members. Voice connection failures may require leave/join again.

## Gaming PC

Open CMD and keep this SSH tunnel running during the raid (enter your usual
Pi password if prompted):

```bat
ssh -N -T -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:17812:127.0.0.1:17812 delay@192.168.178.112
```

This forwards only a loopback port; no router changes or LAN listener are needed.
The control endpoint also requires the temporary session token.

In a second CMD, from this project directory:

```bat
py -m pip install pynput
py scripts\active\dark_hotkey.py
```

Paste the token at the hidden prompt. Tap **left Ctrl+Alt+D** for next. Hold it
for one second to reset. As in the supplied example, pressing starts a call
immediately; holding then replaces it with the reset announcement. Keyboard
auto-repeat does not generate extra calls. Rapid deliberate taps replace current
audio rather than waiting for earlier announcements to finish.

Edit `HOTKEY` and `HOLD_SECONDS` near the top of the helper to customize them.
The helper observes keyboard input and sends control requests; it does not
send inputs to the game. Its operation with your game must be tested locally.
Close the helper and tunnel windows when done, and use `/dark leave`.

If a request times out, check `/dark status` before pressing again: the turn
may already have advanced. The helper deliberately never retries actions.

## Verification

In an empty test VC, try the whole rotation, a reset, rapid taps, holding the
hotkey, changing names after leaving, and leaving/rejoining. Confirm another
member remaining in VC prevents the two-minute auto-leave. Real Pi audio,
SSH, and in-game hotkeys require this live test; unit tests cannot verify them.
