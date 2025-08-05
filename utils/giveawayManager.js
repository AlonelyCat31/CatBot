const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Giveaway = require('../models/Giveaway');
const GiveawayEntry = require('../models/GiveawayEntry');
const logger = require('./logger');
const ms = require('ms');
const moment = require('moment');

class GiveawayManager {
    /**
     * Load active giveaways from database
     * @param {Client} client Discord client
     */
    static async loadActiveGiveaways(client) {
        try {
            const now = Date.now();
            const activeGiveaways = await Giveaway.find({ ended: false });
            
            logger.info(`Loading ${activeGiveaways.length} active giveaways`);
            
            for (const giveawayData of activeGiveaways) {
                // Skip if giveaway has already ended
                if (giveawayData.endAt <= now) {
                    await this.endGiveaway(giveawayData.messageId, client);
                    continue;
                }
                
                // Schedule giveaway to end
                const timeLeft = giveawayData.endAt - now;
                client.giveaways.set(giveawayData.messageId, giveawayData);
                
                setTimeout(() => {
                    this.endGiveaway(giveawayData.messageId, client);
                }, timeLeft);
                
                logger.info(`Scheduled giveaway ${giveawayData.messageId} to end in ${ms(timeLeft, { long: true })}`);
            }
        } catch (error) {
            logger.error('Error loading active giveaways:', error);
        }
    }
    
    /**
     * Create a new giveaway
     * @param {Object} options Giveaway options
     * @param {Client} client Discord client
     */
    static async createGiveaway(options, client) {
        try {
            const { channel, prize, platform, key, winnerCount, duration, hostedBy, requiredRole, boostRequired, blacklistedRoles, bonusRoles } = options;
            
            const endAt = Date.now() + ms(duration);
            
            // Generate initial embed and components (with placeholder 'new' in button customId)
            const { embed, components } = this.generateGiveawayEmbed({
                prize,
                platform,
                winnerCount,
                endAt,
                hostedBy,
                requiredRole,
                boostRequired,
                entries: 0,
                bonusRoles,
                blacklistedRoles: blacklistedRoles ? blacklistedRoles.map(r => r.id) : [] // Add this line
            });
            
            const message = await channel.send({ embeds: [embed], components });
            
            // Now that we have the message ID, update the button with the correct customId
            const updatedComponents = this.generateGiveawayEmbed({
                messageId: message.id,
                prize,
                platform,
                winnerCount,
                endAt,
                hostedBy,
                requiredRole,
                boostRequired,
                entries: 0,
                bonusRoles,
                blacklistedRoles: blacklistedRoles ? blacklistedRoles.map(r => r.id) : [] // Add this line
            }).components;
            
            // Update the message with the correct button customId
            await message.edit({ embeds: [embed], components: updatedComponents });
            
            const giveaway = new Giveaway({
                messageId: message.id,
                channelId: channel.id,
                guildId: channel.guild.id,
                prize,
                platform,
                key,  // Add this
                winnerCount,
                endAt,
                hostedBy: hostedBy ? hostedBy.id : null,
                requiredRole: requiredRole ? requiredRole.id : null,
                boostRequired,
                blacklistedRoles: blacklistedRoles ? blacklistedRoles.map(r => r.id) : [],
                bonusRoles: bonusRoles ? bonusRoles.map(r => ({ roleId: r.role.id, multiplier: r.multiplier })) : [],
                ended: false
            });
            
            await giveaway.save();
            client.giveaways.set(message.id, giveaway);
            
            // Schedule giveaway to end
            setTimeout(() => {
                this.endGiveaway(message.id, client);
            }, ms(duration));
            
            return message;
        } catch (error) {
            logger.error('Error creating giveaway:', error);
            throw error;
        }
    }
    
