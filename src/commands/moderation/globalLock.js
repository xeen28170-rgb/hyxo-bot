'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'global-lock',
    category: 'moderation',
    description: 'Gérer la visibilité/accès de tous les salons du serveur',
    permissions: ['Administrator'],
    botPermissions: ['ManageChannels'],
    usage: '<lockall|unlockall|hideall|unhideall>',
    async run(client, message, args) {
        const action = (args[0] || '').toLowerCase();
        const valid = ['lockall', 'unlockall', 'hideall', 'unhideall'];
        if (!valid.includes(action)) {
            return message.channel.send({ embeds: [EmbedHelper.error('Usage: `+global-lock <lockall|unlockall|hideall|unhideall>`')] });
        }

        const channels = message.guild.channels.cache.filter(c => c.type === 0 || (action.includes('hide') && c.type === 2));
        const loadingMsg = await message.channel.send({ embeds: [EmbedHelper.info('🌍 Action Globale', `**${action}** en cours sur **${channels.size}** salons...`, { color: 0xFF0000 })] });

        let success = 0;
        let failed = 0;

        for (const ch of channels.values()) {
            try {
                if (action === 'lockall') {
                    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
                } else if (action === 'unlockall') {
                    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
                } else if (action === 'hideall') {
                    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: false });
                } else if (action === 'unhideall') {
                    await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null });
                }
                success++;
            } catch {
                failed++;
            }
        }

        const labels = {
            lockall: 'verrouillés',
            unlockall: 'déverrouillés',
            hideall: 'masqués',
            unhideall: 'réaffichés',
        };

        await loadingMsg.edit({ embeds: [EmbedHelper.success(`✅ **${success}** salons **${labels[action]}**.${failed > 0 ? ` (${failed} échecs)` : ''}`)] });
    },
};
