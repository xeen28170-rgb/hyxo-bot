'use strict';

const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'unmuteall',
    category: 'moderation',
    description: 'Retire le rôle mute de tous les membres du serveur',
    permissions: ['ManageRoles'],
    async run(client, message) {
        const settings = client.cache.getGuild(message.guild.id);
        const muteRoleId = settings?.moderation?.muteRole;

        if (!muteRoleId)
            return message.channel.send({ embeds: [EmbedHelper.error('Aucun rôle mute configuré. Utilisez `+setmuterole` d\'abord.')] });

        const muteRole = message.guild.roles.cache.get(muteRoleId);
        if (!muteRole)
            return message.channel.send({ embeds: [EmbedHelper.error('Le rôle mute configuré est introuvable sur ce serveur.')] });

        const muted = message.guild.members.cache.filter(m => m.roles.cache.has(muteRoleId));
        if (!muted.size)
            return message.channel.send({ embeds: [EmbedHelper.error('Aucun membre n\'a actuellement le rôle mute.')] });

        const loadingMsg = await message.channel.send({ embeds: [EmbedHelper.info('🔊 Démutage en cours...', `Retrait du rôle mute pour **${muted.size}** membres...`)] });

        let success = 0;
        let failed = 0;
        for (const [, member] of muted) {
            try {
                await member.roles.remove(muteRoleId, `Unmuteall par ${message.author.username}`);
                success++;
            } catch {
                failed++;
            }
        }

        await loadingMsg.edit({ embeds: [EmbedHelper.success(`✅ **${success}** membres démutés.${failed > 0 ? ` (${failed} échecs)` : ''}`)] });
    },
};
