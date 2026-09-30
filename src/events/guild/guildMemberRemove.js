'use strict';

const { AuditLogEvent } = require('discord.js');
const EmbedHelper = require('../../utils/embedBuilder');
const LogDispatcher = require('../../utils/logDispatcher');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');

module.exports = {
    name: 'guildMemberRemove',
    async run(client, member) {
        const guild = member.guild;
        scheduleStatsUpdate(client, guild, 'member_remove', 15_000);

        if (
            LogDispatcher.hasRecentModerationAction(guild.id, 'ban', member.id) ||
            LogDispatcher.hasRecentModerationAction(guild.id, 'kick', member.id)
        ) return;

        await wait(1_000);

        // Les deux recherches en parallèle (souvent servies depuis la mémoire, sans appel réseau).
        const [banAudit, kickAudit] = await Promise.all([
            LogDispatcher.findRecentAuditEntry(guild, AuditLogEvent.MemberBanAdd, member.id, 20_000),
            LogDispatcher.findRecentAuditEntry(guild, AuditLogEvent.MemberKick, member.id, 20_000),
        ]);
        if (banAudit) return;
        if (LogDispatcher.isSelfAuditEntry(client, kickAudit)) return;
        if (kickAudit) {
            const kickEmbed = EmbedHelper.info('👢 Membre expulsé', [
                `**Utilisateur:** ${member.user.tag} (\`${member.id}\`)`,
                kickAudit.executorId ? `**Modérateur:** <@${kickAudit.executorId}> (\`${kickAudit.executorId}\`)` : '',
                `**Raison:** ${kickAudit.reason || 'Aucune raison spécifiée'}`,
            ].filter(Boolean).join('\n'), { color: 0xFF9500 })
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setTimestamp();
            await LogDispatcher.moderationAction(guild, 'kick', kickEmbed);
            return;
        }

        const embed = EmbedHelper.info('📤 Départ d\'un membre', [
            `**Utilisateur:** ${member.user} (\`${member.id}\`)`,
            member.joinedTimestamp
                ? `**A rejoint le:** <t:${Math.floor(member.joinedTimestamp / 1000)}:f> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
                : '**A rejoint le:** Inconnu',
            `**Nombre total de membres:** \`${guild.memberCount}\``
        ].join('\n'), { color: 0xFF0000 })
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `ID: ${member.id}`, iconURL: guild.iconURL() })
            .setTimestamp();

        await LogDispatcher.leave(guild, embed);
    },
};

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
