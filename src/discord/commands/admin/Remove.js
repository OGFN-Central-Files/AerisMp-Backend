import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import Profiles from '../../../database/Schema/profiles.js';
import Friends from '../../../database/Schema/friends.js';
import log from '../../../core/logger.js';
import dotenv from 'dotenv';
dotenv.config();

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

function isMod(id) {
  return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
    .filter(Boolean).includes(id);
}

export const data = new SlashCommandBuilder()
  .setName('remove')
  .setDescription("Delete a player's AerisMP account.")
  .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
  .setDMPermission(false);

export async function execute(interaction) {
  if (!isMod(interaction.user.id)) {
    return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const targetUser = interaction.options.getUser('user');

  const dbUser = await Users.findOne({ discordId: targetUser.id });
  if (!dbUser) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Remove Account', iconURL: ICON })
        .setDescription(`> No AerisMP account found for **${targetUser.username}**.`)
        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
      ephemeral: true,
    });
  }

  const confirm = new ButtonBuilder().setCustomId('confirm_remove').setLabel('Delete Account').setStyle(ButtonStyle.Danger);
  const cancel  = new ButtonBuilder().setCustomId('cancel_remove').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
  const row     = new ActionRowBuilder().addComponents(confirm, cancel);

  const warnEmbed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setAuthor({ name: 'AerisMP Remove Account', iconURL: ICON })
    .setDescription(`> Are you sure you want to **permanently delete** **${dbUser.username}**'s account?\n> This cannot be undone.`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: 'AerisMP Admin Panel  •  60s to confirm', iconURL: ICON })
    .setTimestamp();

  const response = await interaction.reply({ embeds: [warnEmbed], components: [row], ephemeral: true });
  const collector = response.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 60_000,
  });

  collector.on('collect', async (i) => {
    collector.stop();
    if (i.customId === 'confirm_remove') {
      try {
        await Users.findOneAndDelete({ discordId: targetUser.id });
        await Profiles.findOneAndDelete({ accountId: dbUser.accountId });
        await Friends.findOneAndDelete({ accountId: dbUser.accountId });
        log.backend(`Account deleted by admin: ${dbUser.username} (${dbUser.accountId})`);
        await i.update({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: 'AerisMP Account Deleted', iconURL: ICON })
            .setDescription(`> **${dbUser.username}**'s account has been permanently deleted.`)
            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
            .setTimestamp()],
          components: [],
        });
      } catch (err) {
        log.error(`Remove command error: ${err.message}`);
        await i.update({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
            .setDescription('> Failed to delete the account.')
            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
          components: [],
        });
      }
    } else {
      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: 'AerisMP Cancelled', iconURL: ICON })
          .setDescription('> Action cancelled — no changes were made.')
          .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
        components: [],
      });
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
  });
}
