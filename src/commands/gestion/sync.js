'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'sync',
    category: 'gestion',
    description: 'Synchronise les permissions d\'un salon avec sa catégorie',
    usage: '<salon/catégorie/all>',
    permissions: ['ManageChannels'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();
        
        if (sub === 'all') {
            const channels = message.guild.channels.cache.filter(c => c.parentId);
            for (const ch of channels.values()) {
                await ch.lockPermissions().catch(() => {});
            }
            return message.channel.send({ embeds: [EmbedHelper.success('Tous les salons ont été synchronisés.')] });
        }

        const channel = Helpers.resolveChannel(message.guild, args[0]) || message.channel;
        if (!channel.parentId) return message.channel.send({ embeds: [EmbedHelper.error('Ce salon n\'a pas de catégorie parent.')] });

        await channel.lockPermissions();
        message.channel.send({ embeds: [EmbedHelper.success(`Le salon **${channel.name}** a été synchronisé.`)] });
    },
};

