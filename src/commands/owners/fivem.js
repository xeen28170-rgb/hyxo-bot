'use strict';

const FiveMService = require('../../services/fivemService');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'fivem',
    category: 'owners',
    ownerOnly: true,
    aliases: ['fivem-stats'],
    description: 'Affiche les statistiques d\'un serveur FiveM',
    usage: '<ip:port>',
    async run(client, message, args) {
        const ip = args.join(' ').trim();
        if (!ip) return message.channel.send({ embeds: [EmbedHelper.error(`Usage: \`${this.usage}\``)] });

        const status = await message.channel.send({ embeds: [EmbedHelper.info('🔄 Connexion...', `Connexion au serveur FiveM \`${ip}\`...`, { color: 0x5865F2 })] });

        const info = await FiveMService.getServerInfo(ip);

        if (!info.online) {
            return status.edit({ embeds: [EmbedHelper.error(`Impossible de contacter le serveur \`${ip}\`. Vérifiez l'adresse.`)] });
        }

        const embed = EmbedHelper.info('🎮 FiveM — Informations du serveur', [
            `**Adresse:** \`${ip}\``,
            `**Nom:** ${info.hostname || 'Inconnu'}`,
            `**Joueurs:** ${info.players}/${info.maxPlayers}`,
            `**Version:** ${info.version || 'Inconnue'}`,
        ].join('\n'), { color: 0x5865F2, thumbnail: 'https://cdn.discordapp.com/emojis/825828280643977246.png' });

        await status.edit({ embeds: [embed] });
    },
};
