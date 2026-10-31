import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import log from '../../../core/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

function isMod(id) {
  return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
    .filter(Boolean).includes(id);
}

export const data = new SlashCommandBuilder()
  .setName('ban')
  .setDescription('Ban or unban a player from the server.')
  .addSubcommand(sub => sub
    .setName('add')
    .setDescription('Ban a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Ban reason').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('remove')
    .setDescription('Unban a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
  )
  .setDMPermission(false);

export async function execute(interaction) {
  if (!isMod(interaction.user.id)) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const sub        = interaction.options.getSubcommand();
  const targetUser = interaction.options.getUser('user');
  const reason     = interaction.options.getString('reason') || 'No reason provided.';

  try {
    const dbUser = await Users.findOne({ discordId: targetUser.id });

    if (!dbUser) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Ban', iconURL: ICON })
          .setDescription(`> No AerisMP account found for **${targetUser.username}**.`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      });
    }

    if (sub === 'add') {
      if (dbUser.banned) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: 'AerisMP Ban', iconURL: ICON })
            .setDescription(`> **${dbUser.username}** is already banned.`)
            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
        });
      }

      await Users.updateOne({ discordId: targetUser.id }, { $set: { banned: true } });
      log.bot(`[BAN] ${dbUser.username} (${dbUser.accountId}) banned by ${interaction.user.tag} — ${reason}`);

      if (process.env.GIVE_WEBHOOK) {
        await fetch(process.env.GIVE_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              color: 0xe74c3c,
              author: { name: 'AerisMP Player Banned', icon_url: ICON },
              thumbnail: { url: targetUser.displayAvatarURL({ dynamic: true }) },
              fields: [
                { name: 'Player',  value: `<@${targetUser.id}> (${dbUser.username})`, inline: true },
                { name: 'Admin',   value: `<@${interaction.user.id}>`,                inline: true },
                { name: 'Reason',  value: reason,                                     inline: false },
              ],
              footer: { text: 'AerisMP Admin Panel', icon_url: ICON },
              timestamp: new Date().toISOString(),
            }],
          }),
        }).catch(() => {});
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Player Banned', iconURL: ICON })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Player', value: `\`${dbUser.username}\``, inline: true },
            { name: 'Reason', value: `\`${reason}\``,          inline: true },
          )
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
          .setTimestamp()],
      });
    }

    if (sub === 'remove') {
      if (!dbUser.banned) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: 'AerisMP Unban', iconURL: ICON })
            .setDescription(`> **${dbUser.username}** is not banned.`)
            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
        });
      }

      await Users.updateOne({ discordId: targetUser.id }, { $set: { banned: false } });
      log.bot(`[UNBAN] ${dbUser.username} (${dbUser.accountId}) unbanned by ${interaction.user.tag}`);

      if (process.env.GIVE_WEBHOOK) {
        await fetch(process.env.GIVE_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              color: 0x57f287,
              author: { name: 'AerisMP Player Unbanned', icon_url: ICON },
              thumbnail: { url: targetUser.displayAvatarURL({ dynamic: true }) },
              fields: [
                { name: 'Player', value: `<@${targetUser.id}> (${dbUser.username})`, inline: true },
                { name: 'Admin',  value: `<@${interaction.user.id}>`,                inline: true },
              ],
              footer: { text: 'AerisMP Admin Panel', icon_url: ICON },
              timestamp: new Date().toISOString(),
            }],
          }),
        }).catch(() => {});
      }

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: 'AerisMP Player Unbanned', iconURL: ICON })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .setDescription(`> **${dbUser.username}** has been unbanned.`)
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
          .setTimestamp()],
      });
    }

  } catch (err) {
    log.error(`Ban command error: ${err.stack || err.message}`);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while processing the ban.')
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
    });
  }
}
