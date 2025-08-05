const { EmbedBuilder } = require('discord.js');

module.exports = {
    customId: 'claim_drop_',
    async execute(interaction, client) {
        const dropId = interaction.customId.replace('claim_drop_', '');
        
        // Initialize processing map if it doesn't exist
        client.dropProcessing = client.dropProcessing || new Map();
        
        // Check if this drop is currently being processed
        if (client.dropProcessing.get(dropId)) {
            return interaction.reply({ content: 'This drop is currently being processed. Please wait...', ephemeral: true });
        }
        
        try {
            // Set processing lock
            client.dropProcessing.set(dropId, true);
            
            const dropData = client.drops.get(dropId);

            if (!dropData || dropData.claimed) {
                client.dropProcessing.delete(dropId);
                return interaction.reply({ content: 'This drop has already been claimed!', ephemeral: true });
            }

            // Check if drop has expired
            if (Date.now() > dropData.endTime) {
                client.dropProcessing.delete(dropId);
                
                // Update the message to show expiration
                const message = await interaction.channel.messages.fetch(dropData.messageId);
                const embed = message.embeds[0];
                const newEmbed = EmbedBuilder.from(embed)
                    .setColor('#808080')
                    .setDescription(`${embed.description}\n\n**Status:** Expired`);

                await message.edit({
                    embeds: [newEmbed],
                    components: [] // Remove the claim button
                });

                return interaction.reply({ content: 'This drop has expired!', ephemeral: true });
            }

            // Check blacklist
            const settings = client.settings.get(interaction.guild.id);
            if (settings?.blacklists?.drops?.users?.includes(interaction.user.id)) {
                client.dropProcessing.delete(dropId);
                const reason = settings.blacklists.drops.reason.get(interaction.user.id);
                return interaction.reply({ 
                    content: `You are blacklisted from claiming drops${reason ? `: ${reason}` : '.'}`, 
                    ephemeral: true 
                });
            }

            // Check cooldown
            const GiveawayManager = require('../utils/giveawayManager');
            const canClaim = await GiveawayManager.checkCooldown(
                interaction.user.id,
                interaction.guild.id,
                'drops',
                settings
            );

            if (!canClaim) {
                client.dropProcessing.delete(dropId);
                return interaction.reply({ content: 'You have reached your drop claim limit for this time period.', ephemeral: true });
            }

            // Check requirements
            if (dropData.requiredRole && !interaction.member.roles.cache.has(dropData.requiredRole.id)) {
                client.dropProcessing.delete(dropId);
                return interaction.reply({ content: 'You do not have the required role to claim this drop!', ephemeral: true });
            }

            if (dropData.boostRequired && !interaction.member.premiumSince) {
                client.dropProcessing.delete(dropId);
                return interaction.reply({ content: 'This drop is for server boosters only!', ephemeral: true });
            }

            // Create entry record for the drop
            const GiveawayEntry = require('../models/GiveawayEntry');
            const entry = new GiveawayEntry({
                giveawayId: dropId,
                userId: interaction.user.id,
                guildId: interaction.guild.id,
                enteredAt: Date.now(),
                claimed: true
            });
            await entry.save();

            // Mark as claimed
            dropData.claimed = true;
            client.drops.set(dropId, dropData);

            // Send key in DM
            await interaction.user.send(`Congratulations! You claimed the drop!\n\nHere is your key: \`${dropData.key}\``);

            // Update the message
            const message = await interaction.channel.messages.fetch(dropData.messageId);
            const embed = message.embeds[0];
            const newEmbed = EmbedBuilder.from(embed)
                .setColor('#00FF00')
                .setDescription(`${embed.description}\n\n**Claimed by:** ${interaction.user.tag}`);

            await message.edit({
                embeds: [newEmbed],
                components: [] // Remove the claim button
            });

            await interaction.reply({ content: 'You have successfully claimed the drop! Check your DMs for the key.', ephemeral: true });
        } catch (error) {
            console.error('Error handling drop claim:', error);
            await interaction.reply({ content: 'There was an error claiming the drop.', ephemeral: true });
        } finally {
            // Always remove the processing lock, even if there was an error
            client.dropProcessing.delete(dropId);
        }
    }
};