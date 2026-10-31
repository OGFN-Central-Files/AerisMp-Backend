import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import Utils from '../../../core/helpers.js';
import log from '../../../core/logger.js';
import Users from '../../../database/Schema/user.js';
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const WEBHOOK_URL = process.env.LOG_WEBHOOK;
const ICON        = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';
const CHARS       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generatePassword() {
  return Array.from({ length: 8 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
}

async function sendWebhookLog(username, email, discordUser) {
  if (!WEBHOOK_URL) return;
  try {
    await axios.post(WEBHOOK_URL, {
      embeds: [{
        color: 0x2b2d31,
        author: { name: 'AerisMP New Registration', icon_url: ICON },
        fields: [
          { name: 'Username', value: `\`${username}\``,      inline: true },
          { name: 'Email',    value: `\`${email}\``,         inline: true },
          { name: 'Discord',  value: `<@${discordUser.id}>`, inline: true },
        ],
        thumbnail: { url: discordUser.displayAvatarURL({ dynamic: true }) },
        timestamp: new Date().toISOString(),
        footer: { text: 'AerisMP Registration System', icon_url: ICON },
      }],
    });
  } catch (err) {
    log.error(`Webhook failed: ${err.message}`);
  }
}

export const data = new SlashCommandBuilder()
  .setName('register')
  .setDescription('Register your AerisMP account')
  .addStringOption(o => o.setName('username').setDescription('Your username').setRequired(true))
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const discordId = interaction.user.id;
  const username  = interaction.options.getString('username');
  const email     = `${interaction.user.username}@aeris.gg`;
  const password  = generatePassword();

  const existing = await Users.findOne({ discordId });
  if (existing) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Registration', iconURL: ICON })
        .setDescription('> You already have an AerisMP account.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
    });
  }

  try {
    const res = await Utils.CreateUser(discordId, username, email, password, false);
    if (res.status !== 200) {
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xe74c3c)
          .setAuthor({ name: 'AerisMP Registration Failed', iconURL: ICON })
          .setDescription(`> ${res.message}`)
          .setFooter({ text: 'AerisMP', iconURL: ICON })],
      });
    }

    const privateEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setAuthor({ name: 'AerisMP Account Created', iconURL: ICON })
      .setDescription('> Your account is ready. **Keep your credentials safe!**')
      .addFields(
        { name: 'Username', value: `\`\`\`${username}\`\`\``, inline: true },
        { name: 'Email',    value: `\`\`\`${email}\`\`\``,    inline: true },
        { name: 'Password', value: `\`\`\`${password}\`\`\``, inline: true },
      )
      .setFooter({ text: 'AerisMP  Do not share your password', iconURL: ICON })
      .setTimestamp();

    const publicEmbed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({ name: 'AerisMP New Player', iconURL: ICON })
      .setDescription(`> **${username}** just joined AerisMP!`)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
      .setFooter({ text: 'AerisMP', iconURL: ICON })
      .setTimestamp();

    await interaction.editReply({ embeds: [privateEmbed] });
    await interaction.channel?.send({ embeds: [publicEmbed] });
    await sendWebhookLog(username, email, interaction.user);
    log.backend(`Account created: ${username} (${discordId})`);
  } catch (err) {
    log.error(`Registration error for ${username}: ${err.message}`);
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xe74c3c)
        .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
        .setDescription('> Something went wrong during registration. Please try again.')
        .setFooter({ text: 'AerisMP', iconURL: ICON })],
    });
  }
}
