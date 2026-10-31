import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import log from '../../../core/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

function isMod(id) {
  return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
    .filter(Boolean).includes(id);
}

export const data = new SlashCommandBuilder()
  .setName('rotate')
  .setDescription('Force rotate the item shop.')
  .setDMPermission(false);

export async function execute(interaction) {
  if (!isMod(interaction.user.id)) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/shop/rotate`, {
      method: 'POST',
      headers: { 'x-api-key': process.env.API_KEY || process.env.GAME_API_KEY || '' },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Shop Rotate', iconURL: ICON })
          .setDescription(`> Failed to rotate shop: ${err.error || res.statusText}`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    log.backend(`Shop rotated by ${interaction.user.username} (${interaction.user.id})`);

    const data = await res.json().catch(() => ({}));

    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: 'AerisMP Shop Rotated', iconURL: ICON })
        .setDescription('> The item shop has been successfully rotated.')
        .addFields(
          { name: 'Featured', value: `\`${data.weekly ?? '?'}\` items`, inline: true },
          { name: 'Daily', value: `\`${data.daily ?? '?'}\` items`, inline: true },
          { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true },
        )
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
        .setTimestamp()],
    });
  } catch (err) {
    log.error(`Rotate command error: ${err.stack || err.message}`);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while rotating the shop.')
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
    });
  }
}
