'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { mapLimit } = require('../../utils/concurrency');

module.exports = {
    name: 'unmuteall',
    category: 'moderation',
    description: 'Retire le rôle mute de tous les membres du serveur',
    permissions: ['ManageRoles'],
    async run(client, message) {
        const settings = client.cache.getGuild(message.guild.id);
        const muteRoleId = settings?.moderation?.muteRole;

        if (!muteRoleId) {
            const prefix = message.guildSettings?.prefix || client.prefix;
            return message.channel.send({ embeds: [EmbedHelper.error(`Aucun rôle mute configuré. Utilisez \`${prefix}setmuterole\` d'abord.`)] });
        }

        const muteRole = message.guild.roles.cache.get(muteRoleId);
        if (!muteRole)
            return message.channel.send({ embeds: [EmbedHelper.error('Le rôle mute configuré est introuvable sur ce serveur.')] });

        const muted = message.guild.members.cache.filter(m => m.roles.cache.has(muteRoleId));
        if (!muted.size)
            return message.channel.send({ embeds: [EmbedHelper.error('Aucun membre n\'a actuellement le rôle mute.')] });

        const loadingMsg = await message.channel.send({ embeds: [EmbedHelper.info('🔊 Démutage en cours...', `Retrait du rôle mute pour **${muted.size}** membres...`)] });

        const results = await mapLimit([...muted.values()], (member) =>
            member.roles.remove(muteRoleId, `Unmuteall par ${message.author.username}`), 5);
        const success = results.filter(r => r.ok).length;
        const failed = results.length - success;

        await loadingMsg.edit({ embeds: [EmbedHelper.success(`✅ **${success}** membres démutés.${failed > 0 ? ` (${failed} échecs)` : ''}`)] });
    },
};
