'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'snipe',
    category: 'utility',
    description: 'Affiche le dernier message supprimé du salon',
    async run(client, message) {
        const sniped = client.cache.get(`snipe_${message.channel.id}`);
        if (!sniped) return message.channel.send({ embeds: [EmbedHelper.error('Aucun message à snifer ici !')] });

        const embed = EmbedHelper.info(`🎯 Message snipé de ${sniped.author.tag}`, sniped.content || '*Image uniquement*', { color: 0xFF0000 });
        if (sniped.image) embed.setImage(sniped.image);
        embed.setTimestamp(sniped.timestamp);

        await message.channel.send({ embeds: [embed] });
    },
};
