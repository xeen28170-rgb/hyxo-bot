'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'showpics',
    category: 'config',
    description: 'Envoie automatiquement les photos de profils de membres aleatoires dans un salon',
    usage: '<#salon> <intervalle_min>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0] || '');
        const interval = parseInt(args[1]) || 60;

        if (args[0]?.toLowerCase() === 'off') {
            await Guild.updateOne({ guildId: message.guild.id }, { 'config.showpics': null });
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Envoi automatique de photos désactivé.')] });
        }

        if (!channel || channel.type !== 0) {
            return message.channel.send({ embeds: [EmbedHelper.error('Veuillez mentionner un salon textuel valide.')] });
        }

        const safeInterval = Math.max(5, Math.min(interval, 1440));

        await Guild.updateOne({ guildId: message.guild.id }, {
            'config.showpics': {
                channelId: channel.id,
                interval: safeInterval,
            },
        });
        client.cache.invalidateGuild(message.guild.id);

        message.channel.send({ embeds: [EmbedHelper.success(`Envoi automatique de photos activé dans ${channel} (toutes les ${safeInterval} min).`)] });
    },
};
