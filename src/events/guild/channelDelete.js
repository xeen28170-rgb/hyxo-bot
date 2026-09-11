'use strict';

const { AuditLogEvent } = require('discord.js');
const AntiraidService = require('../../services/antiraidService');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { isStatsChannelId, scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');
const Ticket = require('../../models/Ticket');
const TempVoice = require('../../models/TempVoice');

module.exports = {
    name: 'channelDelete',
    async run(client, channel) {
        if (!channel.guild) return;
        const settings = await getGuildSettings(client, channel.guild.id);
        await AntiraidService.handleRecentAuditAction(client, channel.guild, AuditLogEvent.ChannelDelete, channel.id, settings);

        // Nettoie les records orphelins (ticket / salle vocale temporaire) dont le salon
        // vient d'être supprimé — évite les entrées résiduelles pointant vers un canal mort.
        try {
            const ticket = await Ticket.findOne({ channelId: channel.id });
            if (ticket) await Ticket.deleteOne({ channelId: channel.id });

            const voice = await TempVoice.findOne({ channelId: channel.id });
            if (voice) await TempVoice.deleteOne({ channelId: channel.id });
        } catch (e) {
            require('../../utils/logger').error('[channelDelete] Erreur nettoyage records:', e);
        }

        const selfAudit = await LogDispatcher.isSelfAuditAction(client, channel.guild, AuditLogEvent.ChannelDelete, channel.id);
        if (!selfAudit && isStatsChannelId(settings.statsChannels, channel.id)) {
            scheduleStatsUpdate(client, channel.guild, 'stats_channel_deleted', 5_000);
        }
        if (selfAudit) return;

        const embed = EmbedHelper.info('🗑️ Salon supprimé', [
            `**Nom:** ${channel.name}`,
            `**ID:** \`${channel.id}\``,
            `**Type:** \`${channel.type}\``,
        ].join('\n'), { color: 0xED4245 });
        await LogDispatcher.channels(channel.guild, embed);
    },
};
