const mongoose = require('mongoose');

const guildSettingsSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    giveawayPermission: {
        type: { type: String, enum: ['everyone', 'role'], default: 'everyone' },
        roleId: { type: String, default: null }
    },
    dropPermission: {
        type: { type: String, enum: ['everyone', 'role'], default: 'everyone' },
        roleId: { type: String, default: null }
    },
    cooldowns: {
        drops: {
            keyLimit: { type: Number, default: null },
            timeLimit: { type: Number, default: null } // In milliseconds
        },
        giveaways: {
            keyLimit: { type: Number, default: null }, 
            timeLimit: { type: Number, default: null } // In milliseconds
        }
    },
    blacklists: {
        drops: {
            users: [{ type: String }], // Array of user IDs
            reason: { type: Map, of: String } // Map of user IDs to blacklist reasons
        },
        giveaways: {
            users: [{ type: String }], // Array of user IDs
            reason: { type: Map, of: String } // Map of user IDs to blacklist reasons
        }
    }
});

module.exports = mongoose.model('GuildSettings', guildSettingsSchema);