const logger = require('../utils/logger');
const GuildSettings = require('../models/GuildSettings');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        logger.info(`Logged in as ${client.user.tag}`);
        client.user.setActivity('giveaways! 🎉', { type: 'WATCHING' });

        // Load all guild settings
        try {
            const settings = await GuildSettings.find();
            for (const setting of settings) {
                client.settings.set(setting.guildId, setting);
            }
            logger.info(`Loaded settings for ${settings.length} guilds`);
        } catch (error) {
            logger.error('Error loading guild settings:', error);
        }
    },
};