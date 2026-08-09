'use strict';

const { AuditLogEvent } = require('discord.js');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');

module.exports = {
    name: 'guildBanAdd',
    async run(client, ban) {
        if (LogDispatcher.hasRecentModerationAction(ban.guild.id, 'ban', ban.user.id)) return;

        const auditEntry = await LogDispatcher.findRecentAuditEntry(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
        if (LogDispatcher.isSelfAuditEntry(client, auditEntry)) return;

        const embed = EmbedHelper.info('🚫 Membre Banni', [
            `**Utilisateur:** ${ban.user.tag} (\`${ban.user.id}\`)`,
            auditEntry?.executor ? `**Modérateur:** ${auditEntry.executor.tag} (\`${auditEntry.executor.id}\`)` : '',
            `**Raison:** ${auditEntry?.reason || ban.reason || 'Aucune raison spécifiée'}`
        ].filter(Boolean).join('\n'), { color: 0xFF0000 });

        await LogDispatcher.moderationAction(ban.guild, 'ban', embed);
    },
};
