import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

export const data = new SlashCommandBuilder()
  .setName('vbucks')
  .setDescription('Check your V-Bucks balance.')
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const dbUser = await Users.findOne({ discordId: interaction.user.id });
    if (!dbUser) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP V-Bucks', iconURL: ICON })
          .setDescription('> No AerisMP account linked to your Discord.')
          .setFooter({ text: 'AerisMP', iconURL: ICON })],
      });
    }

    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/vbucks/balance/${dbUser.accountId}`, {
      headers: { 'x-api-key': process.env.API_KEY || '' },
    });

    const data = await res.json();
    if (!res.ok) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP V-Bucks', iconURL: ICON })
          .setDescription(`> Failed to fetch balance: ${data.error || res.statusText}`)
          .setFooter({ text: 'AerisMP', iconURL: ICON })],
      });
    }

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xffd700)
        .setAuthor({ name: 'AerisMP V-Bucks', iconURL: ICON })
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setDescription(`> **${interaction.user.username}**, your current balance:`)
        .addFields({ name: 'V-Bucks', value: `\`${data.vbucks.toLocaleString()} VB\``, inline: true })
        .setFooter({ text: 'AerisMP', iconURL: ICON })
        .setTimestamp()],
    });
  } catch (err) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while fetching your balance.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
    });
  }
}
