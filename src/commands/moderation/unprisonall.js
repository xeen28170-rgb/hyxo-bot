'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');
const PrisonService = require('../../services/prisonService');
const PermissionsHelper = require('../../utils/permissions');

module.exports = {
    name: 'unprisonall',
    category: 'moderation',
    description: 'Libère TOUS les prisonniers du serveur (réservé aux Owner).',
    usage: '-unprisonall [raison]',
    botPermissions: ['ModerateMembers', 'ManageRoles'],
    cooldown: 10,
    async run(client, message) {
        const settings = message.guildSettings || (await getGuildSettings(client, message.guild.id, { create: false }));

        // Owner uniquement (bot owner accepté). Les WL ne peuvent pas utiliser -unprisonall.
        const isOwner = PermissionsHelper.isBotOwner(client, message.author.id)
            || await PermissionsHelper.isServerOwner(message.member, settings);
        if (!isOwner) {
            return message.channel.send({ embeds: [EmbedHelper.error('❌ Cette commande est **réservée aux Owner**.')] });
        }

        const reason = message.content.split(/\s+/).slice(1).join(' ') || 'Libération par un Owner';

        const result = await PrisonService.releaseAll(client, message.guild, reason);
        const lines = [
            `✅ **${result.released}** prisonnier(s) libéré(s).`,
            result.failed > 0 ? `⚠️ **${result.failed}** échec(s) (membres introuvables, etc.).` : '',
        ].filter(Boolean);

        return message.channel.send({ embeds: [EmbedHelper.success(lines.join('\n'))] });
    },
};