'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'botadmins',
    category: 'utility',
    description: 'Affiche la liste des bots ayant la permission administrateur',
    async run(client, message) {
        const botAdmins = message.guild.members.cache.filter(m => m.user.bot && m.permissions.has('Administrator'));
        const embed = EmbedHelper.info('🤖 Bots Administrateurs', botAdmins.map(b => `${b.user.tag} (\`${b.id}\`)`).join('\n') || 'Aucun bot admin.', { color: 0xFF0000 });
        await message.channel.send({ embeds: [embed] });
    },
};
