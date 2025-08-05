const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const logger = require('../../utils/logger');
const GuildSettings = require('../../models/GuildSettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('allowdrops')
        .setDescription('Set who can create drops')
        .addStringOption(option =>
            option.setName('permission')
                .setDescription('Who can create drops')
                .setRequired(true)
                .addChoices(
                    { name: 'Everyone', value: 'everyone' },
                    { name: 'Specific Role', value: 'role' }
                ))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('The role allowed to create drops (required if permission is set to role)')
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

            // Update or create guild settings in MongoDB
            let settings = await GuildSettings.findOne({ guildId: interaction.guild.id });
            if (!settings) {
                settings = new GuildSettings({ guildId: interaction.guild.id });
            }

            // Update the settings
            settings.dropPermission = {
                type: permission,
                roleId: permission === 'role' ? role.id : null
            };

            // Save to MongoDB
            await settings.save();

            // Update the in-memory cache
            interaction.client.settings.set(interaction.guild.id, settings);

            const response = permission === 'everyone'
                ? 'Everyone can now create drops!'
                : `Only members with the ${role.name} role can now create drops.`;

            return interaction.editReply(response);
        } catch (error) {
            logger.error('Error setting drop permissions:', error);
            return interaction.editReply('An error occurred while setting drop permissions.');
        }
    },
};