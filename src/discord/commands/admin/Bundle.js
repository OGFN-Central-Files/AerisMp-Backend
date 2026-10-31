import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import mongoose from 'mongoose';
const ICON = 'https://s1.directupload.eu/images/260323/jdkj2sxv.png';
function isMod(id) {
    return [process.env.MODERATOR_1, process.env.MODERATOR_2, process.env.MODERATOR_3]
        .filter(Boolean).includes(id);
}
// Define cosmetic bundles
const BUNDLES = {
    booster: {
        label: 'Booster Pack',
        color: 0xf39c12,
        items: [
            'AthenaCharacter:CID_028_Athena_Commando_F', // Renegade Raider
            'AthenaCharacter:CID_017_Athena_Commando_M', // Aerial Assault Trooper
            'AthenaPickaxe:Pickaxe_Lockjaw', // Raider's Revenge
            'AthenaGlider:Glider_ID_001', // Aerial Assault One
            'AthenaDance:EID_DanceMoves', // Dance Moves
            'AthenaBackpack:BID_001_BlueSquire', // Blue Shield
        ],
    },
    og: {
        label: 'OG Pack',
        color: 0x8e44ad,
        items: [
            'AthenaCharacter:CID_001_Athena_Commando_F_Default',
            'AthenaCharacter:CID_002_Athena_Commando_F_Default',
            'AthenaCharacter:CID_003_Athena_Commando_F_Default',
            'AthenaCharacter:CID_004_Athena_Commando_F_Default',
            'AthenaCharacter:CID_005_Athena_Commando_M_Default',
            'AthenaPickaxe:DefaultPickaxe',
            'AthenaGlider:DefaultGlider',
            'AthenaDance:EID_DanceMoves',
        ],
    },
    dev: {
        label: 'Dev Locker',
        color: 0xe74c3c,
        items: [
            'AthenaCharacter:CID_028_Athena_Commando_F',
            'AthenaCharacter:CID_017_Athena_Commando_M',
            'AthenaCharacter:CID_300_Athena_Commando_F_Angel',
            'AthenaCharacter:CID_347_Athena_Commando_M_PirateProgressive',
            'AthenaCharacter:CID_193_Athena_Commando_F_Hippie',
            'AthenaCharacter:CID_416_Athena_Commando_M_AssassinSuit',
            'AthenaPickaxe:Pickaxe_Lockjaw',
            'AthenaPickaxe:Pickaxe_ID_082_SushiChef',
            'AthenaPickaxe:Pickaxe_ID_215_Pug',
            'AthenaGlider:Glider_ID_001',
            'AthenaGlider:Glider_Bold',
            'AthenaGlider:Glider_ID_064_Biker',
            'AthenaDance:EID_TimetravelBackflip',
            'AthenaDance:EID_AprilBevie_Sync',
            'AthenaBackpack:BID_293_GlowBroFemale',
            'AthenaBackpack:BID_209_RobotTroubleMale',
        ],
    },
};
export const data = new SlashCommandBuilder()
    .setName('bundle')
    .setDescription('Give a cosmetic bundle to a player.')
    .addUserOption(o => o.setName('user').setDescription('Target player').setRequired(true))
    .addStringOption(o => o
    .setName('pack')
    .setDescription('Which bundle to give')
    .setRequired(true)
    .addChoices({ name: 'Booster Pack', value: 'booster' }, { name: 'OG Pack', value: 'og' }, { name: 'Dev Locker', value: 'dev' }))
    .setDMPermission(false);
export async function execute(interaction) {
    if (!isMod(interaction.user.id)) {
        return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const targetUser = interaction.options.getUser('user', true);
    const packKey = interaction.options.getString('pack', true);
    const bundle = BUNDLES[packKey];
    try {
        const User = mongoose.model('users');
        const Profile = mongoose.model('profiles');
        const dbUser = await User.findOne({ discordId: targetUser.id }).lean();
        if (!dbUser) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Bundle', iconURL: ICON })
                        .setDescription(`> No account found for **${targetUser.username}**.`)
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
            });
        }
        const profile = await Profile.findOne({ accountId: dbUser.accountId });
        if (!profile) {
            return interaction.editReply({
                embeds: [new EmbedBuilder().setColor(0xe74c3c)
                        .setAuthor({ name: 'AerisMP Bundle', iconURL: ICON })
                        .setDescription(`> Profile not found for **${dbUser.username}**.`)
                        .setFooter({ text: 'AerisMP Admin Panel', iconURL: ICON })],
            });
        }
        const athena = profile.profiles.athena;
        let added = 0;
        for (const templateId of bundle.items) {
            if (!athena.items[templateId]) {
                athena.items[templateId] = {
                    templateId,
                    attributes: { item_seen: false, variants: [], favorite: false, level: 0, xp: 0, max_level_bonus: 0 },
                    quantity: 1,
                };
                added++;
            }
        }
        athena.rvn = (athena.rvn || 0) + 1;
        athena.commandRevision = (athena.commandRevision || 0) + 1;
        athena.updated = new Date().toISOString();
        await Profile.updateOne({ accountId: dbUser.accountId }, { $set: { 'profiles.athena': athena } });
        return interaction.editReply({
            embeds: [new EmbedBuilder().setColor(bundle.color)
                    .setAuthor({ name: `AerisMP ${bundle.label}`, iconURL: ICON })
                    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                    .setDescription(`> **${dbUser.username}** received the **${bundle.label}**.`)
                    .addFields({ name: 'Items Added', value: `\`${added}/${bundle.items.length}\``, inline: true }, { name: 'Admin', value: `<@${interaction.user.id}>`, inline: true })
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
