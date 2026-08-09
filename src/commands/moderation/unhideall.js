'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'unhideall',
    category: 'moderation',
    description: 'Affiche tous les salons du serveur',
    permissions: ['Administrator'],
    botPermissions: ['ManageChannels'],
    async run(client, message) {
        const channels = message.guild.channels.cache.filter(c => c.type === 0 || c.type === 2);
        await message.channel.send({ embeds: [EmbedHelper.info('👁️ Affichage...', `Réaffichage de **${channels.size}** salons en cours.`)] });

        for (const ch of channels.values()) {
            await ch.permissionOverwrites.edit(message.guild.roles.everyone, { ViewChannel: null }).catch(() => {});
        }

        message.channel.send({ embeds: [EmbedHelper.success('✅ Tous les salons ont été réaffichés.')] });
    },
};
