const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const GuildSettings = require('../../models/GuildSettings');
const ms = require('ms');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cooldown')
        .setDescription('Set cooldown for drops and giveaways')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of cooldown to set')
                .setRequired(true)
                .addChoices(
                    { name: 'Drops', value: 'drops' },
                    { name: 'Giveaways', value: 'giveaways' }
                ))
        .addIntegerOption(option =>
            option.setName('keylimit')
                .setDescription('Maximum number of keys a user can receive (0 to remove limit)')
                .setRequired(true)
                .setMinValue(0))
        .addStringOption(option =>
            option.setName('timelimit')
                .setDescription('Time period for key limit (e.g., 1d, 7d, 30d)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const type = interaction.options.getString('type');
            const keyLimit = interaction.options.getInteger('keylimit');
            const timeLimitStr = interaction.options.getString('timelimit');
            
            // Convert time string to milliseconds
            const timeLimit = ms(timeLimitStr);
            if (!timeLimit || timeLimit < 0) {
                return interaction.editReply('Please provide a valid time limit (e.g., 1d, 7d, 30d)');
            }

            // Get or create guild settings
            let settings = await GuildSettings.findOne({ guildId: interaction.guild.id });
            if (!settings) {
                settings = new GuildSettings({ guildId: interaction.guild.id });
            }

            // Update cooldown settings
            if (!settings.cooldowns) settings.cooldowns = { drops: {}, giveaways: {} };
            
            settings.cooldowns[type] = {
                keyLimit: keyLimit || null,
                timeLimit: timeLimit || null
            };

            // Save to database
            await settings.save();

            // Update cache
            client.settings.set(interaction.guild.id, settings);

            // Format response message
            const limitStr = keyLimit === 0 ? 'removed' : keyLimit;
            const timeStr = ms(timeLimit, { long: true });
            let response = '';

            if (keyLimit === 0) {
                response = `Cooldown for ${type} has been removed.`;
            } else {
                response = `Cooldown for ${type} set to ${limitStr} keys per ${timeStr}.`;
            }

            return interaction.editReply(response);
        } catch (error) {
            console.error('Error setting cooldown:', error);
            return interaction.editReply('An error occurred while setting the cooldown.');
        }
    },
};
