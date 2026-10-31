import express from "express";
import { client } from "../discord/index.js";
import User from "../User/Mongodb/Schema/user.js";
import Profile from "../User/Mongodb/Schema/profiles.js";
import log from "../Utils/log.js";

const app = express.Router();

// ── Avatar by accountId ──────────────────────────────────────────────────────
app.get("/api/launcher/avatar/:accountId", async (req, res) => {
  try {
    const user = await User.findOne({ accountId: req.params.accountId }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    let avatarUrl = null;
    if (user.discordId) {
      try {
        const member = await client.users.fetch(user.discordId);
        if (member?.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${member.avatar}.png?size=128`;
        } else if (member) {
          const idx = Number(BigInt(user.discordId) >> 22n) % 6;
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
        }
      } catch {
        // Discord fetch failed — fall through to null
      }
    }

    res.json({ avatarUrl });
  } catch (err) {
    log.error(`launcher/avatar error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Avatar by email ──────────────────────────────────────────────────────────
app.get("/api/launcher/avatar/email/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: decodeURIComponent(req.params.email).toLowerCase() }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    let avatarUrl = null;
    if (user.discordId) {
      try {
        const member = await client.users.fetch(user.discordId);
        if (member?.avatar) {
          avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${member.avatar}.png?size=128`;
        } else if (member) {
          const idx = Number(BigInt(user.discordId) >> 22n) % 6;
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
        }
      } catch {
        // ignore
      }
    }

    res.json({ avatarUrl });
  } catch (err) {
    log.error(`launcher/avatar/email error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Discord user info by accountId ───────────────────────────────────────────
app.get("/api/launcher/discord/:accountId", async (req, res) => {
  try {
    const user = await User.findOne({ accountId: req.params.accountId }).lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    let discordUsername = null;
    let avatarUrl = null;

    if (user.discordId) {
      try {
        const member = await client.users.fetch(user.discordId);
        if (member) {
          discordUsername = member.username;
          if (member.avatar) {
            avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${member.avatar}.png?size=128`;
          } else {
            const idx = Number(BigInt(user.discordId) >> 22n) % 6;
            avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
          }
        }
      } catch {
        // ignore
      }
    }

    res.json({ discordUsername, avatarUrl });
  } catch (err) {
    log.error(`launcher/discord error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Arena leaderboard ────────────────────────────────────────────────────────
app.get("/api/launcher/leaderboard/arena", async (req, res) => {
  try {
    const profiles = await Profile.find({}).lean();

    const entries = [];
    for (const p of profiles) {
      const hype = p.profiles?.athena?.stats?.attributes?.arena_hype ?? 0;
      if (hype <= 0) continue;

      const user = await User.findOne({ accountId: p.accountId }).lean();
      if (!user || user.banned) continue;

      entries.push({
        displayName: user.username,
        account: p.accountId,
        value: hype,
      });
    }

    entries.sort((a, b) => b.value - a.value);

    res.json({ entries });
  } catch (err) {
    log.error(`launcher/leaderboard/arena error: ${err.message}`);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Server list ──────────────────────────────────────────────────────────────
app.get("/api/v1/launcher/servers", (req, res) => {
  // Populate this with real server data if you have a server registry.
  // For now returns an empty list so the Servers page shows "no servers online".
  res.json({ servers: [] });
});

export default app;
