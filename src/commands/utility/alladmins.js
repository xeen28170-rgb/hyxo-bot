'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'alladmins',
    category: 'utility',
    description: 'Affiche la liste des membres (hors bots) ayant la permission administrateur',
    async run(client, message) {
        const admins = message.guild.members.cache.filter(m => !m.user.bot && m.permissions.has('Administrator'));
        const embed = EmbedHelper.info('🛡️ Administrateurs (Humains)', admins.map(a => `${a.user.tag} (\`${a.id}\`)`).join('\n') || 'Aucun admin humain.', { color: 0xFF0000 });
        await message.channel.send({ embeds: [embed] });
    },
};
