'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'snipe',
    category: 'utility',
    description: 'Affiche un message supprimé du salon (1 = le plus récent, jusqu\'à 10)',
    usage: '-snipe [numéro]',
    async run(client, message, args) {
        const stored = client.cache.get(`snipe_${message.channel.id}`);
        const history = Array.isArray(stored) ? stored : stored ? [stored] : [];
        if (!history.length) return message.channel.send({ embeds: [EmbedHelper.error('Aucun message à snifer ici !')] });

        const index = args[0] ? parseInt(args[0], 10) : 1;
        if (!Number.isInteger(index) || index < 1) {
            return message.channel.send({ embeds: [EmbedHelper.error('Usage : `-snipe [numéro]` — ex. `-snipe 2` pour l\'avant-dernier message supprimé.')] });
        }
        const sniped = history[index - 1];
        if (!sniped) {
            return message.channel.send({ embeds: [EmbedHelper.error(`Il n'y a que **${history.length}** message(s) supprimé(s) en mémoire dans ce salon.`)] });
        }

        const embed = EmbedHelper.info(`🎯 Message snipé de ${sniped.author.tag}`, sniped.content || '*Image uniquement*', { color: 0xFF0000 });
        if (sniped.image) embed.setImage(sniped.image);
        embed.setTimestamp(sniped.timestamp);
        embed.setFooter({ text: `${index}/${history.length} · -snipe ${index < history.length ? index + 1 : 1} pour ${index < history.length ? 'le précédent' : 'revenir au plus récent'}` });

        await message.channel.send({ embeds: [embed] });
    },
};
