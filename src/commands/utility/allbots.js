'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'allbots',
    category: 'utility',
    description: 'Affiche la liste des bots présents sur le serveur',
    async run(client, message) {
        const bots = message.guild.members.cache.filter(m => m.user.bot);
        const embed = EmbedHelper.info('🤖 Liste des Bots', bots.map(b => `${b.user.tag} (\`${b.id}\`)`).join('\n') || 'Aucun bot.', { color: 0xFF0000 });
        await message.channel.send({ embeds: [embed] });
    },
};