    /**
     * End a giveaway and select winners
     * @param {string} messageId Giveaway message ID
     * @param {Client} client Discord client
     */
    static async endGiveaway(messageId, client) {
        try {
            // Get giveaway data
            let giveawayData = client.giveaways.get(messageId) || await Giveaway.findOne({ messageId });
            
            if (!giveawayData || giveawayData.ended) return;
            
            // Mark giveaway as ended
            giveawayData.ended = true;
            await giveawayData.save();
            client.giveaways.delete(messageId);
            
            // Get channel and message
            const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
            if (!channel) {
                logger.error(`Channel ${giveawayData.channelId} not found for giveaway ${messageId}`);
                return;
            }
            
            const message = await channel.messages.fetch(messageId).catch(() => null);
            if (!message) {
                logger.error(`Message ${messageId} not found in channel ${giveawayData.channelId}`);
                return;
            }
            
            // Get entries
            const entries = await GiveawayEntry.find({ 
                giveawayId: messageId,
                guildId: giveawayData.guildId 
            });
            
            if (entries.length === 0) {
                const endEmbed = new EmbedBuilder()
                    .setTitle('🎉 Giveaway Ended')
                    .setDescription(`**Prize:** ${giveawayData.prize}\n\nNo valid entries for this giveaway!`)
                    .setColor('#FF0000')
                    .setTimestamp();
                
                // Disable the button
                const disabledRow = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`enter_giveaway_${messageId}`)
                            .setLabel('Giveaway Ended')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('🎉')
                            .setDisabled(true)
                    );
                
                await message.edit({ embeds: [endEmbed], components: [disabledRow] });
                return;
            }
            
            // Create weighted entries array based on bonus roles
            let weightedEntries = [];
            for (const entry of entries) {
                const member = await channel.guild.members.fetch(entry.userId).catch(() => null);
                if (!member) continue;
                
                // Default weight is 1
                let weight = 1;
                
                // Check for bonus roles
                if (giveawayData.bonusRoles && giveawayData.bonusRoles.length > 0) {
                    for (const bonusRole of giveawayData.bonusRoles) {
                        if (member.roles.cache.has(bonusRole.roleId)) {
                            weight *= bonusRole.multiplier;
                        }
                    }
                }
                
                // Add weighted entries
                for (let i = 0; i < weight; i++) {
                    weightedEntries.push(entry.userId);
                }
            }
            
            // Select winners
            const winnerCount = Math.min(giveawayData.winnerCount, weightedEntries.length);
            const winners = [];
            
            for (let i = 0; i < winnerCount; i++) {
                if (weightedEntries.length === 0) break;
                
                const winnerIndex = Math.floor(Math.random() * weightedEntries.length);
                const winnerId = weightedEntries[winnerIndex];
                
                // Remove all instances of this winner from the array to avoid duplicates
                weightedEntries = weightedEntries.filter(id => id !== winnerId);
                
                winners.push(winnerId);
            }
            
            // Update giveaway with winners and mark entries
            giveawayData.winners = winners;
            await giveawayData.save();

            // Mark winning entries
            await GiveawayEntry.updateMany(
                { 
                    giveawayId: messageId,
                    guildId: giveawayData.guildId,
                    userId: { $in: winners }
                },
                { $set: { isWinner: true } }
            );
            
            // Format winners mention
            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
            
            // Update embed
            const endEmbed = new EmbedBuilder()
                .setTitle('🎉 Giveaway Ended')
                .setDescription(`**Prize:** ${giveawayData.prize}\n**Winners:** ${winnerMentions}\n\nHosted by: ${giveawayData.hostedBy ? `<@${giveawayData.hostedBy}>` : 'Unknown'}`)
                .setColor('#00FF00')
                .setTimestamp();
            
