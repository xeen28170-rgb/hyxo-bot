'use strict';

const { AuditLogEvent } = require('discord.js');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'roleUpdate',
    async run(client, oldRole, newRole) {
        const guild = newRole.guild || oldRole.guild;
        if (!guild) return;
        const settings = await getGuildSettings(client, guild.id, { create: false });
        await AntiraidService.handleRecentAuditAction(client, guild, AuditLogEvent.RoleUpdate, newRole.id || oldRole.id, settings);

        if (settings.statsChannels?.roleCountIds?.[newRole.id || oldRole.id]) {
            scheduleStatsUpdate(client, guild, 'stats_role_update', 5_000);
        }
        if (await LogDispatcher.isSelfAuditAction(client, guild, AuditLogEvent.RoleUpdate, newRole.id || oldRole.id)) return;

        if (oldRole.name !== newRole.name || oldRole.permissions.bitfield !== newRole.permissions.bitfield || oldRole.color !== newRole.color) {
            const embed = EmbedHelper.info('🎭 Rôle modifié', [
                `**Rôle:** ${newRole} (\`${newRole.id}\`)`,
                oldRole.name !== newRole.name ? `**Nom:** \`${oldRole.name}\` → \`${newRole.name}\`` : '',
                oldRole.color !== newRole.color ? `**Couleur:** \`${oldRole.hexColor}\` → \`${newRole.hexColor}\`` : '',
                oldRole.permissions.bitfield !== newRole.permissions.bitfield ? '**Permissions:** modifiées' : '',
            ].filter(Boolean).join('\n'), { color: 0xFEE75C });
            await LogDispatcher.roles(guild, embed);
        }
    },
};
