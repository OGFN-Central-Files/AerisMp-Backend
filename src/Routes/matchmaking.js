import express from "express";
const app = express.Router();
import Utils from "../Utils/Utils.js";
import { verifyToken } from "../User/tokenManager/tokenVerify.js";
import qs from "qs";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { serverRegistry, registryKey, STALE_TIMEOUT_MS } from "./gameserver.js";

import dotenv from "dotenv";
dotenv.config();

// ─── Build unique ID cache ────────────────────────────────────────────────────
const buildUniqueId = {};

// ─── Round-robin counters per region ─────────────────────────────────────────
const rrCounters = {};

// ─── Region config ────────────────────────────────────────────────────────────
// REGIONS env: comma-separated list e.g. "EU,NAE,OCE"
// Each region needs a matching <REGION>_IP env var
// Format per region: "IP:PORT|playlist1,playlist2;IP2:PORT|playlist3"
// Custom key servers: CUSTOM_KEY_<KEY>=IP:PORT  (e.g. CUSTOM_KEY_mycode=1.2.3.4:7777)
function getRegions() {
  const raw = process.env.REGIONS || "EU,NAE";
  return raw.split(",").map((r) => r.trim().toUpperCase()).filter(Boolean);
}

/**
 * Parse a region env value into an array of server entries:
 * [{ address: "ip:port", playlists: ["playlist_defaultsolo", ...] | null }]
 * playlists=null means catch-all
 */
function parseRegionEnv(envValue) {
  if (!envValue) return [];
  return envValue.split(";").map((e) => e.trim()).filter(Boolean).map((entry) => {
    const [addrPart, playlistPart] = entry.split("|");
    const playlists = playlistPart
      ? playlistPart.split(",").map((p) => p.trim().toLowerCase()).filter(Boolean)
      : null;
    return { address: addrPart.trim(), playlists };
  });
}

/**
 * Get all servers for a region that match the given playlist.
 * Returns array of "ip:port" strings.
 */
function getServersForPlaylist(region, playlist) {
  const envValue = process.env[`${region}_IP`];
  if (!envValue) return [];
  const entries = parseRegionEnv(envValue);
  const norm = (playlist || "").toLowerCase();

  const explicit = entries.filter(
    (e) => e.playlists && e.playlists.includes(norm)
  );
  if (explicit.length > 0) return explicit.map((e) => e.address);

  const catchAll = entries.filter((e) => !e.playlists || e.playlists.length === 0);
  if (catchAll.length > 0) return catchAll.map((e) => e.address);

  // fallback: first entry
  return entries.length > 0 ? [entries[0].address] : [];
}

/**
 * Round-robin pick from a list of servers for a given key.
 */
function roundRobin(key, servers) {
  if (servers.length === 0) return null;
  if (servers.length === 1) return servers[0];
  if (!rrCounters[key]) rrCounters[key] = 0;
  const picked = servers[rrCounters[key] % servers.length];
  rrCounters[key]++;
  return picked;
}

/**
 * TCP health check — resolves true if the server is reachable within 2s.
 */
