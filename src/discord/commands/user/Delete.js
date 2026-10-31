import { ButtonBuilder, ButtonStyle, EmbedBuilder, ActionRowBuilder, SlashCommandBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import Profiles from '../../../database/Schema/profiles.js';
import Friends from '../../../database/Schema/friends.js';

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

export const data = new SlashCommandBuilder()
  .setName('deletemyaccount')
  .setDescription('Permanently delete your AerisMP account')
  .setDMPermission(false);

export async function execute(interaction) {
  const user = await Users.findOne({ discordId: interaction.user.id });
  if (!user) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Delete Account', iconURL: ICON })
        .setDescription('> You do not have an AerisMP account.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
      ephemeral: true,
    });
  }

  if (user.banned) {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Delete Account', iconURL: ICON })
        .setDescription('> Banned accounts cannot be deleted.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
      ephemeral: true,
    });
  }

  const confirm = new ButtonBuilder().setCustomId('confirm_delete').setLabel('Delete My Account').setStyle(ButtonStyle.Danger);
  const cancel  = new ButtonBuilder().setCustomId('cancel_delete').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
  const row     = new ActionRowBuilder().addComponents(confirm, cancel);

  const warnEmbed = new EmbedBuilder()
    .setColor(0xe67e22)
    .setAuthor({ name: 'AerisMP Delete Account', iconURL: ICON })
    .setDescription('> **This action is permanent and cannot be undone.**\n> All your data, cosmetics and progress will be lost forever.')
    .addFields({ name: 'Account', value: `\`${user.username}\``, inline: true })
    .setFooter({ text: 'AerisMP  You have 60 seconds to confirm', iconURL: ICON })
    .setTimestamp();

  const response = await interaction.reply({ embeds: [warnEmbed], components: [row], ephemeral: true });
  const collector = response.createMessageComponentCollector({
    filter: i => i.user.id === interaction.user.id,
    time: 60_000,
  });

  collector.on('collect', async (i) => {
    collector.stop();
    if (i.customId === 'confirm_delete') {
      await Users.findOneAndDelete({ discordId: interaction.user.id });
      await Profiles.findOneAndDelete({ accountId: user.accountId });
      await Friends.findOneAndDelete({ accountId: user.accountId });

      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Account Deleted', iconURL: ICON })
          .setDescription('> Your AerisMP account has been permanently deleted.')
          .setFooter({ text: 'AerisMP', iconURL: ICON })
          .setTimestamp()],
        components: [],
      });
    } else {
      await i.update({
        embeds: [new EmbedBuilder()
          .setColor(0x57f287)
          .setAuthor({ name: 'AerisMP Cancelled', iconURL: ICON })
          .setDescription('> Your account is safe — nothing was deleted.')
          .setFooter({ text: 'AerisMP', iconURL: ICON })
          .setTimestamp()],
        components: [],
      });
    }
  });

  collector.on('end', (_, reason) => {
    if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
  });
}
