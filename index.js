require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./utils/logger');
const { keepAlive } = require('./keep_alive.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// Collections
client.commands = new Collection();
client.buttons = new Collection();
client.giveaways = new Collection();
client.settings = new Map();

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
            
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
                logger.info(`Loaded command: ${command.data.name}`);
            } else {
                logger.warn(`The command at ${filePath} is missing required properties.`);
            }
        }
    }
}

// Start loading commands from the commands directory
loadCommands(path.join(__dirname, 'commands'));

// Load events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args, client));
    } else {
        client.on(event.name, (...args) => event.execute(...args, client));
    }
    
    logger.info(`Loaded event: ${event.name}`);
}

// Load buttons
const buttonsPath = path.join(__dirname, 'buttons');
if (fs.existsSync(buttonsPath)) {
    const buttonFiles = fs.readdirSync(buttonsPath).filter(file => file.endsWith('.js'));
    
    for (const file of buttonFiles) {
        const filePath = path.join(buttonsPath, file);
        const button = require(filePath);
        
        if ('customId' in button && 'execute' in button) {
            client.buttons.set(button.customId, button);
            logger.info(`Loaded button: ${button.customId}`);
        } else {
            logger.warn(`The button at ${filePath} is missing required properties.`);
        }
    }
}

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        logger.info('Connected to MongoDB');
        
        // Load active giveaways from database
        const GiveawayManager = require('./utils/giveawayManager');
        GiveawayManager.loadActiveGiveaways(client);
        
        // After MongoDB connection success
        const GuildSettings = require('./models/GuildSettings');
        
        // Load guild settings
        const loadGuildSettings = async () => {
            const settings = await GuildSettings.find();
            for (const setting of settings) {
                client.settings.set(setting.guildId, {
                    giveawayPermission: setting.giveawayPermission.type,
                    giveawayRole: setting.giveawayPermission.roleId,
                    dropPermission: setting.dropPermission.type,
                    dropRole: setting.dropPermission.roleId
                });
            }
            logger.info('Guild settings loaded');
        };
        
        loadGuildSettings();
    })
    .catch(err => {
        logger.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    });

// Login to Discord
client.login(process.env.TOKEN);

// Handle errors
process.on('unhandledRejection', error => {
    logger.error('Unhandled promise rejection:', error);
});
