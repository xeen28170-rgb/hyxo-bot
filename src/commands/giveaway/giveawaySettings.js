'use strict';

const Guild = require('../../models/Guild');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'giveaway-settings',
    category: 'giveaway',
    description: 'Configurer les paramètres des giveaways',
    usage: 'winmessage <message>',
    permissions: ['ManageGuild'],
    async run(client, message, args) {
        const sub = args[0]?.toLowerCase();

        if (sub === 'winmessage' || sub === 'message') {
            const content = args.slice(1).join(' ');
            if (!content) return message.channel.send({ embeds: [EmbedHelper.error('Veuillez spécifier un message.\nVariables: `{winners}`, `{prize}`')] });

            await Guild.updateOne({ guildId: message.guild.id }, { 'giveaway.winMessage': content });
            // Sans ça, le message reste celui du cache et le changement n'est pas pris en compte.
            client.cache.invalidateGuild(message.guild.id);
            return message.channel.send({ embeds: [EmbedHelper.success('Le message de victoire du giveaway a été mis à jour.')] });
        }

        const embed = EmbedHelper.info('🎉 Paramètres Giveaway', [
            'Configurez le comportement des giveaways sur votre serveur.',
            '',
            '**Usage:**',
            `\`+${this.name} winmessage <texte>\` - Définir le message de victoire`,
            '',
            '**Variables:** `{winners}`, `{prize}`'
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
