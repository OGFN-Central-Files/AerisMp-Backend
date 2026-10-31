import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import log from '../../../core/logger.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

function isMod(id) {
  return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
    .filter(Boolean).includes(id);
}

export const data = new SlashCommandBuilder()
  .setName('give')
  .setDescription('Give V-Bucks to a player.')
  .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
  .addIntegerOption(o => o.setName('amount').setDescription('Amount of V-Bucks').setRequired(true).setMinValue(1).setMaxValue(999999))
  .setDMPermission(false);

export async function execute(interaction) {
  if (!isMod(interaction.user.id)) {
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
          .setAuthor({ name: 'AerisMP Give V-Bucks', iconURL: ICON })
          .setDescription(`> No AerisMP account found for **${targetUser.username}**.`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/vbucks/give`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || process.env.GAME_API_KEY || '' },
      body: JSON.stringify({ accountId: dbUser.accountId, amount }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Give V-Bucks', iconURL: ICON })
          .setDescription(`> Failed: ${err.error || res.statusText}`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    const data = await res.json();

    if (process.env.GIVE_WEBHOOK) {
      await axios.post(process.env.GIVE_WEBHOOK, {
        embeds: [{
          color: 0xffd700,
          author: { name: 'AerisMP V-Bucks Given', icon_url: ICON },
          fields: [
            { name: 'Admin',  value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Target', value: `<@${targetUser.id}>`,       inline: true },
            { name: 'Amount', value: `${amount} V-Bucks`,         inline: true },
          ],
          footer: { text: 'AerisMP Admin Panel', icon_url: ICON },
          timestamp: new Date().toISOString(),
        }],
      }).catch(() => {});
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: 'AerisMP V-Bucks Given', iconURL: ICON })
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setDescription(`> **${targetUser.username}** received **${amount.toLocaleString()} V-Bucks**.`)
        .addFields(
          { name: 'Given',     value: `\`${amount.toLocaleString()} VB\``,             inline: true },
          { name: 'New Total', value: `\`${(data.vbucks ?? '?').toLocaleString()} VB\``, inline: true },
        )
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
        .setTimestamp()],
    });
  } catch (err) {
    log.error(`Give command error: ${err.stack || err.message}`);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while giving V-Bucks.')
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
    });
  }
}
