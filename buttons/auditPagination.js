module.exports = {
    customId: /^audit_(prev|next)_\d+_\d+$/,
    async execute(interaction, client) {
        const [, action, messageId, currentPage] = interaction.customId.split('_');
        const newPage = action === 'next' ? parseInt(currentPage) + 1 : parseInt(currentPage) - 1;
        const auditCommand = client.commands.get('audit');
        await auditCommand.showAuditPage(interaction, messageId, newPage, client);
    }
};