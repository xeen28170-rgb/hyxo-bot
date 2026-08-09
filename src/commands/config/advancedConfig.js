'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'advancedconfig',
    aliases: ['advanced-config'],
    category: 'config',
    description: 'Affiche les options de configuration avancee disponibles.',
    usage: '+advancedconfig',
    permissions: ['ManageGuild'],
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        const ad = settings?.autodelete;

        const lines = [
            '`+config` - Configuration générale',
            '`+secur` - Panneau antiraid interactif',
            '`+settings` - État de la configuration du serveur',
            '',
            '**Autodelete:**',
            ad?.moderation ? `  • Modération: \`${ad.moderation.target}\`${ad.moderation.duration ? ` (${ad.moderation.duration})` : ''}` : '  • Modération: ❌ désactivé',
            ad?.snipe ? `  • Snipe: \`${ad.snipe.target}\`${ad.snipe.duration ? ` (${ad.snipe.duration})` : ''}` : '  • Snipe: ❌ désactivé',
        ];

        return message.channel.send({
            embeds: [EmbedHelper.info('Configuration avancée', lines.join('\n'), { color: 0x5865F2 })],
        });
    },
};
