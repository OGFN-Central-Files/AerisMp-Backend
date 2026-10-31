import express from "express";
import { EmbedBuilder } from "discord.js";
import Users from "../User/Mongodb/Schema/user.js";
import log from "../Utils/log.js";
import { acBan } from "../Utils/acBan.js";
import { verifyToken } from "../User/tokenManager/tokenVerify.js";
import dotenv from "dotenv";
dotenv.config();

const app = express.Router();
const ICON   = "https://s1.directupload.eu/images/260323/jdkj2sxv.png";
const APPEAL = "https://discord.gg/r2p2En6n9U";

async function notifyBannedUser(discordId, username, reason) {
  try {
    const discordClient = global.discordClient;
    if (!discordClient) return;

    const dmUser = await discordClient.users.fetch(discordId).catch(() => null);
    if (!dmUser) return;

    const embed = new EmbedBuilder()
      .setColor(0xe74c3c)
      .setAuthor({ name: "AerisMP Anti-Cheat", iconURL: ICON })
      .setDescription(
        `> You have been **permanently banned** from AerisMP.\n> \n> **Reason:** ${reason}\n> \n> You may appeal your ban at [our Discord](${APPEAL}).`
      )
      .addFields(
        { name: "Username", value: `\`${username}\``, inline: true },
        { name: "Appeal",   value: `[Click here](${APPEAL})`, inline: true }
      )
      .setFooter({ text: "AerisMP Anti-Cheat System", iconURL: ICON })
      .setTimestamp();

    await dmUser.send({ embeds: [embed] }).catch(() => {});
  } catch (err) {
    log.error(`[AC] Failed to DM banned user: ${err.message}`);
  }
}

async function logToWebhook(username, accountId, reason) {
  const webhook = process.env.GIVE_WEBHOOK;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          color: 0xe74c3c,
          author: { name: "AerisMP Anti-Cheat Auto-Ban", icon_url: ICON },
          fields: [
            { name: "Player",    value: `\`${username}\``,  inline: true },
            { name: "AccountId", value: `\`${accountId}\``, inline: true },
            { name: "Reason",    value: reason,              inline: false },
          ],
          footer: { text: "AerisMP Anti-Cheat System", icon_url: ICON },
          timestamp: new Date().toISOString(),
        }],
      }),
    }).catch(() => {});
  } catch {}
}

// POST /anticheat/inject
// Called by the game client when injection is detected.
// The client sends its bearer token; verifyToken populates req.user.
app.post("/anticheat/inject", verifyToken, async (req, res) => {
  const user = req.user;

  // Respond immediately so the client gets kicked before any further action
  res.status(200).json({ status: "detected" });

  try {
    const dbUser = await Users.findOne({ accountId: user.accountId });
    if (!dbUser || dbUser.banned) return;

    const reason = "Cheat injection detected";

    // Ban in DB + flag
    const logEntry = `[${new Date().toISOString()}] ${reason}`;
    await Users.updateOne(
      { accountId: user.accountId },
      {
        $set:  { banned: true, acDetected: true },
        $inc:  { acFlags: 1 },
        $push: { acLog: logEntry },
      }
    );

    // Revoke access token
    const accessIndex = global.accessTokens?.findIndex(t => t.accountId === user.accountId);
    if (accessIndex !== undefined && accessIndex !== -1) {
      global.accessTokens.splice(accessIndex, 1);
    }

    // Kick XMPP session (boots them from the game)
    const xmppClient = global.Clients?.find(c => c.accountId === user.accountId);
    if (xmppClient) xmppClient.client.close();

    log.warn(`[AC] INJECT-BAN ${dbUser.username} (${user.accountId}) — ${reason}`);

    // DM the player with the ban notice and appeal link
    await notifyBannedUser(dbUser.discordId, dbUser.username, reason);

    // Log to webhook
    await logToWebhook(dbUser.username, user.accountId, reason);

  } catch (err) {
    log.error(`[AC] Inject handler error: ${err.message}`);
  }
});

// POST /anticheat/report  { accountId, reason }
// Manual report endpoint (e.g. called by game server)
app.post("/anticheat/report", verifyToken, async (req, res) => {
  const { accountId, reason = "Cheat injection detected" } = req.body;

  if (!accountId) return res.status(400).json({ error: "Missing accountId" });

  try {
    const user = await Users.findOne({ accountId });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.banned) return res.status(200).json({ status: "already_banned" });

    await acBan(accountId, reason);
    return res.status(200).json({ status: "banned", username: user.username });
  } catch (err) {
    log.error(`[AC] Report error: ${err.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
