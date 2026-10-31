import { WebSocketServer } from "ws";
import http from "http";
import log from "../log/logs.js";
import mainLog from "../../Utils/log.js";
import crypto from "crypto";
import { serverRegistry, STALE_TIMEOUT_MS, JOINABLE_POLL_MS, JOINABLE_WAIT_MS } from "../../Routes/gameserver.js";

import dotenv from "dotenv";
dotenv.config();

const wsPort = parseInt(process.env.MATCHMAKER_PORT) || 8080;

const DELAY_CONNECTING = parseInt(process.env.MM_DELAY_CONNECTING) || 500;
const DELAY_WAITING    = parseInt(process.env.MM_DELAY_WAITING)    || 500;
const DELAY_SESSION    = parseInt(process.env.MM_DELAY_SESSION)    || 1000;
const QUEUE_TIMEOUT_MS = (parseInt(process.env.MM_QUEUE_TIMEOUT_SEC) || 120) * 1000;
const MAX_QUEUE_SIZE   = parseInt(process.env.MM_MAX_QUEUE_SIZE)   || 1000;

const queues    = new Map();
const playerMeta = new Map();

export function getQueueStats() {
  const stats = {};
  for (const [key, set] of queues.entries()) stats[key] = set.size;
  return { totalQueued: playerMeta.size, queues: stats };
}

function queueKey(region, playlist) { return `${region}:${playlist}`; }
function getQueueSize(region, playlist) { return queues.get(queueKey(region, playlist))?.size ?? 0; }

function addToQueue(accountId, region, playlist) {
  const key = queueKey(region, playlist);
  if (!queues.has(key)) queues.set(key, new Set());
  queues.get(key).add(accountId);
}

function removeFromQueue(accountId) {
  const meta = playerMeta.get(accountId);
  if (!meta) return;
  queues.get(queueKey(meta.region, meta.playlist))?.delete(accountId);
  playerMeta.delete(accountId);
}

// Find a joinable server for this region+playlist from the live registry
function findJoinableServer(region, playlist) {
  const now = Date.now();
  const norm = playlist.toLowerCase();
  const reg  = region.toUpperCase();

  for (const entry of serverRegistry.values()) {
    if (
      entry.region   === reg  &&
      entry.playlist === norm &&
      entry.joinable  === true &&
      (now - entry.lastSeen) < STALE_TIMEOUT_MS
    ) {
      return `${entry.ip}:${entry.port}`;
    }
  }
  return null;
}

// Poll until a joinable server appears or timeout
function waitForJoinableServer(region, playlist, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const server = findJoinableServer(region, playlist);
      if (server) return resolve(server);
      if (Date.now() >= deadline) return resolve(null);
      setTimeout(check, JOINABLE_POLL_MS);
    };

    check();
  });
}

// ─── HTTP stats endpoint ──────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getQueueStats()));
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(wsPort, () => {
  mainLog.registerPort("Matchmaker WS", wsPort);
});

// ─── WebSocket server ─────────────────────────────────────────────────────────
const wss = new WebSocketServer({ server });

wss.on("listening", () => log.mm(`started listening on port ${wsPort}`));

const pingInterval = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

wss.on("close", () => clearInterval(pingInterval));

wss.on("connection", async (ws, req) => {
  if (ws.protocol?.toLowerCase().includes("xmpp")) {
    log.error("XMPP protocol detected, closing connection");
    return ws.close();
  }

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });
  ws.on("ping", () => { ws.pong(); });

  const urlParams = new URLSearchParams(req.url.split("?")[1] || "");
  const region    = (urlParams.get("region")    || "NAE").toUpperCase();
  const playlist  = (urlParams.get("playlist")  || "playlist_defaultsolo").toLowerCase();
  const accountId = urlParams.get("accountId")  || crypto.randomBytes(8).toString("hex");

  if (getQueueSize(region, playlist) >= MAX_QUEUE_SIZE) {
    sendError(ws, "Queue is full, please try again later.");
    return ws.close();
  }

  playerMeta.set(accountId, { ws, region, playlist, joinedAt: Date.now() });
  addToQueue(accountId, region, playlist);
  log.queue(`[${region}:${playlist}] Player queued (${getQueueSize(region, playlist)} in queue)`);

  ws.on("close", () => {
    removeFromQueue(accountId);
    log.unqueue(`[${region}:${playlist}] Player left`);
  });
  ws.on("error", (err) => log.error(`WS error: ${err.message}`));

  try {
    await runMatchmakingFlow(ws, accountId, region, playlist);
  } catch (err) {
    log.error(`Matchmaker flow error: ${err.message}`);
  }
});

async function runMatchmakingFlow(ws, accountId, region, playlist) {
  const ticketId  = crypto.randomBytes(16).toString("hex");
  const matchId   = crypto.randomBytes(16).toString("hex");
  const sessionId = crypto.randomBytes(16).toString("hex");

  // 1. Connecting
  sendStatus(ws, "Connecting", {});
  await sleep(DELAY_CONNECTING);
  if (ws.readyState !== 1) return cleanup(accountId);

  // 2. Waiting
  sendStatus(ws, "Waiting", { totalPlayers: 1, connectedPlayers: 1 });
  await sleep(DELAY_WAITING);
  if (ws.readyState !== 1) return cleanup(accountId);

  // 3. Queued — wait for a joinable server
  const queuePos = getQueueSize(region, playlist);
  sendStatus(ws, "Queued", {
    ticketId,
    queuedPlayers: queuePos,
    estimatedWaitSec: 0,
    status: {},
  });

  log.mm(`[${region}:${playlist}] Waiting for joinable server...`);

  // Set up overall timeout
  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (ws.readyState === 1) {
      sendError(ws, "Matchmaking timed out. No server available.");
      ws.close();
    }
    cleanup(accountId);
  }, QUEUE_TIMEOUT_MS);

  // Poll for a joinable server
  const assignedServer = await waitForJoinableServer(region, playlist, QUEUE_TIMEOUT_MS - 2000);
  clearTimeout(timeoutHandle);

  if (timedOut || ws.readyState !== 1) return cleanup(accountId);

  if (!assignedServer) {
    sendError(ws, "No server available for your region. Please try again later.");
    ws.close();
    return cleanup(accountId);
  }

  log.mm(`[${region}:${playlist}] Server found: ${assignedServer}`);

  // 4. SessionAssignment
  sendStatus(ws, "SessionAssignment", { matchId });
  await sleep(DELAY_SESSION);
  if (ws.readyState !== 1) return cleanup(accountId);

  // 5. Play
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({
      payload: { matchId, sessionId, joinDelaySec: 1 },
      name: "Play",
    }));
    log.mm(`[${region}:${playlist}] Flow complete — sessionId=${sessionId} server=${assignedServer}`);
  }

  cleanup(accountId);
}

function cleanup(accountId) { removeFromQueue(accountId); }

function sendStatus(ws, state, payload) {
  if (ws.readyState === 1)
    ws.send(JSON.stringify({ payload: { state, ...payload }, name: "StatusUpdate" }));
}

function sendError(ws, message) {
  if (ws.readyState === 1)
    ws.send(JSON.stringify({ payload: { state: "Error", message }, name: "StatusUpdate" }));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
