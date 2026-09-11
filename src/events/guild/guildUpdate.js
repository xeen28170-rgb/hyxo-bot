'use strict';

const { AuditLogEvent } = require('discord.js');
const LogDispatcher = require('../../utils/logDispatcher');
const EmbedHelper = require('../../utils/embedBuilder');
const AntiraidService = require('../../services/antiraidService');
const Logger = require('../../utils/logger');
const { scheduleStatsUpdate } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'guildUpdate',
    async run(client, oldGuild, newGuild) {
        // Protection anti-down URL serveur (vanity) en secours :
        // si l'URL vanity a changé, lire l'audit log pour identifier l'auteur.
        if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
            try {
                const settings = await getGuildSettings(client, newGuild.id, { create: false });
                if (settings?.antidown?.enabled) {
                    const logs = await newGuild.fetchAuditLogs({ type: AuditLogEvent.GuildUpdate, limit: 5 }).catch(() => null);
                    const entry = logs?.entries.find(e =>
                        Date.now() - e.createdTimestamp < 15_000
                    );
                    if (entry) await AntiraidService.handleGuildUpdate(client, newGuild, entry, settings);
                }
            } catch (e) {
                Logger.error('[ANTIDOWN] Erreur fallback:', e);
            }
        }

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
