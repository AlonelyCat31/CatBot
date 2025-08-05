const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allowgiveaway')
        .setDescription('Set who can host giveaways')
        .addStringOption(option =>
            option.setName('permission')
                .setDescription('Who can host giveaways')
                .setRequired(true)
                .addChoices(
                    { name: 'Everyone', value: 'everyone' },
                    { name: 'Specific Role', value: 'role' }
                ))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role allowed to host giveaways (required if permission is set to role)')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const permission = interaction.options.getString('permission');
            const role = interaction.options.getRole('role');

            // Validate input
            if (permission === 'role' && !role) {
                return interaction.editReply('You must specify a role when setting role-based permissions.');
            }

            // Store the setting in guild settings
            await interaction.client.settings.set(interaction.guild.id, {
                giveawayPermission: {
                    type: permission,
                    roleId: permission === 'role' ? role.id : null
                }
            });

            const response = permission === 'everyone'
                ? 'Everyone can now host giveaways!'
                : `Only members with the ${role.name} role can now host giveaways.`;

            return interaction.editReply(response);
        } catch (error) {
            logger.error('Error setting giveaway permissions:', error);
            return interaction.editReply('An error occurred while setting giveaway permissions.');
        }
    }
};