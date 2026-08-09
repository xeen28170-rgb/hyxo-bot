'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const Helpers = require('../../utils/helpers');

module.exports = {
    name: 'vstats',
    category: 'utility',
    description: 'Affiche les statistiques vocales d\'un membre (temps passé en vocal).',
    usage: '[membre]',
    async run(client, message, args) {
        const user = await Helpers.resolveUser(client, args[0], message.guild) || message.author;
        const member = message.guild.members.cache.get(user.id);

        const tracker = client.voiceStats?.get(`${message.guild.id}:${user.id}`);

        if (!tracker) {
            return message.channel.send({ embeds: [EmbedHelper.info(`🔊 Stats Vocales: ${user.username}`, [
                'Aucune donnée vocale disponible pour ce membre.',
                '',
                '_Les stats se calculent en temps réel à partir du moment où le bot tourne._',
                '_Le membre doit rejoindre un salon vocal pour commencer à accumuler du temps._',
            ].join('\n'), { color: 0xFF0000 })] });
        }

        let totalMs = tracker.totalMs || 0;
        if (tracker.joinedAt) {
            totalMs += Date.now() - tracker.joinedAt;
        }

        const hours   = Math.floor(totalMs / 3_600_000);
        const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
        const seconds = Math.floor((totalMs % 60_000) / 1000);
        const formatted = `${hours}h ${minutes}m ${seconds}s`;

        const currentChannel = member?.voice?.channel;

        const embed = EmbedHelper.info(`🔊 Stats Vocales: ${user.username}`, [
            `**Temps total en vocal:** \`${formatted}\``,
            `**Salon actuel:** ${currentChannel ? `<#${currentChannel.id}>` : 'Hors vocal'}`,
            `**Dernière activité:** ${tracker.lastSeen ? `<t:${Math.floor(tracker.lastSeen / 1000)}:R>` : 'Inconnue'}`,
        ].join('\n'), { color: 0xFF0000 });

        embed.setThumbnail(user.displayAvatarURL({ dynamic: true }));
        message.channel.send({ embeds: [embed] });
    },
};
