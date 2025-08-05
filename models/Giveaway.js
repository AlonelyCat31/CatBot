const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    guildId: { type: String, required: true },
    prize: { type: String, required: true },
    platform: { type: String }, // Add the platform field
    winnerCount: { type: Number, required: true },
    endAt: { type: Number, required: true },
    hostedBy: { type: String },
    requiredRole: { type: String },
    boostRequired: { type: Boolean, default: false },
    blacklistedRoles: [{ type: String }],
    bonusRoles: [{
        roleId: { type: String },
        multiplier: { type: Number, default: 1 }
    }],
    winners: [{ type: String }],
    ended: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    key: { type: String }
});

module.exports = mongoose.model('Giveaway', giveawaySchema);