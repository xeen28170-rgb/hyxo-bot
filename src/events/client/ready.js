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
const TempRoleService = require('../../services/tempRoleService');
const AutoBackupService = require('../../services/autoBackupService');
const BlacklistService = require('../../services/blacklistService');
const WetService = require('../../services/wetService');
const InviteSecurity = require('../../services/inviteSecurityService');
const PrisonService = require('../../services/prisonService');
const SupportRoleService = require('../../services/supportRoleService');
const ConfigCloud = require('../../services/configCloudService');
const QuizService = require('../../services/quizService');

module.exports = {
    name: 'clientReady',
    once: true,
    async run(client) {
        Logger.success(`Bot connecté en tant que ${client.user.username}`);
        Logger.info(`Serveurs: ${client.guilds.cache.size} | Utilisateurs: ${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}`);
        Logger.info(`Commandes: ${client.commands.size}`);

        // Sauvegarde Discord de tout le dossier data, toutes les 10 minutes (seulement ce qui
        // a changé). La restauration, elle, a lieu avant la connexion (index.js).
        ConfigCloud.start(client);
        // Quiz automatique (+quizz) : une question toutes les X minutes sur les serveurs activés.
        QuizService.start(client);

        for (const [, guild] of client.guilds.cache) {
            if (await InviteSecurity.enforce(guild)) continue;
            client.boostLogCache.set(guild.id, guild.premiumSubscriptionCount || 0);
        }
        Logger.debug(`Compteurs boost initialisés pour ${client.boostLogCache.size} serveur(s).`);

        const setActivity = () => {
            const activities = [
                { name: `${client.guilds.cache.size} serveurs`, type: ActivityType.Watching },
                { name: `${client.prefix}help | Hyxo`, type: ActivityType.Playing },
                { name: `${client.commands.size} commandes`, type: ActivityType.Listening },
            ];
            const activity = activities[Math.floor(Math.random() * activities.length)];
            client.user.setPresence({ status: 'online', activities: [activity] });
        };

        // ─── Schedulers / cron ─────────────────────────────────────────────
        // Le client peut se reconnecter (shardResume) ou les événements peuvent
        // être hot-reloadés. On stocke les handles sur le client et on les
        // NETTOIE avant d'en créer de nouveaux : sinon chaque reconnexion
        // empile un setInterval d'activité + 3 cron → activités en double,
        // sanctions/reminders/giveaways/twitch traités plusieurs fois.
        if (client._readyTimers) {
            clearInterval(client._readyTimers.activity);
            for (const task of (client._readyTimers.crons || [])) {
                try { task.stop(); } catch { /* déjà arrêté */ }
            }
        }
        const readyTimers = { crons: [] };

        setActivity();
        readyTimers.activity = setInterval(setActivity, 30000);

        // node-cron saute une exécution dès 1 s de retard (CPU limité, réseau lent) :
        // on tolère 30 s et on évite qu'un passage lent chevauche le suivant.
        const cronOptions = { noOverlap: true, missedExecutionTolerance: 30_000 };

        readyTimers.crons.push(cron.schedule('* * * * *', async () => {
            try { await SanctionService.processExpired(client); } catch (err) { Logger.error('Cron sanctions:', err); }
            try { await TempRoleService.processExpired(client); } catch (err) { Logger.error('Cron roles temporaires:', err); }
            try { await ReminderService.processReminders(client); } catch (err) { Logger.error('Cron reminders:', err); }
            try { await GiveawayService.processEnded(client); } catch (err) { Logger.error('Cron giveaways:', err); }
        }, cronOptions));

        readyTimers.crons.push(cron.schedule('*/5 * * * *', async () => {
            Logger.debug(`Heartbeat | Ping: ${client.ws.ping}ms | RAM: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
            try { await TwitchService.processAlerts(client); } catch (err) { Logger.error('Cron Twitch:', err); }
            // Purge périodique des caches antiraid en mémoire (audit logs déjà
            // traités, compteurs, antiRaidCache du client) pour éviter les fuites.
            try { AntiraidService.cleanupCache(client); } catch (err) { Logger.error('Cron antiraid cleanup:', err); }
            try { await BlacklistService.enforceAll(client); } catch (err) { Logger.error('Cron blacklist:', err); }
            try { await WetService.enforceAll(client); } catch (err) { Logger.error('Cron wet:', err); }
            try { await AutoBackupService.process(client); } catch (err) { Logger.error('Cron backups:', err); }
        }, cronOptions));


        client._readyTimers = readyTimers;

        Logger.success(`✅ ${client.user.username} est opérationnel!`);
        await BlacklistService.enforceAll(client);
        await WetService.enforceAll(client).catch(err => Logger.error('[Wet] Démarrage:', err.message));
        await AutoBackupService.process(client);
        await SanctionService.processExpired(client);

        for (const guild of client.guilds.cache.values()) {
            const settings = await getGuildSettings(client, guild.id, { create: false });
            for (const id of settings?.prison?.prisoners || []) {
                try {
                    const member = await guild.members.fetch(id);
                    await PrisonService.restorePrisonRole(client, member);
                } catch (error) { Logger.error(`[Prison] Reprise ${guild.id}/${id}:`, error.message); }
            }
            if (settings?.config?.soutien) {
                for (const presence of guild.presences.cache.values()) {
                    try { await SupportRoleService.onPresence(client, presence); } catch (error) { Logger.error('[Soutien] Reprise:', error.message); }
                }
            }
        }

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
                    await TempRoleService.expire(client, tr);
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
