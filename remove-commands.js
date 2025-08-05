require('dotenv').config();
const { REST, Routes } = require('discord.js');
const logger = require('./utils/logger');

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        logger.info('Started removing all application (/) commands.');
        
        // Remove global commands
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: [] },
        );
        
        // Remove guild-specific commands
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: [] },
        );
        
        logger.info('Successfully removed all application (/) commands globally and from the guild.');
    } catch (error) {
        logger.error(error);
    }
})();