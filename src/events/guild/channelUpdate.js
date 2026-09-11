'use strict';

const { AuditLogEvent } = require('discord.js');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { isStatsChannelId, scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'channelUpdate',
    async run(client, oldChannel, newChannel) {
        const guild = newChannel.guild || oldChannel.guild;
        if (!guild) return;
        const settings = await getGuildSettings(client, guild.id, { create: false });
        await AntiraidService.handleRecentAuditAction(client, guild, AuditLogEvent.ChannelUpdate, newChannel.id || oldChannel.id, settings);

        const selfAudit = await LogDispatcher.isSelfAuditAction(client, guild, AuditLogEvent.ChannelUpdate, newChannel.id || oldChannel.id);
        if (!selfAudit && isStatsChannelId(settings?.statsChannels, newChannel.id || oldChannel.id)) {
            scheduleStatsUpdate(client, guild, 'stats_channel_update', 5_000);
        }
        if (selfAudit) return;

        if (oldChannel.name !== newChannel.name || oldChannel.parentId !== newChannel.parentId || oldChannel.topic !== newChannel.topic) {
            const embed = EmbedHelper.info('✏️ Salon modifié', [
                `**Salon:** <#${newChannel.id}> (\`${newChannel.id}\`)`,
                oldChannel.name !== newChannel.name ? `**Nom:** \`${oldChannel.name}\` → \`${newChannel.name}\`` : '',
                oldChannel.parentId !== newChannel.parentId ? `**Catégorie:** \`${oldChannel.parentId || 'aucune'}\` → \`${newChannel.parentId || 'aucune'}\`` : '',
            ].filter(Boolean).join('\n'), { color: 0xFEE75C });
            await LogDispatcher.channels(guild, embed);
        }
    },
};
