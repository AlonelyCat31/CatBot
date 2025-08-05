const mongoose = require('mongoose');

const giveawayEntrySchema = new mongoose.Schema({
    giveawayId: { type: String, required: true },
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    enteredAt: { type: Number, required: true },
    isWinner: { type: Boolean, default: false },
    claimed: { type: Boolean, default: false } // For drops
});

// Compound index to ensure a user can only enter a giveaway once
giveawayEntrySchema.index({ giveawayId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('GiveawayEntry', giveawayEntrySchema);