'use strict';

const { AuditLogEvent } = require('discord.js');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');

module.exports = {
    name: 'guildUpdate',
    async run(client, oldGuild, newGuild) {
        if (
            oldGuild.name !== newGuild.name ||
            oldGuild.premiumSubscriptionCount !== newGuild.premiumSubscriptionCount ||
            oldGuild.premiumTier !== newGuild.premiumTier
        ) {
            scheduleStatsUpdate(client, newGuild, 'guild_update', 5_000);
        }

        const changes = [
            oldGuild.name !== newGuild.name ? `**Nom:** \`${oldGuild.name}\` → \`${newGuild.name}\`` : '',
            oldGuild.verificationLevel !== newGuild.verificationLevel ? `**Vérification:** \`${oldGuild.verificationLevel}\` → \`${newGuild.verificationLevel}\`` : '',
            oldGuild.premiumSubscriptionCount !== newGuild.premiumSubscriptionCount ? `**Boosts:** \`${oldGuild.premiumSubscriptionCount || 0}\` → \`${newGuild.premiumSubscriptionCount || 0}\`` : '',
            oldGuild.premiumTier !== newGuild.premiumTier ? `**Niveau boost:** \`${oldGuild.premiumTier}\` → \`${newGuild.premiumTier}\`` : '',
        ].filter(Boolean);
        if (!changes.length) return;
        if (await LogDispatcher.isSelfAuditAction(client, newGuild, AuditLogEvent.GuildUpdate)) return;

        const embed = EmbedHelper.info('⚙️ Serveur modifié', changes.join('\n'), { color: 0xFEE75C });
        await LogDispatcher.server(newGuild, embed);
    },
};
