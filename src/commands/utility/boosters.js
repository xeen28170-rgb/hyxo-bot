'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'boosters',
    category: 'utility',
    description: 'Affiche la liste des membres boostant le serveur',
    async run(client, message) {
        const boosters = message.guild.members.cache.filter(m => m.premiumSince);
        const embed = EmbedHelper.info('💎 Boosters du Serveur', boosters.map(b => `${b.user.tag} (Depuis: <t:${Math.floor(b.premiumSinceTimestamp / 1000)}:R>)`).join('\n') || 'Aucun booster.', { color: 0xFF0000 });
        await message.channel.send({ embeds: [embed] });
    },
};
