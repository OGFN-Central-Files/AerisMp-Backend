import express from "express";
const app = express.Router();
import log from "../Utils/log.js";

import dotenv from "dotenv";
dotenv.config();

// In-memory registry: key = "region:playlist:port"
// joinable = server has signalled it's ready to accept players
const serverRegistry = new Map();

const STALE_TIMEOUT_MS = parseInt(process.env.MM_HEALTH_TIMEOUT_MS) * 3 || 90000;

// Poll interval when waiting for a server to become joinable (ms)
export const JOINABLE_POLL_MS = parseInt(process.env.MM_JOINABLE_POLL_MS) || 2000;
// Max time to wait for a server to become joinable before timing out (ms)
export const JOINABLE_WAIT_MS = parseInt(process.env.MM_JOINABLE_WAIT_MS) || 60000;

export function registryKey(region, playlist, port) {
  return `${region.toUpperCase()}:${playlist.toLowerCase()}:${port}`;
}

export { serverRegistry, STALE_TIMEOUT_MS };

function pruneStale() {
  const now = Date.now();
  for (const [key, entry] of serverRegistry.entries()) {
    if (now - entry.lastSeen > STALE_TIMEOUT_MS) {
      serverRegistry.delete(key);
      log.info(`[GameServer] Pruned stale server: ${key}`);
    }
  }
}

setInterval(pruneStale, 30000);

function requireApiKey(req, res, next) {
  if (req.headers["x-api-key"] !== process.env.API_KEY) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

function getIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0].trim()
    || req.socket.remoteAddress
    || "127.0.0.1";
}

// Register — server is online but NOT yet joinable
app.get("/api/v1/gameserver/register", requireApiKey, (req, res) => {
  const { region, playlist, port } = req.query;
  if (!region || !playlist || !port)
    return res.status(400).json({ error: "region, playlist, and port are required" });

  const key = registryKey(region, playlist, port);
  serverRegistry.set(key, {
    ip: getIp(req),
    port: parseInt(port, 10),
    region: region.toUpperCase(),
    playlist: playlist.toLowerCase(),
    playerCount: 0,
    joinable: false,       // not ready yet
    registeredAt: new Date().toISOString(),
    lastSeen: Date.now(),
  });

  log.info(`[GameServer] Registered (not joinable): ${key}`);
  res.json({ ok: true, key });
});

// Heartbeat — also accepts joinable flag
// joinable=true  → server is ready for players
// joinable=false → server is in-game / not accepting new players
app.get("/api/v1/gameserver/heartbeat", requireApiKey, (req, res) => {
  const { region, playlist, port, playerCount, joinable } = req.query;
  if (!region || !playlist || !port)
    return res.status(400).json({ error: "region, playlist, and port are required" });

  const key = registryKey(region, playlist, port);
  const entry = serverRegistry.get(key);
  const isJoinable = joinable === "true";

  if (!entry) {
    serverRegistry.set(key, {
      ip: getIp(req),
      port: parseInt(port, 10),
      region: region.toUpperCase(),
      playlist: playlist.toLowerCase(),
      playerCount: parseInt(playerCount, 10) || 0,
      joinable: isJoinable,
      registeredAt: new Date().toISOString(),
      lastSeen: Date.now(),
    });
    log.info(`[GameServer] Auto-registered via heartbeat: ${key} joinable=${isJoinable}`);
  } else {
    const wasJoinable = entry.joinable;
    entry.lastSeen    = Date.now();
    entry.playerCount = parseInt(playerCount, 10) || 0;
    entry.joinable    = isJoinable;

    if (!wasJoinable && isJoinable)
      log.info(`[GameServer] Server now joinable: ${key}`);
    else if (wasJoinable && !isJoinable)
      log.info(`[GameServer] Server no longer joinable: ${key}`);
  }

  res.json({ ok: true });
});

// Joinable shortcut — game server calls this when the map finishes loading
app.get("/api/v1/gameserver/joinable", requireApiKey, (req, res) => {
  const { region, playlist, port } = req.query;
  if (!region || !playlist || !port)
    return res.status(400).json({ error: "region, playlist, and port are required" });

  const key = registryKey(region, playlist, port);
  const entry = serverRegistry.get(key);
  if (!entry) return res.status(404).json({ error: "Server not registered" });

  entry.joinable  = true;
  entry.lastSeen  = Date.now();
  log.info(`[GameServer] Joinable signal received: ${key}`);
  res.json({ ok: true });
});

// Not-joinable — game server calls this when match starts (no more new players)
app.get("/api/v1/gameserver/notjoinable", requireApiKey, (req, res) => {
  const { region, playlist, port } = req.query;
  if (!region || !playlist || !port)
    return res.status(400).json({ error: "region, playlist, and port are required" });

  const key = registryKey(region, playlist, port);
  const entry = serverRegistry.get(key);
  if (!entry) return res.status(404).json({ error: "Server not registered" });

  entry.joinable = false;
  entry.lastSeen = Date.now();
  log.info(`[GameServer] Not-joinable signal received: ${key}`);
  res.json({ ok: true });
});

app.get("/api/v1/gameserver/unregister", requireApiKey, (req, res) => {
  const { region, playlist, port } = req.query;
  if (!region || !playlist || !port)
    return res.status(400).json({ error: "region, playlist, and port are required" });

  const key = registryKey(region, playlist, port);
  const existed = serverRegistry.delete(key);
  if (existed) log.info(`[GameServer] Unregistered: ${key}`);
  res.json({ ok: true, existed });
});

app.get("/api/v1/gameserver/list", requireApiKey, (req, res) => {
  pruneStale();
  const servers = Array.from(serverRegistry.values()).map((s) => ({
    ...s,
    lastSeenAgo: Math.round((Date.now() - s.lastSeen) / 1000) + "s ago",
  }));
  res.json({ count: servers.length, servers });
});

export default app;
