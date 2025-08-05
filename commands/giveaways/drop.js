const { SlashCommandBuilder, PermissionFlagsBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('drop')
        .setDescription('Create an instant drop with a key')
        .addStringOption(option =>
            option.setName('prize')
                .setDescription('The prize for the drop')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The key to be delivered to the winner')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('platform')
                .setDescription('The platform for the prize (e.g., Steam, Epic, PSN)')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('required_role')
                .setDescription('Role required to claim the drop')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('boost_required')
                .setDescription('Whether server boosters only can claim')
                .setRequired(false))
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to start the drop in')
                .setRequired(false))
        .addIntegerOption(option =>
            option.setName('duration')
                .setDescription('Duration in hours (default: 24)')
                .setMinValue(1)
                .setRequired(false)),


    // At the start of the execute function, before deferReply:
    async execute(interaction, client) {
        // Skip permission check for users with MANAGE_GUILD permission
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
            const settings = await client.settings.get(interaction.guild.id);
            
            if (settings?.dropPermission?.type === 'role' && 
                settings?.dropPermission?.roleId && 
                !interaction.member.roles.cache.has(settings.dropPermission.roleId)) {
                return interaction.reply({ 
                    content: 'You do not have permission to create drops.', 
                    ephemeral: true 
                });
            }
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const prize = interaction.options.getString('prize');
            const key = interaction.options.getString('key');
            const platform = interaction.options.getString('platform');
            const channel = interaction.options.getChannel('channel') || interaction.channel;
            const requiredRole = interaction.options.getRole('required_role');
            const boostRequired = interaction.options.getBoolean('boost_required') || false;
            const duration = interaction.options.getInteger('duration') || 24;
            const endTime = Date.now() + (duration * 60 * 60 * 1000); // Convert hours to milliseconds

            const embed = new EmbedBuilder()
                .setTitle('🎉 Instant Drop!')
                .setDescription(`**Prize:** ${prize}\n**Platform:** ${platform}\n**Expires:** <t:${Math.floor(endTime / 1000)}:R>`)
                .setColor('#FF0000')
                .setTimestamp()
                .setFooter({ text: `Hosted by ${interaction.user.tag}` });

            if (requiredRole) {
                embed.addFields({ name: 'Required Role', value: requiredRole.toString() });
            }

            if (boostRequired) {
                embed.addFields({ name: 'Requirement', value: 'Server Booster Only' });
            }

            const claimButton = new ButtonBuilder()
                .setCustomId('claim_drop_' + interaction.id)
                .setLabel('Claim Drop!')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(claimButton);

            const message = await channel.send({
                embeds: [embed],
                components: [row]
            });

            // Store drop data in client for claim handling
            client.drops = client.drops || new Map();
            client.drops.set(interaction.id, {
                key,
                claimed: false,
                requiredRole,
                boostRequired,
                hostId: interaction.user.id,
                messageId: message.id,
                channelId: channel.id,
                endTime: endTime // Add end time to drop data
            });

            await interaction.editReply({ content: 'Drop created successfully!', ephemeral: true });
        } catch (error) {
            logger.error('Error creating drop:', error);
            await interaction.editReply({ content: 'There was an error creating the drop.', ephemeral: true });
        }
    }
};