            // Disable the button
            const disabledRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`enter_giveaway_${messageId}`)
                        .setLabel('Giveaway Ended')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🎉')
                        .setDisabled(true)
                );
            
            await message.edit({ embeds: [endEmbed], components: [disabledRow] });
            
            // In the endGiveaway method
            for (const winnerId of winners) {
                const winner = await channel.guild.members.fetch(winnerId).catch(() => null);
                if (winner) {
                    try {
                        const dmEmbed = new EmbedBuilder()
                            .setTitle('🎉 You Won!')
                            .setDescription(`Congratulations! You won the giveaway in ${channel.guild.name}!\n\n**Prize:** ${giveawayData.prize}`)
                            .setColor('#00FF00')
                            .setTimestamp();
                    
                        // Add key information if it exists
                        if (giveawayData.key) {
                            dmEmbed.addFields({
                                name: '🔑 Your Key',
                                value: `||${giveawayData.key}||`  // Hide the key in a spoiler
                            });
                        }
                    
                        await winner.send({ embeds: [dmEmbed] });
                    } catch (error) {
                        logger.error(`Failed to send DM to winner ${winnerId}:`, error);
                    }
                }
            }
            
            // Send winner announcement
            if (winners.length > 0) {
                await channel.send({
                    content: `Congratulations ${winnerMentions}! You won **${giveawayData.prize}**!`,
                    allowedMentions: { users: winners }
                });
                
                // DM winners
                for (const winnerId of winners) {
                    try {
                        const user = await client.users.fetch(winnerId);
                        await user.send(`Congratulations! You won **${giveawayData.prize}** in in ${channel.guild.name}!`);
                    } catch (error) {
                        logger.warn(`Could not DM winner ${winnerId}: ${error.message}`);
                    }
                }
            }
            
            return winners;
        } catch (error) {
            logger.error('Error ending giveaway:', error);
        }
    }
    
    /**
     * Reroll a giveaway to select new winners
     * @param {string} messageId Giveaway message ID
     * @param {number} winnerCount Number of winners to select (optional)
     * @param {Client} client Discord client
     */
    static async rerollGiveaway(messageId, winnerCount = null, client) {
        try {
            // Get giveaway data
            const giveawayData = await Giveaway.findOne({ messageId });
            
            if (!giveawayData || !giveawayData.ended) {
                throw new Error('Giveaway not found or not ended yet');
            }
            
            // Get channel and message
            const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
            if (!channel) {
                throw new Error(`Channel ${giveawayData.channelId} not found`);
            }
            
            // Get entries
            const entries = await GiveawayEntry.find({ 
                giveawayId: messageId,
                guildId: giveawayData.guildId 
            });
            
            if (entries.length === 0) {
                throw new Error('No valid entries for this giveaway');
            }
            
            // Create weighted entries array based on bonus roles
            let weightedEntries = [];
            for (const entry of entries) {
                const member = await channel.guild.members.fetch(entry.userId).catch(() => null);
                if (!member) continue;
                
                // Default weight is 1
                let weight = 1;
                
                // Check for bonus roles
                if (giveawayData.bonusRoles && giveawayData.bonusRoles.length > 0) {
                    for (const bonusRole of giveawayData.bonusRoles) {
                        if (member.roles.cache.has(bonusRole.roleId)) {
                            weight *= bonusRole.multiplier;
                        }
                    }
                }
                
                // Add weighted entries
                for (let i = 0; i < weight; i++) {
                    weightedEntries.push(entry.userId);
                }
            }
            
            // Select winners
            const newWinnerCount = winnerCount || giveawayData.winnerCount;
            const actualWinnerCount = Math.min(newWinnerCount, weightedEntries.length);
            const winners = [];
            
            for (let i = 0; i < actualWinnerCount; i++) {
                if (weightedEntries.length === 0) break;
                
                const winnerIndex = Math.floor(Math.random() * weightedEntries.length);
                const winnerId = weightedEntries[winnerIndex];
                
                // Remove all instances of this winner from the array to avoid duplicates
                weightedEntries = weightedEntries.filter(id => id !== winnerId);
                
                winners.push(winnerId);
            }
            
            // Format winners mention
            const winnerMentions = winners.map(id => `<@${id}>`).join(', ');
            
            // Send winner announcement
            if (winners.length > 0) {
                await channel.send({
                    content: `Congratulations ${winnerMentions}! You won **${giveawayData.prize}**!`,
                    allowedMentions: { users: winners }
                });
                
                // DM winners
                for (const winnerId of winners) {
                    try {
                        const user = await client.users.fetch(winnerId);
                        await user.send(`Congratulations! You won **${giveawayData.prize}** in ${channel.guild.name}!`);
                    } catch (error) {
                        logger.warn(`Could not DM winner ${winnerId}: ${error.message}`);
                    }
                }
            }
            
            return winners;
        } catch (error) {
            logger.error('Error rerolling giveaway:', error);
            throw error;
        }
    }
    
    /**
     * Check if a user has reached their cooldown limit
     * @param {string} userId User's ID
     * @param {string} guildId Guild's ID
     * @param {string} type Type of cooldown ('drops' or 'giveaways')
     * @param {Object} settings Guild settings
     * @returns {boolean} Whether the user can enter
     */
    static async checkCooldown(userId, guildId, type, settings) {
        if (!settings?.cooldowns?.[type]?.keyLimit || !settings?.cooldowns?.[type]?.timeLimit) {
            return true; // No cooldown set
        }

        const GiveawayEntry = require('../models/GiveawayEntry');
        const timeLimit = settings.cooldowns[type].timeLimit;
        const keyLimit = settings.cooldowns[type].keyLimit;
        const cutoffTime = Date.now() - timeLimit;

        // Count successful entries within the time period
        const entryCount = await GiveawayEntry.countDocuments({
            userId,
            guildId,
            enteredAt: { $gte: cutoffTime },
            // Only count entries for ended giveaways where the user was a winner
            $or: [
                { isWinner: true },
                { claimed: true } // For drops
            ]
        });

        return entryCount < keyLimit;
    }

    /**
     * Add an entry to a giveaway
     * @param {string} messageId Giveaway message ID
     * @param {User} user User who entered
     * @param {Client} client Discord client
     */
    static async addEntry(messageId, user, client) {
        try {
            // Log the entry attempt
            logger.debug(`Giveaway entry attempt - MessageID: ${messageId}, User: ${user.tag}`);
            
            // Get giveaway data
            let giveawayData = client.giveaways.get(messageId);
            
            // If not in cache, try to get from database
            if (!giveawayData) {
                giveawayData = await Giveaway.findOne({ messageId });
                
                // If found in database but not in cache, add to cache
                if (giveawayData && !giveawayData.ended && giveawayData.endAt > Date.now()) {
                    client.giveaways.set(messageId, giveawayData);
                }
            }
            
            // Debug logging
            logger.debug(`Giveaway data - Found: ${!!giveawayData}, Ended: ${giveawayData?.ended}, EndAt: ${giveawayData?.endAt}, Now: ${Date.now()}, Time left: ${giveawayData ? (giveawayData.endAt - Date.now()) : 'N/A'}ms`);
            
            if (!giveawayData) {
                return { success: false, message: 'Giveaway not found. Please try again or contact a server administrator.' };
            }
            
            if (giveawayData.ended) {
                return { success: false, message: 'This giveaway has ended' };
            }
            
            if (giveawayData.endAt <= Date.now()) {
                // If the giveaway should have ended but hasn't been marked as ended yet
                giveawayData.ended = true;
                await giveawayData.save();
                client.giveaways.delete(messageId);
                
                // Schedule the end function to run
                setTimeout(() => {
                    this.endGiveaway(messageId, client);
                }, 0);
                
                return { success: false, message: 'This giveaway has just ended' };
            }
            
            // Check if user is blacklisted
            const settings = client.settings.get(giveawayData.guildId);
            if (settings?.blacklists?.giveaways?.users?.includes(user.id)) {
                const reason = settings.blacklists.giveaways.reason.get(user.id);
                return { 
                    success: false, 
                    message: `You are blacklisted from entering giveaways${reason ? `: ${reason}` : '.'}`
                };
            }

            // Check if user already entered
            const existingEntry = await GiveawayEntry.findOne({ giveawayId: messageId, userId: user.id });
            if (existingEntry) {
                return { success: false, message: 'You have already entered this giveaway' };
            }
            
            // Get guild and member
            const guild = client.guilds.cache.get(giveawayData.guildId);
            if (!guild) {
                return { success: false, message: 'Guild not found' };
            }
            
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) {
                return { success: false, message: 'You are not a member of this server' };
            }
            
            // Check required role
            if (giveawayData.requiredRole && !member.roles.cache.has(giveawayData.requiredRole)) {
                return { success: false, message: 'You do not have the required role to enter this giveaway' };
            }
            
            // Check boost requirement
            if (giveawayData.boostRequired && !member.premiumSince) {
                return { success: false, message: 'You need to be a server booster to enter this giveaway' };
            }
            
            // Check blacklisted roles
            if (giveawayData.blacklistedRoles && giveawayData.blacklistedRoles.length > 0) {
                for (const roleId of giveawayData.blacklistedRoles) {
                    if (member.roles.cache.has(roleId)) {
                        return { success: false, message: 'You have a role that is blacklisted from entering this giveaway' };
                    }
                }
            }
            
            // Check cooldown
            const canEnter = await this.checkCooldown(user.id, giveawayData.guildId, 'giveaways', settings);
            
            if (!canEnter) {
                return { success: false, message: 'You have reached your giveaway entry limit for this time period.' };
            }

            // Create entry
            const entry = new GiveawayEntry({
                giveawayId: messageId,
                userId: user.id,
                guildId: giveawayData.guildId,
                enteredAt: Date.now()
            });
            
            await entry.save();
            
            // Update giveaway embed with new entry count
            const entryCount = await GiveawayEntry.countDocuments({ 
                giveawayId: messageId,
                guildId: giveawayData.guildId 
            });
            
            // Get channel and message
            const channel = await client.channels.fetch(giveawayData.channelId).catch(() => null);
            if (channel) {
                const message = await channel.messages.fetch(messageId).catch(() => null);
                if (message) {
                    const { embed, components } = this.generateGiveawayEmbed({
                        messageId,
                        prize: giveawayData.prize,
                        platform: giveawayData.platform,
                        winnerCount: giveawayData.winnerCount,
                        endAt: giveawayData.endAt,
                        hostedBy: giveawayData.hostedBy ? await client.users.fetch(giveawayData.hostedBy).catch(() => null) : null,
                        requiredRole: giveawayData.requiredRole ? guild.roles.cache.get(giveawayData.requiredRole) : null,
                        boostRequired: giveawayData.boostRequired,
                        entries: entryCount,
                        bonusRoles: giveawayData.bonusRoles,
                        blacklistedRoles: giveawayData.blacklistedRoles // Add this line
                    });
                    
                    await message.edit({ embeds: [embed], components });
                }
            }
            
            // Send DM confirmation
            try {
                await user.send(`You have successfully entered the giveaway for **${giveawayData.prize}**!`);
            } catch (error) {
                logger.warn(`Could not DM user ${user.id}: ${error.message}`);
            }
            
            return { success: true, message: 'You have successfully entered the giveaway' };
        } catch (error) {
            logger.error('Error adding entry to giveaway:', error);
            return { success: false, message: 'An error occurred while entering the giveaway' };
        }
    }
    
    /**
     * Generate a giveaway embed
     * @param {Object} options Embed options
     * @returns {Object} The embed and components
     */
    static generateGiveawayEmbed(options) {
        const { prize, platform, winnerCount, endAt, hostedBy, requiredRole, boostRequired, entries, bonusRoles, blacklistedRoles } = options;
        
        const embed = new EmbedBuilder()
            .setTitle('🎉 GIVEAWAY 🎉')
            .setDescription(`**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endAt / 1000)}:R>\n\n**Entries:** ${entries || 0}`)
            .setColor('#FF00FF')
            .setTimestamp();
        
        if (hostedBy) {
            embed.setFooter({ text: `Hosted by: ${hostedBy.tag}`, iconURL: hostedBy.displayAvatarURL() });
        }
        
        let requirements = [];
        
        if (requiredRole) {
            requirements.push(`Required Role: <@&${requiredRole.id}>`);
        }
        
        if (boostRequired) {
            requirements.push('Must be a Server Booster');
        }
        
        if (requirements.length > 0) {
            embed.addFields({ name: 'Requirements', value: requirements.join('\n') });
        }

        // Add bonus roles field if any exist
        if (bonusRoles && bonusRoles.length > 0) {
            const bonusRolesText = bonusRoles.map(br => `<@&${br.roleId}> (${br.multiplier}x entries)`).join('\n');
            embed.addFields({ name: 'Extra Entries', value: bonusRolesText });
        }

        // Add blacklisted roles field if any exist
        if (blacklistedRoles && blacklistedRoles.length > 0) {
            const blacklistedRolesText = blacklistedRoles.map(roleId => `<@&${roleId}>`).join('\n');
            embed.addFields({ name: 'Blacklisted Roles', value: blacklistedRolesText });
        }
        
        // Create button component
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`enter_giveaway_${options.messageId || 'new'}`)
                    .setLabel('Enter Giveaway')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🎉')
            );
        
        return { embed, components: [row] };
    }
}

module.exports = GiveawayManager;
