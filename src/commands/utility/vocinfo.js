'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'vocinfo',
    category: 'utility',
    description: 'Affiche les informations relatives à l\'activité vocale du serveur',
    async run(client, message) {
        const total = message.guild.members.cache.filter(m => m.voice.channel).size;
        const streaming = message.guild.members.cache.filter(m => m.voice.streaming).size;
        const camera = message.guild.members.cache.filter(m => m.voice.selfVideo).size;

        const embed = EmbedHelper.info('🔊 Activité Vocale', [
            `**Membres en vocal:** ${total}`,
            `**En stream:** ${streaming}`,
            `**Caméras:** ${camera}`,
        ].join('\n'), { color: 0xFF0000 });

        await message.channel.send({ embeds: [embed] });
    },
};
