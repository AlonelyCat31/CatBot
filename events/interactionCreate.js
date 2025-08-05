const logger = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            
            if (!command) return;
            
            try {
                await command.execute(interaction, client);
            } catch (error) {
                logger.error(`Error executing command ${interaction.commandName}:`, error);
                
                const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
        
        // Handle buttons
        else if (interaction.isButton()) {
            const button = client.buttons.get(interaction.customId) || 
                          client.buttons.find(btn => typeof btn.customId === 'string' && interaction.customId.startsWith(btn.customId));
            
            if (!button) return;
            
            try {
                await button.execute(interaction, client);
            } catch (error) {
                logger.error(`Error executing button ${interaction.customId}:`, error);
                
                const errorMessage = { content: 'There was an error with this button!', ephemeral: true };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(errorMessage);
                } else {
                    await interaction.reply(errorMessage);
                }
            }
        }
    },
};