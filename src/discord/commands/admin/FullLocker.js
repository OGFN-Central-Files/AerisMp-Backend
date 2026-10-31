import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import mongoose from 'mongoose';
const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';
function isMod(id) {
    return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
        .filter(Boolean).includes(id);
}
async function getModels() {
    const User = mongoose.model('users');
    const Profile = mongoose.model('profiles');
    return { User, Profile };
}
export const data = new SlashCommandBuilder()
    .setName('fulllocker')
    .setDescription('Give a player the full locker.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .setDMPermission(false);
export async function execute(interaction) {
    if (!isMod(interaction.user.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const targetUser = interaction.options.getUser('user', true);
    try {
        const { User, Profile } = await getModels();
        const dbUser = await User.findOne({ discordId: targetUser.id }).lean();
        if (!dbUser) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Full Locker', iconURL: ICON })
                        .setDescription(`> No account found for **${targetUser.username}**.`)
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
            });
        }
        const res = await fetch(`http://127.0.0.1:${process.env.PORT}/api/v1/locker/full`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.API_KEY || '' },
            body: JSON.stringify({ accountId: dbUser.accountId }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Full Locker', iconURL: ICON })
                        .setDescription(`> Failed: ${err.error || res.statusText}`)
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
            });
        }
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(0x57f287)
                    .setAuthor({ name: 'AerisMP Full Locker', iconURL: ICON })
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setDescription(`> **${dbUser.username}** has been given the full locker.`)
                    .addFields({ name: 'Admin', value: `<@${interaction.user.id}>`, inline: true })
                    .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })
                    .setTimestamp()],
        });
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
