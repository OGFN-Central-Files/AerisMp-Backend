import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import mongoose from 'mongoose';
const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';
function isMod(id) {
    return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
        .filter(Boolean).includes(id);
}
export const data = new SlashCommandBuilder()
    .setName('manage')
    .setDescription('Ban or unban a player.')
    .addSubcommand(sub => sub
    .setName('ban')
    .setDescription('Ban a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Ban reason').setRequired(false)))
    .addSubcommand(sub => sub
    .setName('unban')
    .setDescription('Unban a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true)))
    .setDMPermission(false);
export async function execute(interaction) {
    if (!isMod(interaction.user.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const sub = interaction.options.getSubcommand();
    const targetUser = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided.';
    try {
        const User = mongoose.model('users');
        const dbUser = await User.findOne({ discordId: targetUser.id }).lean();
        if (!dbUser) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Manage', iconURL: ICON })
                        .setDescription(`> No account found for **${targetUser.username}**.`)
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
            });
        }
        if (sub === 'ban') {
            if (dbUser.banned) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xe74c3c)
                            .setAuthor({ name: 'AerisMP Ban', iconURL: ICON })
                            .setDescription(`> **${dbUser.username}** is already banned.`)
                            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
                });
            }
            await User.updateOne({ discordId: targetUser.id }, { $set: { banned: true } });
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Player Banned', iconURL: ICON })
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .addFields({ name: 'Player', value: `\`${dbUser.username}\``, inline: true }, { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Reason', value: `\`${reason}\``, inline: false })
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
                        .setTimestamp()],
            });
        }
        if (sub === 'unban') {
            if (!dbUser.banned) {
                return interaction.editReply({
                    embeds: [new EmbedBuilder().setColor(0xe74c3c)
                            .setAuthor({ name: 'AerisMP Unban', iconURL: ICON })
                            .setDescription(`> **${dbUser.username}** is not banned.`)
                            .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
                });
            }
            await User.updateOne({ discordId: targetUser.id }, { $set: { banned: false } });
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0x57f287)
                        .setAuthor({ name: 'AerisMP Player Unbanned', iconURL: ICON })
                        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                        .setDescription(`> **${dbUser.username}** has been unbanned.`)
                        .addFields({ name: 'Admin', value: `<@${interaction.user.id}>`, inline: true })
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
                        .setTimestamp()],
            });
        }
    }
    catch (err) {
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0xe74c3c)
                    .setAuthor({ name: 'AerisMP Error', iconURL: ICON })
                    .setDescription(`> ${err.message}`)
                    .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
        });
    }
}
