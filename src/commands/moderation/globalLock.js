'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { mapLimit } = require('../../utils/concurrency');

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
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${prefix}global-lock <lockall|unlockall|hideall|unhideall>\``)] });
        }

        const channels = message.guild.channels.cache.filter(c => c.type === 0 || (action.includes('hide') && c.type === 2));
        const loadingMsg = await message.channel.send({ embeds: [EmbedHelper.info('🌍 Action Globale', `**${action}** en cours sur **${channels.size}** salons...`, { color: 0xFF0000 })] });

        const overwriteByAction = {
            lockall: { SendMessages: false },
            unlockall: { SendMessages: null },
            hideall: { ViewChannel: false },
            unhideall: { ViewChannel: null },
        };
        const overwrite = overwriteByAction[action];

        const results = await mapLimit([...channels.values()], (ch) =>
            ch.permissionOverwrites.edit(message.guild.roles.everyone, overwrite), 5);
        const success = results.filter(r => r.ok).length;
        const failed = results.length - success;

        const labels = {
            lockall: 'verrouillés',
            unlockall: 'déverrouillés',
            hideall: 'masqués',
            unhideall: 'réaffichés',
        };

        await loadingMsg.edit({ embeds: [EmbedHelper.success(`✅ **${success}** salons **${labels[action]}**.${failed > 0 ? ` (${failed} échecs)` : ''}`)] });
    },
};
