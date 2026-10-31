import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Users from '../../../database/Schema/user.js';
import log from '../../../core/logger.js';
import { acBan } from '../../../Utils/acBan.js';
import dotenv from 'dotenv';
dotenv.config();

const ICON   = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';
const APPEAL = 'https://discord.gg/r2p2En6n9U';

function isMod(id) {
  return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
    .filter(Boolean).includes(id);
}

export const data = new SlashCommandBuilder()
  .setName('anticheat')
  .setDescription('Anti-cheat management.')
  .addSubcommand(sub => sub
    .setName('ban')
    .setDescription('Manually AC-ban a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
  )
  .addSubcommand(sub => sub
    .setName('info')
    .setDescription('Check AC ban status of a player.')
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
  const reason     = interaction.options.getString('reason') || 'Manual AC ban by staff.';

  try {
    const dbUser = await Users.findOne({ discordId: targetUser.id });

    if (!dbUser) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Anti-Cheat', iconURL: ICON })
          .setDescription(`> No AerisMP account found for **${targetUser.username}**.`)
          .setFooter({ text: 'AerisMP Anti-Cheat System', iconURL: ICON })],
      });
    }

    if (sub === 'ban') {
      if (dbUser.banned) {
        return interaction.editReply({
          embeds: [new EmbedBuilder()
            .setColor(0xe74c3c)
            .setAuthor({ name: 'AerisMP Anti-Cheat', iconURL: ICON })
            .setDescription(`> **${dbUser.username}** is already banned.`)
            .setFooter({ text: 'AerisMP Anti-Cheat System', iconURL: ICON })],
        });
      }

      await acBan(dbUser.accountId, reason);
      log.bot(`[AC] ${dbUser.username} manually banned by ${interaction.user.tag} — ${reason}`);

      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Anti-Cheat Ban', iconURL: ICON })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Player', value: `\`${dbUser.username}\``, inline: true },
            { name: 'Reason', value: `\`${reason}\``,          inline: true },
          )
          .setFooter({ text: 'AerisMP Anti-Cheat System', iconURL: ICON })
          .setTimestamp()],
      });
    }

    if (sub === 'info') {
      const logEntries = dbUser.acLog?.slice(-3).join('\n') || 'No detections logged.';
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(dbUser.acDetected ? 0xe74c3c : 0x57f287)
          .setAuthor({ name: 'AerisMP Anti-Cheat', iconURL: ICON })
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: 'Player',     value: `\`${dbUser.username}\``,                              inline: true },
            { name: 'Status',     value: dbUser.acDetected ? '🔴 Detected' : '🟢 Clean',       inline: true },
            { name: 'AC Flags',   value: `\`${dbUser.acFlags || 0}\``,                          inline: true },
            { name: 'Ban Status', value: dbUser.banned ? '🔴 Banned' : '🟢 Active',            inline: true },
            { name: 'Last Detections', value: `\`\`\`${logEntries}\`\`\``,                      inline: false },
          )
          .setFooter({ text: 'AerisMP Anti-Cheat System', iconURL: ICON })
          .setTimestamp()],
      });
    }

  } catch (err) {
    log.error(`AC command error: ${err.stack || err.message}`);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> An error occurred while processing the request.')
        .setFooter({ text: 'AerisMP Anti-Cheat System', iconURL: ICON })],
    });
  }
}
