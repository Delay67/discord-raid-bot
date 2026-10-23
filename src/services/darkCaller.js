const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
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
  const speechVoice = process.env.DARK_CALLER_VOICE || "en-us+f3";
  fs.mkdirSync(directory, { recursive: true });
  const hash = crypto.createHash("sha256").update(JSON.stringify({ text, voice: speechVoice, speed: 190 })).digest("hex");
  const file = path.join(directory, `${hash}.ogg`);
  if (fs.existsSync(file)) return file;
  const temporary = `${file}.${crypto.randomUUID()}`;
  try {
    await run("espeak-ng", ["-v", speechVoice, "-s", "190", "-w", `${temporary}.wav`, "--", text], { timeout: 15000 });
    await run("ffmpeg", ["-y", "-loglevel", "error", "-i", `${temporary}.wav`, "-c:a", "libopus", "-f", "ogg", temporary], { timeout: 15000 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(`${temporary}.wav`, { force: true });
    fs.rmSync(temporary, { force: true });
  }
  return file;
}

async function prepare(players) {
  const texts = new Set(["Dark rotation reset", "No darks left"]);
  for (let i = 0; i < players.length * 3; i++) texts.add(nextCall(players, i).text);
  for (const text of texts) await clip(text);
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
  await prepare(players);
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
  const session = { connection, player, players, used: 0, owner: member.id, token: crypto.randomBytes(32).toString("hex"), emptySince: null, busy: false };
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
    const file = await clip(result.text);
    const voice = require("@discordjs/voice");
    session.player.play(voice.createAudioResource(file, { inputType: voice.StreamType.OggOpus }));
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
