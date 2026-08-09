'use strict';

const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const Guild = require('../../models/Guild');
const AntiraidService = require('../../services/antiraidService');
const { AuditLogEvent } = require('discord.js');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'roleDelete',
    async run(client, role) {
        const settings = await getGuildSettings(client, role.guild.id);
        await AntiraidService.handleRecentAuditAction(client, role.guild, AuditLogEvent.RoleDelete, role.id, settings);

        const roleCounters = { ...(settings.statsChannels?.roleCountIds || {}) };
        const statsChannelId = roleCounters[role.id];
        if (statsChannelId) {
            delete roleCounters[role.id];
            await Guild.updateOne({ guildId: role.guild.id }, { 'statsChannels.roleCountIds': roleCounters });
            client.cache?.invalidateGuild?.(role.guild.id);
            const statsChannel = role.guild.channels.cache.get(statsChannelId)
                || await role.guild.channels.fetch(statsChannelId).catch(() => null);
            if (statsChannel) await statsChannel.delete('[StatsChannels] Rôle supprimé').catch(() => {});
            scheduleStatsUpdate(client, role.guild, 'stats_role_delete', 5_000);
        }

        if (await LogDispatcher.isSelfAuditAction(client, role.guild, AuditLogEvent.RoleDelete, role.id)) return;

        const embed = EmbedHelper.info('🗑️ Rôle Supprimé', [
            `**Nom:** ${role.name}`,
            `**ID:** \`${role.id}\``
        ].join('\n'), { color: 0xFF0000 });

        await LogDispatcher.roles(role.guild, embed);
    },
};
