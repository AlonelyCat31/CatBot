const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const ms = require('ms');
const GiveawayManager = require('../../utils/giveawayManager');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Create or manage giveaways')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new giveaway')
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('The prize for the giveaway')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('The duration of the giveaway (e.g., 1h, 1d, 1w)')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('The number of winners')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(10))
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to start the giveaway in')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('required_role')
                        .setDescription('Role required to enter the giveaway')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('boost_required')
                        .setDescription('Whether server boosters only can enter')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('key')
                        .setDescription('The key to be delivered to the winner (optional)')
                        .setRequired(false))
                .addStringOption(option =>
                    option.setName('platform')
                        .setDescription('The platform for the giveaway prize (e.g., Steam, Epic, PSN)')
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('bonus_role')
                        .setDescription('Role to receive bonus entries')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('bonus_multiplier')
                        .setDescription('Entry multiplier for bonus role (1-10)')
                        .setMinValue(1)
                        .setMaxValue(10)
                        .setRequired(false))
                .addRoleOption(option =>
                    option.setName('blacklist_role')
                        .setDescription('Role to blacklist from entering')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('End a giveaway early')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the giveaway')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Reroll a giveaway')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the giveaway')
                        .setRequired(true))
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('The number of winners to reroll')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all active giveaways')),
    
    // At the start of the execute function, add this permission check:
    async execute(interaction, client) {
        // Skip permission check for users with MANAGE_GUILD permission
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const settings = await client.settings.get(interaction.guild.id);
            
            if (settings?.giveawayPermission?.type === 'role' && 
                settings?.giveawayPermission?.roleId && 
                !interaction.member.roles.cache.has(settings.giveawayPermission.roleId)) {
                return interaction.reply({ 
                    content: 'You do not have permission to manage giveaways.', 
                    ephemeral: true 
                });
            }
        }
    
        const subcommand = interaction.options.getSubcommand();
        
        // In the execute function, update the create subcommand:
        // In the create subcommand handler
        if (subcommand === 'create') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const prize = interaction.options.getString('prize');
                const key = interaction.options.getString('key');
                const platform = interaction.options.getString('platform');
                const durationStr = interaction.options.getString('duration');
                const winnerCount = interaction.options.getInteger('winners');
                const channel = interaction.options.getChannel('channel') || interaction.channel;
                const requiredRole = interaction.options.getRole('required_role');
                const boostRequired = interaction.options.getBoolean('boost_required') || false;
                
                // Fix bonus role handling
                const bonusRole = interaction.options.getRole('bonus_role');
                const bonusMultiplier = interaction.options.getInteger('bonus_multiplier');
                let bonusRoles = [];
                if (bonusRole && bonusMultiplier) {
                    bonusRoles.push({
                        role: bonusRole,
                        multiplier: bonusMultiplier
                    });
                }
                
                // Fix blacklist role handling
                const blacklistRole = interaction.options.getRole('blacklist_role');
                let blacklistedRoles = [];
                if (blacklistRole) {
                    blacklistedRoles.push(blacklistRole);
                }
                
                // Validate duration
                const duration = ms(durationStr);
                if (!duration || duration < 0) { // Minimum 1 minute
                    return interaction.editReply('Please provide a valid duration');
                }
                
                const giveaway = await GiveawayManager.createGiveaway({
                    channel,
                    prize,
                    key,
                    winnerCount,
                    duration: durationStr,
                    hostedBy: interaction.user,
                    requiredRole,
                    boostRequired,
                    blacklistedRoles,
                    bonusRoles
                }, client);
                
                return interaction.editReply(`Giveaway created in ${channel}!`);
            } catch (error) {
                logger.error('Error creating giveaway:', error);
                return interaction.editReply('An error occurred while creating the giveaway.');
            }
        }
        
        else if (subcommand === 'end') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const messageId = interaction.options.getString('message_id');
                
                await GiveawayManager.endGiveaway(messageId, client);
                
                return interaction.editReply('Giveaway ended successfully!');
            } catch (error) {
                logger.error('Error ending giveaway:', error);
                return interaction.editReply('An error occurred while ending the giveaway. Make sure the message ID is correct.');
            }
        }
        
        else if (subcommand === 'reroll') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const messageId = interaction.options.getString('message_id');
                const winnerCount = interaction.options.getInteger('winners');
                
                const winners = await GiveawayManager.rerollGiveaway(messageId, winnerCount, client);
                
                if (winners.length === 0) {
                    return interaction.editReply('No valid entries found for reroll.');
                }
                
                return interaction.editReply(`Giveaway rerolled successfully! ${winners.length} new winner(s) selected.`);
            } catch (error) {
                logger.error('Error rerolling giveaway:', error);
                return interaction.editReply(`An error occurred: ${error.message}`);
            }
        }
        
        else if (subcommand === 'list') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const Giveaway = require('../../models/Giveaway');
                const activeGiveaways = await Giveaway.find({ 
                    guildId: interaction.guild.id,
                    ended: false
                });
                
                if (activeGiveaways.length === 0) {
                    return interaction.editReply('There are no active giveaways in this server.');
                }
                
                let response = '**Active Giveaways:**\n\n';
                
                for (const giveaway of activeGiveaways) {
                    const channel = interaction.guild.channels.cache.get(giveaway.channelId);
                    const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
                    
                    response += `**Prize:** ${giveaway.prize}\n`;
                    response += `**Channel:** ${channelName}\n`;
                    response += `**Ends:** <t:${Math.floor(giveaway.endAt / 1000)}:R>\n`;
                    response += `**Message ID:** ${giveaway.messageId}\n\n`;
                }
                
                return interaction.editReply(response);
            } catch (error) {
                logger.error('Error listing giveaways:', error);
                return interaction.editReply('An error occurred while listing giveaways.');
            }
        }

        else if (subcommand === 'bonus_add') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');
            const multiplier = interaction.options.getInteger('multiplier');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (giveawayData.ended) {
                    return interaction.editReply('This giveaway has already ended.');
                }
                
                // Check if role already has bonus
                const existingBonus = giveawayData.bonusRoles.find(br => br.roleId === role.id);
                
                if (existingBonus) {
                    existingBonus.multiplier = multiplier;
                } else {
                    giveawayData.bonusRoles.push({
                        roleId: role.id,
                        multiplier
                    });
                }
                
                await giveawayData.save();
                
                return interaction.editReply(`Bonus entries added for role ${role.name} with a multiplier of ${multiplier}x.`);
            } catch (error) {
                logger.error('Error adding bonus role:', error);
                return interaction.editReply('An error occurred while adding the bonus role.');
            }
        }
        
        else if (subcommand === 'bonus_remove') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (giveawayData.ended) {
                    return interaction.editReply('This giveaway has already ended.');
                }
                
                // Remove role from bonus roles
                giveawayData.bonusRoles = giveawayData.bonusRoles.filter(br => br.roleId !== role.id);
                
                await giveawayData.save();
                
                return interaction.editReply(`Bonus entries removed for role ${role.name}.`);
            } catch (error) {
                logger.error('Error removing bonus role:', error);
                return interaction.editReply('An error occurred while removing the bonus role.');
            }
        }
        
        else if (subcommand === 'bonus_list') {
            const messageId = interaction.options.getString('message_id');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (!giveawayData.bonusRoles || giveawayData.bonusRoles.length === 0) {
                    return interaction.editReply('No bonus roles set for this giveaway.');
                }
                
                const bonusRolesList = await Promise.all(giveawayData.bonusRoles.map(async br => {
                    const role = await interaction.guild.roles.fetch(br.roleId);
                    return `${role.name}: ${br.multiplier}x entries`;
                }));
                
                return interaction.editReply(`Bonus roles for this giveaway:\n${bonusRolesList.join('\n')}`);
            } catch (error) {
                logger.error('Error listing bonus roles:', error);
                return interaction.editReply('An error occurred while listing bonus roles.');
            }
        }
        
        else if (subcommand === 'blacklist_add') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (giveawayData.ended) {
                    return interaction.editReply('This giveaway has already ended.');
                }
                
                // Check if role is already blacklisted
                if (giveawayData.blacklistedRoles && giveawayData.blacklistedRoles.includes(role.id)) {
                    return interaction.editReply(`Role ${role.name} is already blacklisted.`);
                }
                
                // Add role to blacklist
                if (!giveawayData.blacklistedRoles) {
                    giveawayData.blacklistedRoles = [];
                }
                
                giveawayData.blacklistedRoles.push(role.id);
                await giveawayData.save();
                
                // Remove entries from users with this role
                const entries = await GiveawayEntry.find({ giveawayId: messageId });
                let removedEntries = 0;
                
                for (const entry of entries) {
                    const member = await interaction.guild.members.fetch(entry.userId).catch(() => null);
                    if (member && member.roles.cache.has(role.id)) {
                        await GiveawayEntry.deleteOne({ giveawayId: messageId, userId: entry.userId });
                        removedEntries++;
                    }
                }
                
                return interaction.editReply(`Role ${role.name} has been blacklisted. Removed ${removedEntries} existing entries.`);
            } catch (error) {
                logger.error('Error adding blacklisted role:', error);
                return interaction.editReply('An error occurred while adding the blacklisted role.');
            }
        }
        
        else if (subcommand === 'blacklist_remove') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (giveawayData.ended) {
                    return interaction.editReply('This giveaway has already ended.');
                }
                
                // Remove role from blacklist
                if (!giveawayData.blacklistedRoles) {
                    return interaction.editReply(`Role ${role.name} is not blacklisted.`);
                }
                
                giveawayData.blacklistedRoles = giveawayData.blacklistedRoles.filter(r => r !== role.id);
                await giveawayData.save();
                
                return interaction.editReply(`Role ${role.name} has been removed from the blacklist.`);
            } catch (error) {
                logger.error('Error removing blacklisted role:', error);
                return interaction.editReply('An error occurred while removing the blacklisted role.');
            }
        }
        
        else if (subcommand === 'blacklist_list') {
            const messageId = interaction.options.getString('message_id');
            
            try {
                const giveawayData = await Giveaway.findOne({ messageId });
                
                if (!giveawayData) {
                    return interaction.editReply('Giveaway not found. Please check the message ID.');
                }
                
                if (!giveawayData.blacklistedRoles || giveawayData.blacklistedRoles.length === 0) {
                    return interaction.editReply('No roles are blacklisted for this giveaway.');
                }
                
                const blacklistedRolesList = await Promise.all(giveawayData.blacklistedRoles.map(async roleId => {
                    const role = await interaction.guild.roles.fetch(roleId);
                    return role.name;
                }));
                
                return interaction.editReply(`Blacklisted roles for this giveaway:\n${blacklistedRolesList.join('\n')}`);
            } catch (error) {
                logger.error('Error listing blacklisted roles:', error);
                return interaction.editReply('An error occurred while listing blacklisted roles.');
            }
        }
    },
};
