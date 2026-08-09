'use strict';

const EmbedHelper = require('../../utils/embedBuilder');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'perms',
    category: 'config',
    description: 'Affiche la liste des rôles ayant des permissions sur le bot',
    permissions: ['ManageGuild'],
    async run(client, message) {
        const settings = message.guildSettings || await getGuildSettings(client, message.guild.id, { create: false });
        if (!settings) return message.channel.send({ embeds: [EmbedHelper.error('Configuration introuvable.')] });

        const permissions = settings.permissions || {};
        const entries = Object.entries(permissions)
            .filter(([, ids]) => Array.isArray(ids) && ids.length)
            .map(([permission, ids]) => `**${permission}**: ${ids.map(id => `<@&${id}> / <@${id}>`).join(', ')}`);

        const embed = EmbedHelper.info('🔐 Permissions du Bot', [
            '**Rôles modérateurs:**',
            (settings.modRoles || []).map(id => `<@&${id}>`).join(', ') || 'Aucun',
            '',
            '**Rôles administrateurs:**',
            (settings.adminRoles || []).map(id => `<@&${id}>`).join(', ') || 'Aucun',
            '',
            '**Autorisations personnalisées:**',
            entries.join('\n').slice(0, 2500) || 'Aucune',
        ].join('\n'), { color: 0xFF0000 });

        message.channel.send({ embeds: [embed] });
    },
};
