const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Giveaway = require('../../models/Giveaway');
const GiveawayEntry = require('../../models/GiveawayEntry');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveawaystats')
        .setDescription('View statistics about giveaways'),

    async execute(interaction, client) {
        await interaction.deferReply();

        try {
            // Get total giveaways
            const totalGiveaways = await Giveaway.countDocuments({ guildId: interaction.guildId });
            const activeGiveaways = await Giveaway.countDocuments({ guildId: interaction.guildId, ended: false });

            // Get most active participants
            const participantStats = await GiveawayEntry.aggregate([
                { $match: { guildId: interaction.guildId } },
                { $group: { _id: '$userId', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);

            // Get most common winners
            const winnerStats = await Giveaway.aggregate([
                { $match: { guildId: interaction.guildId, ended: true } },
                { $unwind: '$winners' },
                { $group: { _id: '$winners', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 }
            ]);

            const embed = new EmbedBuilder()
                .setTitle('Giveaway Statistics')
                .setColor('#FF69B4')
                .addFields(
                    { name: 'Total Giveaways', value: totalGiveaways.toString(), inline: true },
                    { name: 'Active Giveaways', value: activeGiveaways.toString(), inline: true },
                    { name: '\u200B', value: '\u200B', inline: true }
                );

            // Add top participants
            let participantsField = '';
            for (const stat of participantStats) {
                const user = await client.users.fetch(stat._id).catch(() => null);
                if (user) {
                    participantsField += `${user.tag}: ${stat.count} entries\n`;
                }
            }
            if (participantsField) {
                embed.addFields({ name: 'Top Participants', value: participantsField });
            }

            // Add top winners
            let winnersField = '';
            for (const stat of winnerStats) {
                const user = await client.users.fetch(stat._id).catch(() => null);
                if (user) {
                    winnersField += `${user.tag}: ${stat.count} wins\n`;
                }
            }
            if (winnersField) {
                embed.addFields({ name: 'Most Lucky Winners', value: winnersField });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error getting giveaway stats:', error);
            return interaction.editReply('An error occurred while fetching giveaway statistics.');
        }
    }
};