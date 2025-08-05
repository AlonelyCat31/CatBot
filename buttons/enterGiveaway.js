const GiveawayManager = require('../utils/giveawayManager');
const logger = require('../utils/logger');

module.exports = {
    customId: 'enter_giveaway_',
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Extract the message ID from the custom ID
            const messageId = interaction.customId.replace('enter_giveaway_', '');
            
            // Skip if the messageId is 'new' (placeholder)
            if (messageId === 'new') {
                logger.error('Button clicked with placeholder messageId: new');
                return interaction.editReply('This giveaway button is not properly configured. Please contact a server administrator.');
            }
            
            // Get the actual message ID from the message the button is attached to
            const actualMessageId = interaction.message.id;
            
            // Use the message ID from the button if it's not 'new', otherwise use the actual message ID
            const giveawayMessageId = messageId !== 'new' ? messageId : actualMessageId;
            
            logger.debug(`Button clicked - CustomID: ${interaction.customId}, Extracted MessageID: ${messageId}, Actual MessageID: ${actualMessageId}, Using: ${giveawayMessageId}`);
            
            // Add entry to giveaway
            const result = await GiveawayManager.addEntry(giveawayMessageId, interaction.user, client);
            
            // Reply with the result
            return interaction.editReply(result.message);
        } catch (error) {
            logger.error('Error handling giveaway entry button:', error);
            return interaction.editReply('An error occurred while entering the giveaway.');
        }
    },
};