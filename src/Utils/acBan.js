import { EmbedBuilder } from "discord.js";
import Users from "../User/Mongodb/Schema/user.js";
import log from "./log.js";
import dotenv from "dotenv";
dotenv.config();

const ICON   = "https://s1.directupload.eu/images/260323/jdkj2sxv.png";
const APPEAL = "https://discord.gg/r2p2En6n9U";

export async function acBan(accountId, reason) {
  const user = await Users.findOne({ accountId });
  if (!user || user.banned) return;

  const logEntry = `[${new Date().toISOString()}] ${reason}`;
  await Users.updateOne(
    { accountId },
    {
      $set:  { banned: true, acDetected: true },
      $inc:  { acFlags: 1 },
      $push: { acLog: logEntry },
    }
  );

  // Kick active session
  const accessIndex = global.accessTokens?.findIndex(t => t.accountId === accountId);
  if (accessIndex !== undefined && accessIndex !== -1) global.accessTokens.splice(accessIndex, 1);
  const xmppClient = global.Clients?.find(c => c.accountId === accountId);
  if (xmppClient) xmppClient.client.close();

  log.warn(`[AC] AUTO-BAN ${user.username} (${accountId}) — ${reason}`);

  // DM the user
  try {
    const discordClient = global.discordClient;
    if (discordClient && user.discordId) {
      const dmUser = await discordClient.users.fetch(user.discordId).catch(() => null);
      if (dmUser) {
        const embed = new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: "AerisMP Anti-Cheat", iconURL: ICON })
          .setDescription(
            `> You have been **permanently banned** from AerisMP.\n> \n> **Reason:** ${reason}\n> \n> You may appeal your ban at [our Discord](${APPEAL}).`
          )
          .addFields(
            { name: "Username", value: `\`${user.username}\``,        inline: true },
            { name: "Appeal",   value: `[Click here](${APPEAL})`,     inline: true }
          )
          .setFooter({ text: "AerisMP Anti-Cheat System", iconURL: ICON })
          .setTimestamp();
        await dmUser.send({ embeds: [embed] }).catch(() => {});
      }
    }
  } catch {}

  // Webhook log
  const webhook = process.env.GIVE_WEBHOOK;
  if (webhook) {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          color: 0xe74c3c,
          author: { name: "AerisMP Anti-Cheat Auto-Ban", icon_url: ICON },
          fields: [
            { name: "Player",    value: `\`${user.username}\``,  inline: true },
            { name: "AccountId", value: `\`${accountId}\``,      inline: true },
            { name: "Reason",    value: reason,                   inline: false },
          ],
          footer: { text: "AerisMP Anti-Cheat System", icon_url: ICON },
          timestamp: new Date().toISOString(),
        }],
      }),
    }).catch(() => {});
  }
}
