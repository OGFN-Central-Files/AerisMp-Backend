import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import Profiles from '../../../database/Schema/profiles.js';
import log from '../../../core/logger.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

function getDivision(hype) {
  if (hype >= 14000) return { name: 'Champion League',  color: 0xfbbf24 };
  if (hype >= 7500)  return { name: 'Contender League', color: 0xa78bfa };
  if (hype >= 3000)  return { name: 'Open League',      color: 0x60a5fa };
  return                    { name: 'Open League',       color: 0x6b7280 };
}

async function logAction(user, target, action, amount, newHype) {
  const webhook = process.env.GIVE_WEBHOOK;
  if (!webhook) return;
  try {
    await axios.post(webhook, {
      embeds: [{
        color: 0x5865f2,
        author: { name: 'AerisMP Arena Hype', icon_url: ICON },
        fields: [
          { name: 'Admin',    value: `<@${user.id}>`,   inline: true },
          { name: 'Target',   value: `<@${target.id}>`, inline: true },
          { name: 'Action',   value: action,             inline: true },
          { name: 'Amount',   value: `${amount} HP`,     inline: true },
          { name: 'New Hype', value: `${newHype} HP`,    inline: true },
        ],
        footer: { text: 'AerisMP Admin Panel', icon_url: ICON },
        timestamp: new Date().toISOString(),
      }],
    });
  } catch (e) {
    log.error(`Hype webhook failed: ${e.message}`);
  }
}

export const data = new SlashCommandBuilder()
  .setName('hype')
  .setDescription('Add hype points to a player.')
  .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of hype to add').setRequired(true).setMinValue(1).setMaxValue(99999))
  .setDMPermission(false);

export async function execute(interaction) {
  const moderators = [
    process.env.MODERATOR_1,
    process.env.MODERATOR_2,
    process.env.MODERATOR_3,
  ].filter(Boolean);

  if (!moderators.includes(interaction.user.id)) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser('user');
  const amount     = interaction.options.getInteger('amount');

  try {
    const dbUser = await Users.findOne({ discordId: targetUser.id });
    if (!dbUser) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Hype', iconURL: ICON })
          .setDescription(`> No AerisMP account found for **${targetUser.username}**.`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    const profile = await Profiles.findOne({ accountId: dbUser.accountId });
    if (!profile?.profiles?.athena) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Hype', iconURL: ICON })
          .setDescription('> Profile data not found or corrupted.')
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    const athena      = profile.profiles.athena;
    const currentHype = athena.stats?.attributes?.arena_hype ?? 0;
    const newHype     = currentHype + amount;

    athena.stats.attributes.arena_hype = newHype;
    athena.rvn = (athena.rvn ?? 0) + 1;
    athena.commandRevision = (athena.commandRevision ?? 0) + 1;
    athena.updated = new Date().toISOString();

    await Profiles.updateOne(
      { accountId: dbUser.accountId },
      { $set: { 'profiles.athena': athena } }
    );

    const div = getDivision(newHype);
    await logAction(interaction.user, targetUser, 'Added', amount, newHype);

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(div.color)
        .setAuthor({ name: 'AerisMP Hype Added', iconURL: ICON })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(`> **${targetUser.username}**'s hype has been updated.`)
        .addFields(
          { name: 'Added',     value: `\`+${amount} HP\``,                 inline: true },
          { name: 'New Total', value: `\`${newHype.toLocaleString()} HP\``, inline: true },
          { name: 'Division',  value: div.name,                             inline: true },
        )
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
        .setTimestamp()],
    });

  } catch (err) {
    log.error(`Hype command error: ${err.stack || err.message}`);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while updating hype.')
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
    });
  }
}
