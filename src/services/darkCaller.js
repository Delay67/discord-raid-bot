const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const run = promisify(execFile);
const { parsePlayers, nextCall } = require("./darkRotation");
const directory = path.join(__dirname, "../../data/dark-caller");
const sessions = new Map();
let server;

function readPlayers(guildId) {
  const file = path.join(directory, `${guildId}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")).players : [];
}

async function clip(text) {
  const speechVoice = process.env.DARK_CALLER_VOICE || "en-US-AriaNeural";
  const neural = speechVoice.endsWith("Neural");
  fs.mkdirSync(directory, { recursive: true });
  const hash = crypto.createHash("sha256").update(JSON.stringify({ text, voice: speechVoice, speed: neural ? "+15%" : 190, audioRevision: 2 })).digest("hex");
  const file = path.join(directory, `${hash}.ogg`);
  if (fs.existsSync(file)) return file;
  const temporary = `${file}.${crypto.randomUUID()}`;
  try {
    if (neural) {
      try {
        await run(process.env.DARK_CALLER_PYTHON || "python3", [
          path.join(__dirname, "../../scripts/active/dark_speech.py"),
          "--voice", speechVoice, "--output", `${temporary}.mp3`, "--text", text
        ], { timeout: 30000 });
      } catch (error) {
        console.error("Neural speech generation:", error.message);
        throw new Error("Could not generate neural speech. Check the Pi's internet connection and edge-tts installation (DARK_CALLER_PYTHON). See the bot log for details.");
      }
    } else {
      await run("espeak-ng", ["-v", speechVoice, "-s", "190", "-w", `${temporary}.wav`, "--", text], { timeout: 15000 });
    }
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", `${temporary}.${neural ? "mp3" : "wav"}`, "-af", "silenceremove=start_periods=1:start_duration=0.005:start_threshold=-45dB:window=0.005", "-ar", "48000", "-c:a", "libopus", "-application", "voip", "-frame_duration", "20", "-f", "ogg", temporary], { timeout: 15000 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(`${temporary}.wav`, { force: true });
    fs.rmSync(`${temporary}.mp3`, { force: true });
    fs.rmSync(temporary, { force: true });
  }
  return file;
}

async function prepare(players) {
  const texts = new Set(["Dark rotation reset", "No darks left"]);
  for (let i = 0; i < players.length * 3; i++) texts.add(nextCall(players, i).text);
  const clips = new Map();
  for (const text of texts) clips.set(text, fs.readFileSync(await clip(text)));
  return clips;
}

async function setPlayers(guildId, input) {
  if (sessions.has(guildId)) throw new Error("Use /dark leave before changing players.");
  const players = parsePlayers(input);
  await prepare(players);
  fs.mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${guildId}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify({ players }));
  fs.renameSync(`${file}.tmp`, file);
  return players;
}

function leave(guildId) {
  const session = sessions.get(guildId);
  if (!session) return;
  clearInterval(session.timer);
  session.player.stop();
  session.connection.destroy();
  sessions.delete(guildId);
}

async function join(member) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 12)) throw new Error("Voice requires Node.js 22.12 or newer on the Pi.");
  const guildId = member.guild.id;
  if (sessions.has(guildId)) throw new Error("Already connected. Use /dark leave first.");
  const channel = member.voice.channel;
  if (!channel || channel.type !== 2) throw new Error("Join a normal voice channel first.");
  const players = readPlayers(guildId);
  if (!players.length) throw new Error("Set /dark players first.");
  const clips = await prepare(players);
  const voice = require("@discordjs/voice");
  const connection = voice.joinVoiceChannel({ channelId: channel.id, guildId, adapterCreator: member.guild.voiceAdapterCreator, selfDeaf: true });
  try {
    await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 20000);
  } catch (error) {
    connection.destroy();
    throw error;
  }
  const player = voice.createAudioPlayer();
  player.on("error", (error) => console.error("Dark caller audio:", error.message));
  connection.subscribe(player);
  const session = { connection, player, players, clips, used: 0, owner: member.id, token: crypto.randomBytes(32).toString("hex"), emptySince: null, busy: false };
  sessions.set(guildId, session);
  connection.on("stateChange", (_, state) => {
    if (state.status === voice.VoiceConnectionStatus.Destroyed && sessions.get(guildId) === session) {
      clearInterval(session.timer);
      session.player.stop();
      sessions.delete(guildId);
    }
  });
  session.timer = setInterval(() => {
    const occupied = channel.members.some((person) => !person.user.bot);
    if (occupied) session.emptySince = null;
    else session.emptySince ??= Date.now();
    if (session.emptySince && Date.now() - session.emptySince >= 120000) leave(guildId);
  }, 5000);
  session.timer.unref();
  return session.token;
}

async function action(guildId, kind) {
  const session = sessions.get(guildId);
  if (!session) throw new Error("Use /dark join first.");
  if (session.busy) throw new Error("Caller is busy; try again.");
  session.busy = true;
  try {
    const result = kind === "reset" ? { text: "Dark rotation reset", used: 0 } : nextCall(session.players, session.used);
    const audio = session.clips.get(result.text);
    if (!audio) throw new Error("Call audio was not prepared. Leave and join the caller again.");
    const voice = require("@discordjs/voice");
    session.player.play(voice.createAudioResource(Readable.from([audio]), { inputType: voice.StreamType.OggOpus }));
    session.used = result.used;
    return result.text;
  } finally { session.busy = false; }
}

function startServer() {
  if (server || process.env.DARK_CALLER_ENABLED !== "true") return;
  server = http.createServer(async (request, response) => {
    response.setHeader("Content-Type", "application/json");
    const match = /^\/dark\/(next|reset)$/.exec(request.url);
    const entry = [...sessions.entries()].find(([, session]) => request.headers.authorization === `Bearer ${session.token}`);
    if (request.method !== "POST" || !match || !entry) {
      response.writeHead(403).end(JSON.stringify({ error: "Forbidden" }));
      return;
    }
    try {
      const text = await action(entry[0], match[1]);
      response.end(JSON.stringify({ text }));
    } catch (error) {
      response.writeHead(409).end(JSON.stringify({ error: error.message }));
    }
  });
  server.requestTimeout = 5000;
  server.on("error", (error) => console.error("Dark caller control server:", error.message));
  server.listen(17812, "127.0.0.1", () => console.log("Dark caller control listening on loopback port 17812."));
}

module.exports = { readPlayers, setPlayers, join, leave, action, startServer, sessions };
