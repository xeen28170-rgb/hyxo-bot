'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'mutelist',
    category: 'moderation',
    description: 'Affiche la liste de tous les mutes en cours sur le serveur',
    permissions: ['ManageMessages'],
    async run(client, message) {
        const settings = client.cache.getGuild(message.guild.id);
        const muteRoleId = settings?.moderation?.muteRole;
        if (!muteRoleId) return message.channel.send({ embeds: [EmbedHelper.error('Rôle muet non configuré.')] });

        const muted = message.guild.members.cache.filter(m => m.roles.cache.has(muteRoleId));
        const embed = EmbedHelper.info('🔇 Membres muets', muted.map(m => `${m.user.tag} (\`${m.id}\`)`).join('\n') || 'Aucun membre muet.', { color: 0xFF0000 });
        
        message.channel.send({ embeds: [embed] });
    },
};
