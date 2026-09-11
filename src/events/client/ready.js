'use strict';

const { ActivityType } = require('discord.js');
const Logger = require('../../utils/logger');
const cron = require('node-cron');
const ReminderService = require('../../services/reminderService');
const GiveawayService = require('../../services/giveawayService');
const SanctionService = require('../../services/sanctionService');
const AntiraidService = require('../../services/antiraidService');
const TwitchService = require('../../services/twitchService');
const TempRole = require('../../models/TempRole');
const { scheduleTempRoleExpiry } = require('../../commands/gestion/temprole');
const { startStatsUpdater } = require('../../commands/logs/statschannels');
const { getGuildSettings } = require('../../utils/guildSettings');

module.exports = {
    name: 'clientReady',
    once: true,
    async run(client) {
        Logger.success(`Bot connecté en tant que ${client.user.username}`);
        Logger.info(`Serveurs: ${client.guilds.cache.size} | Utilisateurs: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`);
        Logger.info(`Commandes: ${client.commands.size}`);

        for (const [, guild] of client.guilds.cache) {
            client.boostLogCache.set(guild.id, guild.premiumSubscriptionCount || 0);
        }
        Logger.debug(`Compteurs boost initialisés pour ${client.boostLogCache.size} serveur(s).`);

        const setActivity = () => {
            const activities = [
                { name: `${client.guilds.cache.size} serveurs`, type: ActivityType.Watching },
                { name: '-help | Gestions', type: ActivityType.Playing },
                { name: `${client.commands.size} commandes`, type: ActivityType.Listening },
            ];
            const activity = activities[Math.floor(Math.random() * activities.length)];
            client.user.setPresence({ status: 'online', activities: [activity] });
        };

        setActivity();
        setInterval(setActivity, 30000);

        cron.schedule('* * * * *', async () => {
            try { await SanctionService.processExpired(client); } catch (err) { Logger.error('Cron sanctions:', err); }
            try { await ReminderService.processReminders(client); } catch (err) { Logger.error('Cron reminders:', err); }
            try { await GiveawayService.processEnded(client); } catch (err) { Logger.error('Cron giveaways:', err); }
        });

        cron.schedule('*/5 * * * *', async () => {
            Logger.debug(`Heartbeat | Ping: ${client.ws.ping}ms | RAM: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            try { await TwitchService.processAlerts(client); } catch (err) { Logger.error('Cron Twitch:', err); }
            // Purge périodique des caches antiraid en mémoire (audit logs déjà
            // traités, compteurs, antiRaidCache du client) pour éviter les fuites.
            try { AntiraidService.cleanupCache(client); } catch (err) { Logger.error('Cron antiraid cleanup:', err); }
        });


        cron.schedule('0 3 * * *', async () => {
            Logger.info('Backup automatique en cours...');
        });

        Logger.success(`✅ ${client.user.username} est opérationnel!`);

        // ─── Reprise des Stats Channels au démarrage ──────────────────────────
        try {
            let statsResumed = 0;
            for (const [, guild] of client.guilds.cache) {
                const settings = await getGuildSettings(client, guild.id, { create: false });
                if (settings?.statsChannels?.categoryId) {
                    startStatsUpdater(client, guild);
                    statsResumed++;
                }
            }
            if (statsResumed > 0) Logger.info(`[StatsChannels] ${statsResumed} updater(s) repris au démarrage.`);
        } catch (e) {
            Logger.error('[StatsChannels] Erreur reprise au démarrage:', e);
        }

        try {
            const allTempRoles = await TempRole.findAll();
            const now = Date.now();
            let resumed = 0, expired = 0;
            for (const tr of allTempRoles) {
                const remaining = new Date(tr.expiresAt).getTime() - now;
                if (remaining <= 0) {
                    const guild = client.guilds.cache.get(tr.guildId);
                    if (guild) {
                        const member = await guild.members.fetch(tr.userId).catch(() => null);
                        if (member?.roles.cache.has(tr.roleId)) {
                            await member.roles.remove(tr.roleId, 'TempRole expiré (reprise démarrage)').catch(() => {});
                        }
                    }
                    await TempRole.remove({ guildId: tr.guildId, userId: tr.userId, roleId: tr.roleId });
                    expired++;
                } else {
                    scheduleTempRoleExpiry(client, tr.guildId, tr.userId, tr.roleId, remaining);
                    resumed++;
                }
            }
            if (allTempRoles.length > 0) {
                Logger.info(`[TempRole] ${resumed} timer(s) repris, ${expired} expiré(s) nettoyés au démarrage.`);
            }
        } catch (e) {
            Logger.error('[TempRole] Erreur reprise au démarrage:', e);
        }
    },
};
