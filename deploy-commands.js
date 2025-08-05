require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const commands = [];

// Load commands recursively from all directories
function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
            // Recursively load commands from subdirectories
            loadCommands(filePath);
        } else if (file.endsWith('.js')) {
            const command = require(filePath);
            
            if ('data' in command) {
                commands.push(command.data.toJSON());
                logger.info(`Added command: ${command.data.name}`);
            } else {
                logger.warn(`The command at ${filePath} is missing required properties.`);
            }
        }
    }
}

// Start loading commands from the commands directory
loadCommands(path.join(__dirname, 'commands'));

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        logger.info(`Started refreshing ${commands.length} application (/) commands.`);
        
        // Register commands globally instead of guild-specific
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        
        logger.info(`Successfully reloaded ${data.length} application (/) commands globally.`);
    } catch (error) {
        logger.error(error);
    }
})();