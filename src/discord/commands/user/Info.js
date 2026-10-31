import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import log from '../../../core/logger.js';

const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('View your AerisMP account details.')
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const user = await Users.findOne({ discordId: interaction.user.id });

    if (!user) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Account Info', iconURL: ICON })
          .setDescription('> You do not have an AerisMP account. Use `/register` to create one.')
          .setFooter({ text: 'AerisMP', iconURL: ICON })],
      });
    }

    const created = new Date(user.created).toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: `AerisMP Account Info`, iconURL: ICON })
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Username',   value: `\`\`\`${user.username}\`\`\``,  inline: true },
        { name: 'Email',      value: `\`\`\`${user.email}\`\`\``,     inline: true },
        { name: 'Registered', value: `\`${created}\``,                inline: false },
      )
      .setFooter({ text: 'AerisMP  Click "Forgot Password" to show your password', iconURL: ICON })
      .setTimestamp();

    const revealBtn = new ButtonBuilder()
      .setCustomId('reveal_password')
      .setLabel('Forgot Password')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(revealBtn);

    const response = await interaction.editReply({ embeds: [embed], components: [row] });

    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id && i.customId === 'reveal_password',
      time: 120_000,
      max: 1,
    });

    collector.on('collect', async (i) => {
      const password = user.plainPassword || 'Not available';
      await i.reply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Password', iconURL: ICON })
          .setDescription(`> Your password: \`\`\`${password}\`\`\`\n> **Do not share this with anyone.**`)
          .setFooter({ text: 'AerisMP  This message is only visible to you', iconURL: ICON })
          .setTimestamp()],
        ephemeral: true,
      });
    });

    collector.on('end', () => {
      interaction.editReply({ components: [] }).catch(() => {});
    });

  } catch (err) {
    log.error(`Info command error: ${err.message}`);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> Something went wrong fetching your account info.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
    });
  }
}