function isServerReachable(address) {
  return new Promise((resolve) => {
    const [host, portStr] = address.split(":");
    const port = parseInt(portStr, 10);
    if (!host || isNaN(port)) return resolve(false);

    const socket = new net.Socket();
    const timeout = parseInt(process.env.MM_HEALTH_TIMEOUT_MS) || 2000;

    socket.setTimeout(timeout);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error",   () => { socket.destroy(); resolve(false); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/**
 * Pick the first healthy server from the candidate list (round-robin ordered).
 * Prefers live-registered servers from the game server registry.
 * Falls back to static .env config if no registered servers are available.
 */
async function pickServer(region, playlist) {
  const now = Date.now();
  const norm = playlist.toLowerCase();
  const reg = region.toUpperCase();

  // 1. Check live registry — find servers for this region+playlist that sent a heartbeat recently
  const liveServers = Array.from(serverRegistry.values()).filter((s) => {
    return s.region === reg
      && s.playlist === norm
      && (now - s.lastSeen) < STALE_TIMEOUT_MS;
  });

  if (liveServers.length > 0) {
    // Round-robin across live servers
    const rrKey = `${reg}:${norm}`;
    const picked = roundRobin(rrKey, liveServers.map((s) => `${s.ip}:${s.port}`));
    if (picked) return picked;
  }

  // 2. Fall back to static .env servers with health check
  const servers = getServersForPlaylist(region, playlist);
  if (servers.length === 0) return null;

  const healthCheck = process.env.MM_HEALTH_CHECK !== "false";
  const rrKey = `${reg}:${norm}:static`;

  if (!healthCheck) return roundRobin(rrKey, servers);

  const start = (rrCounters[rrKey] || 0) % servers.length;
  for (let i = 0; i < servers.length; i++) {
    const idx = (start + i) % servers.length;
    const server = servers[idx];
    if (await isServerReachable(server)) {
      rrCounters[rrKey] = idx + 1;
      return server;
    }
  }
  return null;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get("/fortnite/api/matchmaking/session/findPlayer/*", (_req, res) => {
  res.status(200).end();
});

// Stats endpoint (admin use / Discord bot)
app.get("/api/v1/matchmaking/stats", async (req, res) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== process.env.API_KEY) return res.status(403).json({ error: "Forbidden" });

  const regions = getRegions();
  const regionInfo = {};

  for (const region of regions) {
    const envValue = process.env[`${region}_IP`];
    const entries = parseRegionEnv(envValue || "");
    const servers = [];

    for (const entry of entries) {
      const reachable = process.env.MM_HEALTH_CHECK !== "false"
        ? await isServerReachable(entry.address)
        : null;
      servers.push({
        address: entry.address,
        playlists: entry.playlists || ["*"],
        reachable,
      });
    }

    regionInfo[region] = { servers };
  }

  // Pull live queue stats from matchmaker if available
  let queueStats = null;
  try {
    const mmPort = process.env.MATCHMAKER_PORT || 8080;
    const r = await fetch(`http://127.0.0.1:${mmPort}/stats`);
    if (r.ok) queueStats = await r.json();
  } catch { /* matchmaker may not expose HTTP */ }

  res.json({ regions: regionInfo, queue: queueStats });
});

app.get(
  "/fortnite/api/game/v2/matchmakingservice/ticket/player/*",
  verifyToken,
  async (req, res) => {
    const query = qs.parse(req.url.split("?")[1], { ignoreQueryPrefix: true });
    const bucketId = query["bucketId"];
    const playerCustomKey = query["player.option.customKey"];

    if (typeof bucketId !== "string" || bucketId.split(":").length !== 4) {
      return res.status(400).end();
    }

    const [buildId, , rawRegion, playlistRaw] = bucketId.split(":");
    let region = rawRegion?.toUpperCase();

    if (!region || region === "NONE") {
      region = (query["player.option.region"] || "NAE").toUpperCase();
    }

    // Validate region is configured
    if (!getRegions().includes(region)) {
      region = getRegions()[0] || "NAE";
    }

    const playlist = (playlistRaw || "playlist_defaultsolo").toLowerCase();
    const memory = Utils.GetVersion(req);

    // Custom matchmaking key — route to dedicated server if configured
    if (typeof playerCustomKey === "string") {
      const customServer = process.env[`CUSTOM_KEY_${playerCustomKey.toUpperCase()}`];
      if (!customServer) {
        return Utils.createError(
          "errors.com.epicgames.common.matchmaking.code.not_found",
          `Custom matchmaking key '${playerCustomKey}' not found`,
          [],
          1013,
          "invalid_code",
          404,
          res
        );
      }
      // Fall through with customServer stored for session lookup
      await global.kv.set(`playerCustomServer:${req.user.accountId}`, customServer);
    } else {
      await global.kv.set(`playerCustomServer:${req.user.accountId}`, null);
    }

    const matchmakerIP = process.env.MATCHMAKER_IP || "ws://127.0.0.1:8080";
    const baseUrl = matchmakerIP.startsWith("ws") ? matchmakerIP : `ws://${matchmakerIP}`;

    // Pass region, playlist, accountId, customKey to the WS matchmaker via query params
    const mmUrl = new URL(baseUrl);
    mmUrl.searchParams.set("region", region);
    mmUrl.searchParams.set("playlist", playlist);
    mmUrl.searchParams.set("accountId", req.user.accountId);
    if (typeof playerCustomKey === "string") {
      mmUrl.searchParams.set("customKey", playerCustomKey);
    }

    buildUniqueId[req.user.accountId] = buildId;
    await global.kv.set(`playerPlaylist:${req.user.accountId}`, playlist);
    await global.kv.set(`playerRegion:${req.user.accountId}`, region);

    const payload = {
      playerId: req.user.accountId,
      partyPlayerId: query["player.partyPlayerIds"] || req.user.accountId,
      bucketId,
      attributes: {
        "player.mms.region": region,
        "player.userAgent": query["player.userAgent"] || "",
        "player.preferredSubregion": query["player.subregions"]?.split(",")[0] || region,
        "player.option.spectator": "false",
        "player.inputTypes": query["player.inputTypes"] || "",
        "player.revision": query["player.revision"] || "1",
        "player.teamFormat": "fun",
        "player.subregions": query["player.subregions"] || region,
        "player.season": String(memory.season),
        "player.platform": query["player.platform"] || "Windows",
        "player.option.linkCode": query["player.option.linkCode"]?.toLowerCase() || playlist,
        "player.option.linkType": "DEFAULT",
        "player.input": query["player.input"] || "KBM",
        "playlist.revision": query["playlist.revision"] || "1",
        "player.option.fillTeam": query["player.option.fillTeam"] || "true",
        "player.option.uiLanguage": "en",
        "player.option.microphoneEnabled": query["player.option.microphoneEnabled"] || "false",
        "player.option.partyId": query["player.option.partyId"] || uuidv4(),
      },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      nonce: uuidv4().replace(/-/gi, ""),
    };

    return res.json({
      serviceUrl: mmUrl.toString(),
      ticketType: "mms-player",
      payload: JSON.stringify(payload),
      signature: uuidv4().replace(/-/gi, ""),
    });
  }
);

app.get(
  "/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId",
  (_req, res) => {
    res.json({
      accountId: _req.params.accountId,
      sessionId: _req.params.sessionId,
      key: "none",
    });
  }
);

app.get(
  "/fortnite/api/matchmaking/session/:sessionId",
  verifyToken,
  async (req, res) => {
    const playlist =
      (await global.kv.get(`playerPlaylist:${req.user.accountId}`)) ||
      "playlist_defaultsolo";
    const region =
      (await global.kv.get(`playerRegion:${req.user.accountId}`)) || "NAE";

    // Custom key server takes priority
    const customServer = await global.kv.get(`playerCustomServer:${req.user.accountId}`) || null;
    let selectedServer = customServer || null;

    if (!selectedServer) {
      selectedServer = await pickServer(region, playlist);
    }

    if (!selectedServer) {
      return Utils.createError(
        "errors.com.epicgames.common.matchmaking.config_error",
        `No available server for region ${region} and playlist ${playlist}`,
        [],
        1014,
        "invalid_config",
        503,
        res
      );
    }

    const [ip, portStr] = selectedServer.split(":");
    const port = parseInt(portStr, 10);

    res.json({
      id: req.params.sessionId,
      ownerId: "1234567890ABCDEF1234567890ABCDEF12345678",
      ownerName: `[DS]fortnite-live${region.toLowerCase()}gcec1c2e30ubrcore0a-z8hj-1968`,
      serverName: `[DS]fortnite-live${region.toLowerCase()}gcec1c2e30ubrcore0a-z8hj-1968`,
      serverAddress: ip,
      serverPort: port,
      maxPublicPlayers: 220,
      openPublicPlayers: 175,
      maxPrivatePlayers: 0,
      openPrivatePlayers: 0,
      attributes: {
        REGION_s: region,
        GAMEMODE_s: "FORTATHENA",
        ALLOWBROADCASTING_b: true,
        SUBREGION_s: region === "EU" ? "GB" : "US",
        DCID_s: `FORTNITE-LIVE${region}GCEC1C2E30UBRCORE0A-14840880`,
        tenant_s: "Fortnite",
        MATCHMAKINGPOOL_s: "Any",
        STORMSHIELDDEFENSETYPE_i: 0,
        HOTFIXVERSION_i: 0,
        PLAYLISTNAME_s: playlist,
        SESSIONKEY_s: "1234567890ABCDEF1234567890ABCDEF12345678",
        TENANT_s: "Fortnite",
        BEACONPORT_i: 15009,
      },
      publicPlayers: [],
      privatePlayers: [],
      totalPlayers: 45,
      allowJoinInProgress: false,
      shouldAdvertise: false,
      isDedicated: false,
      usesStats: false,
      allowInvites: false,
      usesPresence: false,
      allowJoinViaPresence: true,
      allowJoinViaPresenceFriendsOnly: false,
      buildUniqueId: buildUniqueId[req.user.accountId] || "0",
      lastUpdated: new Date().toISOString(),
      started: false,
    });
  }
);

app.post("/fortnite/api/matchmaking/session/*/join", (_req, res) => {
  res.status(204).end();
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (_req, res) => {
  res.json([]);
});

export default app;
