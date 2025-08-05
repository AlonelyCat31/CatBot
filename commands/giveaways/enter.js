const { SlashCommandBuilder } = require('discord.js');
const GiveawayManager = require('../../utils/giveawayManager');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enter')
        .setDescription('Enter a giveaway by message ID')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway')
                .setRequired(true)),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const messageId = interaction.options.getString('message_id');
            
            const result = await GiveawayManager.addEntry(messageId, interaction.user, client);
            
            return interaction.editReply(result.message);
        } catch (error) {
            return interaction.editReply('An error occurred while entering the giveaway.');
        }
    },
};