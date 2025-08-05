const { SlashCommandBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GiveawayEntry = require('../../models/GiveawayEntry');
const Giveaway = require('../../models/Giveaway');
const logger = require('../../utils/logger');
const moment = require('moment');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('audit')
        .setDescription('View audit log for giveaway entries')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The message ID of the giveaway')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const messageId = interaction.options.getString('message_id');
            const page = 1;
            await this.showAuditPage(interaction, messageId, page, client);
        } catch (error) {
            logger.error('Error viewing audit log:', error);
            return interaction.editReply('An error occurred while viewing the audit log.');
        }
    },

    async showAuditPage(interaction, messageId, page, client) {
        const giveawayData = await Giveaway.findOne({ messageId });
        if (!giveawayData) return interaction.editReply('Giveaway not found.');

        const entries = await GiveawayEntry.find({ giveawayId: messageId }).sort({ enteredAt: 1 });
        if (entries.length === 0) return interaction.editReply('No entries found.');

        const entriesPerPage = 15;
        const totalPages = Math.ceil(entries.length / entriesPerPage);
        const startIndex = (page - 1) * entriesPerPage;
        const endIndex = Math.min(startIndex + entriesPerPage, entries.length);

        let response = `**Giveaway Audit Log**\n**Prize:** ${giveawayData.prize}\n**Total Entries:** ${entries.length}\n\n`;

        for (let i = startIndex; i < endIndex; i++) {
            const entry = entries[i];
            const user = await client.users.fetch(entry.userId).catch(() => null);
            const username = user ? user.tag : 'Unknown User';
            const timestamp = moment(entry.enteredAt).format('YYYY-MM-DD HH:mm:ss');
            response += `${i + 1}. **${username}** (ID: ${entry.userId}) - ${timestamp}\n`;
        }

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`audit_prev_${messageId}_${page}`)
                    .setLabel('Previous')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page <= 1),
                new ButtonBuilder()
                    .setCustomId(`audit_next_${messageId}_${page}`)
                    .setLabel('Next')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page >= totalPages)
            );

        response += `\n*Page ${page}/${totalPages}*`;
        return interaction.editReply({ content: response, components: [row] });
    }
};