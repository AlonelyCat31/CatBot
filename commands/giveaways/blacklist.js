const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const GuildSettings = require('../../models/GuildSettings');
const logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage blacklisted users for drops and giveaways')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the blacklist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to blacklist')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to blacklist the user from')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Drops', value: 'drops' },
                            { name: 'Giveaways', value: 'giveaways' },
                            { name: 'Both', value: 'both' }
                        ))
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for blacklisting')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the blacklist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from blacklist')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('What to remove the blacklist from')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Drops', value: 'drops' },
                            { name: 'Giveaways', value: 'giveaways' },
                            { name: 'Both', value: 'both' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check if a user is blacklisted')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to check')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all blacklisted users')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Which blacklist to show')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Drops', value: 'drops' },
                            { name: 'Giveaways', value: 'giveaways' }
                        )))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const subcommand = interaction.options.getSubcommand();
            let settings = await GuildSettings.findOne({ guildId: interaction.guild.id });
            
            if (!settings) {
                settings = new GuildSettings({ guildId: interaction.guild.id });
            }

            // Initialize blacklists if they don't exist
            if (!settings.blacklists) {
                settings.blacklists = {
                    drops: { users: [], reason: new Map() },
                    giveaways: { users: [], reason: new Map() }
                };
            }

            const user = interaction.options.getUser('user');
            const type = interaction.options.getString('type');

            if (subcommand === 'add') {
                const reason = interaction.options.getString('reason');
                const types = type === 'both' ? ['drops', 'giveaways'] : [type];

                for (const t of types) {
                    if (!settings.blacklists[t].users.includes(user.id)) {
                        settings.blacklists[t].users.push(user.id);
                        settings.blacklists[t].reason.set(user.id, reason);
                    }
                }

                await settings.save();
                client.settings.set(interaction.guild.id, settings);

                return interaction.editReply(
                    `${user.tag} has been blacklisted from ${type === 'both' ? 'drops and giveaways' : type} for: ${reason}`
                );
            }

            else if (subcommand === 'remove') {
                const types = type === 'both' ? ['drops', 'giveaways'] : [type];

                for (const t of types) {
                    settings.blacklists[t].users = settings.blacklists[t].users.filter(id => id !== user.id);
                    settings.blacklists[t].reason.delete(user.id);
                }

                await settings.save();
                client.settings.set(interaction.guild.id, settings);

                return interaction.editReply(
                    `${user.tag} has been removed from the ${type === 'both' ? 'drops and giveaways' : type} blacklist`
                );
            }

            else if (subcommand === 'check') {
                let response = `**Blacklist Status for ${user.tag}:**\n`;
                
                const dropBlacklisted = settings.blacklists.drops.users.includes(user.id);
                const giveawayBlacklisted = settings.blacklists.giveaways.users.includes(user.id);

                if (!dropBlacklisted && !giveawayBlacklisted) {
                    return interaction.editReply(`${user.tag} is not blacklisted from anything.`);
                }

                if (dropBlacklisted) {
                    response += `\n**Drops:** Blacklisted`;
                    const reason = settings.blacklists.drops.reason.get(user.id);
                    if (reason) response += `\nReason: ${reason}`;
                }

                if (giveawayBlacklisted) {
                    response += `\n\n**Giveaways:** Blacklisted`;
                    const reason = settings.blacklists.giveaways.reason.get(user.id);
                    if (reason) response += `\nReason: ${reason}`;
                }

                return interaction.editReply(response);
            }

            else if (subcommand === 'list') {
                const blacklistedUsers = settings.blacklists[type].users;

                if (blacklistedUsers.length === 0) {
                    return interaction.editReply(`No users are blacklisted from ${type}.`);
                }

                let response = `**Users blacklisted from ${type}:**\n\n`;
                
                for (const userId of blacklistedUsers) {
                    const user = await client.users.fetch(userId).catch(() => null);
                    if (user) {
                        const reason = settings.blacklists[type].reason.get(userId);
                        response += `• ${user.tag}${reason ? ` - ${reason}` : ''}\n`;
                    }
                }

                return interaction.editReply(response);
            }
        } catch (error) {
            logger.error('Error managing blacklist:', error);
            return interaction.editReply('An error occurred while managing the blacklist.');
        }
    }
};
