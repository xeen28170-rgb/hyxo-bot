'use strict';

const { AuditLogEvent, PermissionFlagsBits, Routes } = require('discord.js');
const AntiraidLog = require('../models/AntiraidLog');
const SecurityLog = require('../models/SecurityLog');
const Guild = require('../models/Guild');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const LogDispatcher = require('../utils/logDispatcher');
const PermissionsHelper = require('../utils/permissions');
const { isWhitelisted } = require('../utils/whitelist');
const { mapLimit } = require('../utils/concurrency');

const ACTION_TO_MODULE = {
    [AuditLogEvent.ChannelCreate]:     { module: 'antichannel', group: 'channel' },
    [AuditLogEvent.ChannelDelete]:     { module: 'antichannel', group: 'channel' },
    [AuditLogEvent.ChannelUpdate]:     { module: 'antichannel', group: 'channel' },
    [AuditLogEvent.RoleCreate]:        { module: 'antirole',    group: 'role'    },
    [AuditLogEvent.RoleDelete]:        { module: 'antirole',    group: 'role'    },
    [AuditLogEvent.RoleUpdate]:        { module: 'antirole',    group: 'role'    },
    [AuditLogEvent.MemberBanAdd]:      { module: 'antiban',     group: 'ban'     },
    [AuditLogEvent.MemberKick]:        { module: 'antikick',    group: 'kick'    },
    [AuditLogEvent.MemberBanRemove]:   { module: 'antiunban',   group: 'unban'   },
    [AuditLogEvent.WebhookCreate]:     { module: 'antiwebhook', group: 'webhook' },
    [AuditLogEvent.WebhookUpdate]:     { module: 'antiwebhook', group: 'webhook' },
    [AuditLogEvent.WebhookDelete]:     { module: 'antiwebhook', group: 'webhook' },
    [AuditLogEvent.GuildUpdate]:       { module: 'antiupdate',  group: 'update'  },
    [AuditLogEvent.MemberUpdate]:      { module: 'antideco',    group: 'deco'    },
    [AuditLogEvent.MemberRoleUpdate]:  { module: 'antideco',    group: 'deco'    },
    [AuditLogEvent.EmojiCreate]:       { module: 'antiupdate',  group: 'update'  },
    [AuditLogEvent.EmojiDelete]:       { module: 'antiupdate',  group: 'update'  },
    [AuditLogEvent.StickerCreate]:     { module: 'antiupdate',  group: 'update'  },
    [AuditLogEvent.StickerDelete]:     { module: 'antiupdate',  group: 'update'  },
    [AuditLogEvent.IntegrationCreate]: { module: 'antitoken',   group: 'token'   },
    [AuditLogEvent.IntegrationDelete]: { module: 'antitoken',   group: 'token'   },
    [AuditLogEvent.BotAdd]:            { module: 'antibot',     group: 'bot'     },
};

const DEFAULT_THRESHOLDS = {
    channel: 3,
    role:    3,
    ban:     3,
    kick:    3,
    unban:   5,
    webhook: 2,
    update:  3,
    deco:    5,
    token:   2,
    bot:     1,
    everyone: 3,
    here: 3,
};

const DEFAULT_WINDOW_MS = 10_000;
const AUDIT_ENTRY_MAX_AGE_MS = 8_000;
const processedAuditLogs = new Map();
const DANGEROUS_ROLE_PERMISSIONS = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.MentionEveryone,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.ManageThreads,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ViewAuditLog,
];
const THRESHOLD_ALIASES = {
    channel: ['channel', 'antichannel'],
    role: ['role', 'antirole'],
    ban: ['ban', 'antiban'],
    kick: ['kick', 'antikick'],
    unban: ['unban', 'antiunban'],
    webhook: ['webhook', 'antiwebhook'],
    update: ['update', 'antiupdate'],
    deco: ['deco', 'antideco'],
    token: ['token', 'antitoken'],
    bot: ['bot', 'antibot'],
    everyone: ['everyone', 'antieveryone'],
    here: ['here', 'antihere'],
};

// Permissions dont l'ajout déclenche une annulation immédiate (escalade).
const CRITICAL_PERMISSIONS = PermissionFlagsBits.Administrator | PermissionFlagsBits.ManageGuild
    | PermissionFlagsBits.ManageRoles | PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageWebhooks
    | PermissionFlagsBits.BanMembers | PermissionFlagsBits.KickMembers;
const LOCK_PERMISSIONS =['SendMessages', 'SendMessagesInThreads', 'AddReactions'];
const massJoinCache = new Map(); // guildId → { joins: [timestamps], alerted: bool }
const recentVanityBans = new Map(); // guildId:executorId → timestamp (anti double-ban)
const processedVanityLogs = new Map(); // auditLogId → timestamp (dédup anti-down, séparée d'antiraid)

const AntiraidService = {

    /**
     * Protection Anti-Down URL serveur (vanity).
     * - Détecte le changement de l'URL vanity du serveur.
     * - Seuls les owners du bot bypassent.
     * - La whitelist, les owners serveur, l'owner du serveur : PAS de bypass -> ban automatique.
     */
    async handleGuildUpdate(client, guild, auditLog, settings) {
        const antidown = settings?.antidown;
        if (!antidown?.enabled) return;

        // Identifier un changement de vanity url dans l'audit log
        const changes = auditLog?.changes || [];
        const vanityChange = changes.find(c => c?.key === 'vanity_url_code');
        if (!vanityChange) return;

        // Déduplication propre à l'anti-down (l'événement temps réel ET le fallback
        // guildUpdate peuvent se déclencher). Map séparée : ne doit pas bloquer antiupdate.
        if (auditLog?.id) {
            if (processedVanityLogs.has(auditLog.id)) return;
            processedVanityLogs.set(auditLog.id, Date.now());
        }

        const executorId = auditLog.executorId;
        if (!executorId) return;
        if (executorId === client.user?.id) return;

        const newVanity = vanityChange.new;
        const oldVanity = vanityChange.old;

        // Seul un owner du bot bypass — ni whitelist, ni owner serveur, ni couronne
        const isBotOwner = PermissionsHelper.isBotOwner(client, executorId);
        if (isBotOwner) {
            // L'owner bot a le droit de changer, on mémorise la nouvelle valeur comme référence verrouillée
            await Guild.updateOne({ guildId: guild.id }, { 'antidown.vanity': newVanity || null });
            await this.logDecision(client, guild, settings, {
                level: 'bypass',
                moduleKey: 'antidown',
                group: 'vanity',
                executorId,
                action: 'guildUpdate.vanity_url_code',
                reason: 'owner bot',
            });
            return;
        }

        Logger.warn(`[ANTIDOWN] ${guild.name}: tentative de changement d'URL vanity par ${executorId} (${newVanity || 'suppression'})`);
        // Journalisation non bloquante : la réaction doit partir immédiatement.
        Promise.resolve(this.logDecision(client, guild, settings, {
            level: 'detect',
            moduleKey: 'antidown',
            group: 'vanity',
            executorId,
            action: 'guildUpdate.vanity_url_code',
            reason: 'modification URL serveur non autorisée',
            punishment: 'ban',
        })).catch(() => {});

        // Ban et restauration en parallèle : chaque ms compte avant qu'un autre serveur
        // ne récupère l'URL libérée. Whitelist incluse ne bypass PAS.
        await Promise.all([
            this.restoreVanity(client, guild, antidown, oldVanity, newVanity),
            this.hardBan(client, guild, settings, executorId, '[ANTIDOWN] Changement URL serveur non autorisé'),
        ]);
    },

    async restoreVanity(client, guild, antidown, oldVanity, newVanity) {
        // Référence = valeur verrouillée, sinon ancienne valeur de l'audit log.
        const lockedUrl = antidown.vanity || oldVanity;
        if (!lockedUrl) {
            Logger.warn(`[ANTIDOWN] ${guild.name}: aucune URL de référence verrouillée`);
            return;
        }
        if (!antidown.vanity) {
            Guild.updateOne({ guildId: guild.id }, { 'antidown.vanity': lockedUrl }).catch(() => {});
        }
        if (antidown.restore === false || lockedUrl === newVanity) return;

        // discord.js v14 n'a pas de guild.setVanityCode -> appel REST direct
        try {
            await client.rest.patch(Routes.guildVanityUrl(guild.id), {
                body: { code: lockedUrl },
                reason: '[ANTIDOWN] Restauration URL serveur',
            });
            Logger.warn(`[ANTIDOWN] ${guild.name}: URL restaurée vers discord.gg/${lockedUrl}`);
        } catch (err) {
            Logger.warn(`[ANTIDOWN] ${guild.name}: restauration URL impossible (${err.code || ''} ${err.message})`);
        }
    },

    async hardBan(client, guild, settings, executorId, reason) {
        const botMember = guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.BanMembers)) return;

        // Anti double-ban vanity : un même exécuteur n'est traité qu'une fois par
        // courte fenêtre (l'événement audit et le fallback guildUpdate peuvent se déclencher).
        const dedupKey = `${guild.id}:${executorId}`;
        const lastBan = recentVanityBans.get(dedupKey);
        if (lastBan && Date.now() - lastBan < 10_000) return;
        recentVanityBans.set(dedupKey, Date.now());

        const member = await guild.members.fetch(executorId).catch(() => null);

        // Toujours tracer le résultat réel : un ban impossible ou raté doit être signalé, pas maquillé en succès.
        let punishment = 'ban';
        let detail = reason;
        if (executorId === guild.ownerId) {
            punishment = 'aucune';
            detail = `${reason}\n⚠️ Propriétaire du serveur : ban impossible (Discord).`;
            Logger.warn(`[ANTIDOWN] Impossible de bannir le propriétaire du serveur (${executorId}) — Discord empêche l'auto-ban du owner`);
        } else if (member && !member.bannable) {
            punishment = 'aucune';
            detail = `${reason}\n⚠️ Ban impossible : rôle de l'exécuteur au-dessus du bot.`;
            Logger.warn(`[ANTIDOWN] Impossible de bannir ${executorId} (hiérarchie)`);
        } else {
            LogDispatcher.markModerationAction(guild.id, 'ban', executorId);
            try {
                await guild.members.ban(executorId, { reason, deleteMessageSeconds: 0 });
            } catch (err) {
                punishment = 'échec';
                detail = `${reason}\n⚠️ Échec du ban : ${err.message}`;
                Logger.error(`[ANTIDOWN] Échec du ban de ${executorId}:`, { message: err.message });
            }
        }

        const executorTag = member?.user?.tag || executorId;
        await Promise.all([
            AntiraidLog.create({
                guildId: guild.id,
                executorId,
                executorTag,
                action: 'vanity',
                punishment,
                count: 1,
                details: { moduleKey: 'antidown', group: 'vanity' },
            }),
            SecurityLog.create({
                type: 'antidown',
                module: 'antidown',
                action: 'vanity',
                guildId: guild.id,
                userId: executorId,
                userTag: executorTag,
                reason: detail,
                punishment,
                count: 1,
                details: { moduleKey: 'antidown' },
            }),
            this.notifyRaid(client, guild, settings, member?.user || { id: executorId, tag: executorId }, 'vanity', 1, punishment, {
                detail,
            }),
        ]).catch(err => Logger.error('[ANTIDOWN] Erreur journalisation:', { message: err.message }));
    },

    async handleAuditLog(client, guild, auditLog, settings) {
        if (!auditLog?.id || processedAuditLogs.has(auditLog.id)) return;
        processedAuditLogs.set(auditLog.id, Date.now());

        const mapping = ACTION_TO_MODULE[auditLog.action];
        if (!mapping) return;

        const { module: moduleKey, group } = mapping;
        const ar = settings.antiraid;

        const moduleState = ar[moduleKey];
        if (!moduleState || moduleState === 'off') return;

        const executorId = auditLog.executorId;
        if (!executorId) return;
        if (executorId === client.user?.id) return;

        const trust = await this.getTrustReason(client, guild, settings, executorId);
        if (trust) {
            await this.logDecision(client, guild, settings, {
                level: 'bypass',
                moduleKey,
                group,
                executorId,
                action: auditLog.action,
                reason: trust,
            });
            return;
        }

        // Une seule escalade (Admin donné à un rôle/membre) suffit à compromettre le
        // serveur : annulation + sanction immédiates, sans attendre le seuil.
        if (await this.handlePrivilegeEscalation(client, guild, auditLog, settings, moduleKey, group, executorId)) return;

        const cfg = this.resolveThresholdConfig(ar, group);
        const window = cfg.windowMs;
        const threshold = cfg.threshold;
        const now = Date.now();

        if (moduleKey === 'antitoken' && moduleState === 'lock') {
            Logger.warn(`[ANTIRAID][LOCK] ${guild.name}: integration/token action bloquee (${executorId})`);
            await this.lockdownGuild(client, guild, settings, '[ANTIRAID] antitoken lock detecte');
            await this.punish(client, guild, executorId, settings, moduleKey, group, 1);
            return;
        }

        if (moduleState === 'max') {
            Logger.warn(`[ANTIRAID][MAX] ${guild.name}: ${executorId} → ${group}`);
            await this.logDecision(client, guild, settings, {
                level: 'detect',
                moduleKey,
                group,
                executorId,
                action: auditLog.action,
                reason: 'mode max',
                punishment: ar.punishments?.[moduleKey] || ar.punishment || 'derank',
            });
            await this.punish(client, guild, executorId, settings, moduleKey, group, 1);
            return;
        }

        const cacheKey = `${guild.id}:${executorId}:${group}`;
        const tracker = client.antiRaidCache.get(cacheKey) || { times: [], windowMs: window };

        tracker.times = tracker.times.filter(t => now - t < window);
        tracker.times.push(now);
        client.antiRaidCache.set(cacheKey, tracker);

        if (tracker.times.length >= threshold) {
            client.antiRaidCache.delete(cacheKey);
            Logger.warn(`[ANTIRAID] ${guild.name}: ${executorId} → ${group} (${tracker.times.length}x en ${window}ms)`);
            await this.logDecision(client, guild, settings, {
                level: 'detect',
                moduleKey,
                group,
                executorId,
                action: auditLog.action,
                reason: `${tracker.times.length}/${threshold} en ${window}ms`,
                punishment: ar.punishments?.[moduleKey] || ar.punishment || 'derank',
            });
            await this.punish(client, guild, executorId, settings, moduleKey, group, tracker.times.length);
        }
    },

    /**
     * Annule immédiatement l'attribution de permissions critiques par un exécuteur
     * non autorisé (rôle modifié, rôle créé, rôle dangereux donné à un membre).
     * @returns {Promise<boolean>} true si une escalade a été traitée
     */
    async handlePrivilegeEscalation(client, guild, auditLog, settings, moduleKey, group, executorId) {
        const change = key => (auditLog.changes || []).find(c => c?.key === key);
        const reason = '[ANTIRAID] Escalade de permissions annulée';
        let revert = null;
        let detail = '';

        if (auditLog.action === AuditLogEvent.RoleUpdate || auditLog.action === AuditLogEvent.RoleCreate) {
            const perms = change('permissions');
            if (!perms) return false;
            const before = BigInt(perms.old ?? 0);
            const added = BigInt(perms.new ?? 0) & ~before;
            if (!(added & CRITICAL_PERMISSIONS)) return false;
            const role = guild.roles.cache.get(auditLog.targetId);
            if (!role || role.managed) return false;
            detail = `Permissions critiques ajoutées au rôle ${role.name}`;
            revert = auditLog.action === AuditLogEvent.RoleCreate
                ? () => role.delete(reason)
                : () => role.setPermissions(before, reason);
        } else if (auditLog.action === AuditLogEvent.MemberRoleUpdate) {
            const addedIds = (change('$add')?.new || []).map(r => r.id);
            const critical = addedIds.map(id => guild.roles.cache.get(id))
                .filter(role => role && (role.permissions.bitfield & CRITICAL_PERMISSIONS));
            if (!critical.length) return false;
            const target = await guild.members.fetch(auditLog.targetId).catch(() => null);
            if (!target) return false;
            detail = `Rôle(s) critique(s) donné(s) à ${target.user.tag} : ${critical.map(r => r.name).join(', ')}`;
            revert = () => target.roles.remove(critical, reason);
        } else {
            return false;
        }

        Logger.warn(`[ANTIRAID][ESCALADE] ${guild.name}: ${detail} par ${executorId}`);
        await Promise.all([
            Promise.resolve(revert()).catch(err => Logger.warn(`[ANTIRAID][ESCALADE] Annulation impossible: ${err.message}`)),
            this.punish(client, guild, executorId, settings, moduleKey, group, 1),
        ]);
        this.logDecision(client, guild, settings, {
            level: 'detect',
            moduleKey,
            group,
            executorId,
            action: auditLog.action,
            reason: detail,
            punishment: settings.antiraid?.punishments?.[moduleKey] || settings.antiraid?.punishment || 'derank',
        }).catch(() => {});
        return true;
    },

    async handleRecentAuditAction(client, guild, action, targetId, settings) {
        if (!settings?.antiraid?.enabled) return;
        try {
            const logs = await guild.fetchAuditLogs({ type: action, limit: 5 }).catch(() => null);
            const entry = logs?.entries.find(item => {
                if (processedAuditLogs.has(item.id)) return false;
                if (Date.now() - item.createdTimestamp > AUDIT_ENTRY_MAX_AGE_MS) return false;
                return !targetId || item.targetId === targetId;
            });
            if (!entry) return;
            await this.handleAuditLog(client, guild, entry, settings);
        } catch (error) {
            Logger.error('[ANTIRAID] Erreur lecture audit logs récents:', { message: error.message });
        }
    },

    async handleEveryoneMention(client, message, settings) {
        const ar = settings?.antiraid;
        if (!ar?.enabled) return false;

        const hasEveryone = message.mentions?.everyone && /@everyone/i.test(message.content);
        const hasHere = /@here/i.test(message.content);
        if (!hasEveryone && !hasHere) return false;

        const guild = message.guild;
        const executorId = message.author.id;
        const trust = await this.getTrustReason(client, guild, settings, executorId, message.member);
        if (trust) {
            await this.logDecision(client, guild, settings, {
                level: 'bypass',
                moduleKey: hasEveryone ? 'antieveryone' : 'antihere',
                group: hasEveryone ? 'everyone' : 'here',
                executorId,
                action: 'messageMention',
                reason: trust,
            });
            return false;
        }

        const moduleKey = hasEveryone ? 'antieveryone' : 'antihere';
        const group = hasEveryone ? 'everyone' : 'here';
        const effectiveState = ar?.[moduleKey] || (group === 'here' ? ar?.antieveryone : 'off');
        if (!effectiveState || effectiveState === 'off') return false;

        const cfg = this.resolveThresholdConfig(ar, group);
        const now = Date.now();

        if (effectiveState === 'max') {
            await message.delete().catch(() => {});
            await this.punish(client, guild, executorId, settings, moduleKey, group, 1);
            return true;
        }

        const cacheKey = `${guild.id}:${executorId}:${group}`;
        const tracker = client.antiRaidCache.get(cacheKey) || { times: [], windowMs: cfg.windowMs };
        tracker.times = tracker.times.filter(t => now - t < cfg.windowMs);
        tracker.times.push(now);
        client.antiRaidCache.set(cacheKey, tracker);

        if (tracker.times.length >= cfg.threshold) {
            client.antiRaidCache.delete(cacheKey);
            await message.delete().catch(() => {});
            await this.punish(client, guild, executorId, settings, moduleKey, group, tracker.times.length);
            return true;
        }
        return false;
    },

    async handleMemberJoin(client, member, settings) {
        const ar = settings.antiraid;
        if (!ar?.enabled) return;

        const guild = member.guild;
        const now = Date.now();

        if (ar.creationLimit) {
            const limitMs = this.parseDuration(ar.creationLimit);
            if (limitMs && now - member.user.createdTimestamp < limitMs) {
                // Ne jamais pénaliser un membre de confiance (crown/owner/whitelist/owners du bot).
                const trust = await this.getTrustReason(client, guild, settings, member.id, member);
                if (trust) return;
                Logger.warn(`[ANTIRAID][CREATION] Compte trop récent: ${member.user.tag} (${guild.name})`);
                try {
                    LogDispatcher.markModerationAction(guild.id, 'kick', member.id);
                    await member.kick('[ANTIRAID] Compte trop récent');
                    await this.notifyRaid(client, guild, settings, member.user, 'account_too_new', 1, 'kick', {
                        detail: `Compte créé il y a ${Math.floor((now - member.user.createdTimestamp) / 86400000)}j`,
                    });
                } catch (e) {
                    Logger.error('[ANTIRAID] Erreur kick compte récent:', e);
                }
                return;
            }
        }

        if (member.user.bot && ar.antibot && ar.antibot !== 'off') {
            setTimeout(async () => {
                try {
                    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 3 }).catch(() => null);
                    const entry = logs?.entries.find(e =>
                        e.targetId === member.id && Date.now() - e.createdTimestamp < 10_000
                    );
                    const trust = entry ? await this.getTrustReason(client, guild, settings, entry.executorId) : null;
                    if (trust) {
                        await this.logDecision(client, guild, settings, {
                            level: 'bypass',
                            moduleKey: 'antibot',
                            group: 'bot',
                            executorId: entry.executorId,
                            action: AuditLogEvent.BotAdd,
                            reason: trust,
                        });
                        return;
                    }

                    Logger.warn(`[ANTIRAID][ANTIBOT] Bot non autorisé: ${member.user.tag} (${guild.name})`);
                    if (!member.kickable) {
                        Logger.warn(`[ANTIRAID][ANTIBOT] Impossible de kicker ${member.user.tag} (hiérarchie insuffisante)`);
                        return;
                    }
                    LogDispatcher.markModerationAction(guild.id, 'kick', member.id);
                    await member.kick('[ANTIRAID] Bot non autorisé');
                    await this.notifyRaid(client, guild, settings, member.user, 'antibot', 1, 'kick');

                    if (ar.antibot === 'max' && entry?.executorId) {
                        await this.punish(client, guild, entry.executorId, settings, 'antibot', 'bot', 1);
                    }
                } catch (e) {
                    Logger.error('[ANTIRAID] Erreur antibot:', e);
                }
            }, 1500);
            return;
        }

        const massJoinThreshold = ar.thresholds?.massjoin ?? 10;
        const massJoinWindow    = ar.thresholds?.massjoinWindow ?? 8_000; // 8 secondes

        if (!massJoinCache.has(guild.id)) {
            massJoinCache.set(guild.id, { joins: [], alerted: false, lockdown: false });
        }

        const entry = massJoinCache.get(guild.id);
        entry.joins = entry.joins.filter(t => now - t < massJoinWindow);
        entry.joins.push(now);

        if (entry.joins.length >= massJoinThreshold && !entry.alerted) {
            entry.alerted = true;
            setTimeout(() => {
                const e = massJoinCache.get(guild.id);
                if (e) e.alerted = false;
            }, 30_000);

            Logger.warn(`[ANTIRAID][MASSJOIN] ${guild.name}: ${entry.joins.length} joins en ${massJoinWindow}ms`);

            await this.notifyRaid(client, guild, settings, null, 'mass_join', entry.joins.length, 'alert', {
                detail: `${entry.joins.length} membres ont rejoint en moins de ${massJoinWindow / 1000}s`,
                pingRole: ar.raidPingRole,
            });

            if (ar.autoLockdown) {
                await this.lockdownGuild(client, guild, settings, `[ANTIRAID] Mass-join détecté (${entry.joins.length} joins)`);
            }
        }
    },

    async punish(client, guild, executorId, settings, moduleKey, group, count) {
        const ar = settings.antiraid;

        let punishment = ar.punishments?.[moduleKey] || ar.punishment || 'derank';

        let member = null;
        try {
            member = await guild.members.fetch(executorId);
        } catch {
            // ignore
        }

        // Un bot garde son rôle d'intégration (managed, impossible à retirer) :
        // derank/timeout le laisseraient actif, on l'expulse directement.
        if (member?.user?.bot && (punishment === 'derank' || punishment === 'timeout')) {
            punishment = 'kick';
        }

        if (!member && punishment !== 'ban') return;

        const botMember = guild.members.me;
        if (!botMember) return;

        const auditReason = `[ANTIRAID] ${group} — ${count}x détecté`;

        let actionTaken = false;
        try {
            switch (punishment) {
                case 'derank': {
                    if (!member) break;
                    const protectedRoles = new Set(settings?.moderation?.noDerank || []);
                    const roles = member.roles.cache.filter(r =>
                        r.id !== guild.id &&
                        !protectedRoles.has(r.id) &&
                        r.position < botMember.roles.highest.position &&
                        !r.managed &&
                        this.isDangerousRole(r)
                    );
                    if (roles.size > 0) {
                        await member.roles.remove(roles, auditReason);
                        actionTaken = true;
                    }
                    break;
                }
                case 'kick':
                    if (!member) break;
                    if (!member.kickable) break;
                    LogDispatcher.markModerationAction(guild.id, 'kick', executorId);
                    await member.kick(auditReason);
                    actionTaken = true;
                    break;
                case 'ban':
                    if (member && !member.bannable) break;
                    LogDispatcher.markModerationAction(guild.id, 'ban', executorId);
                    await guild.members.ban(executorId, { reason: auditReason, deleteMessageSeconds: 0 });
                    actionTaken = true;
                    break;
                case 'timeout':
                    if (!member) break;
                    if (!member.moderatable) break;
                    await member.timeout(24 * 60 * 60 * 1000, auditReason);
                    actionTaken = true;
                    break;
            }

            if (!actionTaken) {
                Logger.warn(`[ANTIRAID] Punition ${punishment} non appliquée sur ${executorId} (${group}) — pas de membre ou hiérarchie insuffisante`);
                return;
            }

            await AntiraidLog.create({
                guildId: guild.id,
                executorId,
                executorTag: member?.user?.tag || executorId,
                action: group,
                punishment,
                count,
                details: { moduleKey, count },
            });

            await SecurityLog.create({
                type: 'antiraid',
                module: moduleKey,
                action: group,
                guildId: guild.id,
                userId: executorId,
                userTag: member?.user?.tag || executorId,
                reason: group,
                punishment,
                count,
                details: { moduleKey, count },
            });

            await this.notifyRaid(client, guild, settings, member?.user || { id: executorId, tag: executorId }, group, count, punishment);

        } catch (error) {
            Logger.error(`[ANTIRAID] Erreur punition (${punishment}) sur ${executorId}:`, { message: error.message });
        }
    },

    async lockdownGuild(client, guild, settings, reason = '[ANTIRAID] Lockdown') {
        const botMember = guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) return;

        const everyoneRole = guild.roles.everyone;

        const targets = [...guild.channels.cache.values()].filter(channel =>
            channel.type === 0 || channel.type === 5 || channel.type === 15);

        // Mémoriser les permissions @everyone d'origine pour que l'unlock ne rouvre pas
        // les salons déjà fermés (annonces, lecture seule…). Un second lockdown ne
        // doit pas écraser la photo d'origine par l'état verrouillé.
        const stored = await Guild.findOne({ guildId: guild.id }).catch(() => null);
        if (!stored?.antiraid?.lockdownSnapshot) {
            const snapshot = {};
            for (const channel of targets) {
                const overwrite = channel.permissionOverwrites.cache.get(everyoneRole.id);
                snapshot[channel.id] = Object.fromEntries(LOCK_PERMISSIONS.map(perm => [perm,
                    overwrite?.allow.has(perm) ? true : overwrite?.deny.has(perm) ? false : null]));
            }
            await Guild.updateOne({ guildId: guild.id }, { 'antiraid.lockdownSnapshot': snapshot }).catch(() => {});
        }

        // En parallèle (limite 8) : pendant un raid, verrouiller salon par salon en
        // série laissait le serveur ouvert trop longtemps.
        const results = await mapLimit(targets, (channel) =>
            channel.permissionOverwrites.edit(everyoneRole, {
                SendMessages: false,
                SendMessagesInThreads: false,
                AddReactions: false,
            }, { reason }), 8);
        const locked = results.filter(r => r.ok).length;

        Logger.warn(`[ANTIRAID][LOCKDOWN] ${guild.name}: ${locked} salons verrouillés`);

        const entry = massJoinCache.get(guild.id) || { joins: [], alerted: false };
        entry.lockdown = true;
        massJoinCache.set(guild.id, entry);

        await this.notifyRaid(client, guild, settings, null, 'lockdown', locked, 'lockdown', {
            detail: `${locked} salons verrouillés — ${reason}`,
            pingRole: settings.antiraid?.raidPingRole,
        });

        return locked;
    },

    async unlockGuild(client, guild, reason = '[ANTIRAID] Unlock') {
        const botMember = guild.members.me;
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) return 0;

        const everyoneRole = guild.roles.everyone;

        const targets = [...guild.channels.cache.values()].filter(channel =>
            channel.type === 0 || channel.type === 5 || channel.type === 15);

        const stored = await Guild.findOne({ guildId: guild.id }).catch(() => null);
        const snapshot = stored?.antiraid?.lockdownSnapshot || {};
        const neutral = Object.fromEntries(LOCK_PERMISSIONS.map(perm => [perm, null]));

        // Restaure l'état d'avant le lockdown (neutre pour les salons créés depuis).
        const results = await mapLimit(targets, (channel) =>
            channel.permissionOverwrites.edit(everyoneRole, snapshot[channel.id] || neutral, { reason }), 8);
        const unlocked = results.filter(r => r.ok).length;
        await Guild.updateOne({ guildId: guild.id }, { 'antiraid.lockdownSnapshot': null }).catch(() => {});

        const entry = massJoinCache.get(guild.id);
        if (entry) entry.lockdown = false;

        Logger.info(`[ANTIRAID][UNLOCK] ${guild.name}: ${unlocked} salons déverrouillés`);
        return unlocked;
    },

    async notifyRaid(client, guild, settings, user, action, count, punishment, extra = {}) {
        if (!settings?.logs?.enabled) return;
        if (!settings.logs?.raidLogs && !settings.logs?.securityLogs) return;

        const actionLabels = {
            channel:       '📁 Opérations sur les salons',
            role:          '🎭 Opérations sur les rôles',
            ban:           '🔨 Bans/Kicks suspects',
            kick:          '👢 Kicks suspects',
            unban:         '🔓 Unbans suspects',
            webhook:       '🔗 Opérations sur les webhooks',
            update:        '⚙️ Modifications du serveur',
            deco:          '🎨 Modifications membres suspects',
            token:         '🔑 Intégrations suspectes',
            everyone:      '📢 Mentions @everyone/@here',
            here:          '📣 Mentions @here',
            bot:           '🤖 Bot non autorisé',
            mass_join:     '🌊 Mass-join détecté',
            account_too_new: '🆕 Compte trop récent',
            lockdown:      '🔒 Lockdown activé',
            vanity:        '🌐 Changement URL serveur (anti-down)',
        };

        const fields = [
            { name: '⚡ Type', value: actionLabels[action] || action, inline: true },
            { name: '🔢 Détections', value: `\`${count}\``, inline: true },
            { name: '🔨 Punition', value: `\`${punishment}\``, inline: true },
        ];

        if (user) {
            fields.unshift({ name: '👤 Exécuteur', value: `${user.tag || user.id} (\`${user.id}\`)`, inline: false });
        }

        if (extra.detail) {
            fields.push({ name: '📝 Détail', value: extra.detail, inline: false });
        }
        if (extra.auditAction) {
            fields.push({ name: '🧾 Audit', value: `\`${extra.auditAction}\``, inline: true });
        }

        const embed = EmbedHelper.log({
            title: '🚨 ANTIRAID — Menace Détectée',
            color: 0xFF2222,
            fields,
        });

        const pingContent = extra.pingRole ? `<@&${extra.pingRole}>` : null;
        if (settings.logs?.raidLogs || settings.logs?.channel) {
            await LogDispatcher.raid(guild, embed, { content: pingContent || undefined });
        } else if (settings.logs?.securityLogs) {
            await LogDispatcher.security(guild, embed, { content: pingContent || undefined });
        }
    },

    async getTrustReason(client, guild, settings, executorId, member) {
        if (!executorId) return 'executor inconnu';
        if (executorId === client.user?.id) return 'bot lui-même';
        if (executorId === guild.ownerId) return 'crown owner';
        if (client.botOwners?.has(executorId) || client.owners?.has(executorId)) return 'owner bot';
        if (settings?.owners?.includes(executorId)) return 'owner bot serveur';

        const wl = settings?.antiraid?.whitelist || [];
        if (wl.length === 0) return null;
        if (!member && typeof guild.members?.fetch === 'function') {
            try {
                member = await guild.members.fetch(executorId);
            } catch {
                member = null;
            }
        }
        const trusted = await isWhitelisted(member, executorId, wl);
        return trusted ? 'whitelist' : null;
    },

    async isTrustedExecutor(client, guild, settings, executorId, member) {
        return Boolean(await this.getTrustReason(client, guild, settings, executorId, member));
    },

    isDangerousRole(role) {
        return DANGEROUS_ROLE_PERMISSIONS.some(permission => role.permissions.has(permission));
    },

    async logDecision(client, guild, settings, data) {
        const label = data.level === 'bypass' ? 'Bypass sécurité' : 'Action sécurité détectée';
        const message = `[ANTIRAID][${data.level?.toUpperCase()}] ${guild.name}: ${data.group} par ${data.executorId} (${data.reason})`;
        if (data.level === 'bypass') Logger.info(message);
        else Logger.warn(message);

        await SecurityLog.create({
            type: 'antiraid',
            module: data.moduleKey,
            action: data.group,
            guildId: guild.id,
            userId: data.executorId,
            userTag: data.executorId,
            reason: data.reason,
            punishment: data.punishment || 'none',
            count: 1,
            details: {
                auditAction: String(data.action),
                level: data.level,
            },
        });

        if (!settings?.logs?.enabled || !settings.logs?.securityLogs) return;
        const embed = EmbedHelper.log({
            title: `🧾 ${label}`,
            color: data.level === 'bypass' ? 0x57F287 : 0xFF2222,
            fields: [
                { name: 'Action', value: `\`${data.group}\``, inline: true },
                { name: 'Module', value: `\`${data.moduleKey}\``, inline: true },
                { name: 'Utilisateur', value: `<@${data.executorId}> (\`${data.executorId}\`)`, inline: false },
                { name: 'Raison', value: `\`${data.reason}\``, inline: true },
                { name: 'Sanction', value: `\`${data.punishment || 'aucune'}\``, inline: true },
            ],
        });
        await LogDispatcher.security(guild, embed);
    },

    isLockedDown(guildId) {
        return massJoinCache.get(guildId)?.lockdown === true;
    },

    parseDuration(str) {
        if (!str) return null;
        const match = String(str).match(/^(\d+)([smhdw])$/i);
        if (!match) return null;
        const n = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        const units = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
        return n * (units[unit] || 0);
    },

    parseThresholdValue(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
            return { threshold: Math.floor(value), windowMs: DEFAULT_WINDOW_MS };
        }
        const text = String(value).trim();
        if (/^\d+$/.test(text)) {
            const numeric = parseInt(text, 10);
            if (!numeric) return null; // 0 déclencherait immédiatement à chaque message
            return { threshold: numeric, windowMs: DEFAULT_WINDOW_MS };
        }
        const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*(ms|s|m|h|w)?$/i);
        if (!match) return null;
        const threshold = parseInt(match[1], 10);
        const amount = parseInt(match[2], 10);
        const unit = (match[3] || 's').toLowerCase();
        const factor = unit === 'ms' ? 1 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : unit === 'w' ? 604_800_000 : 1000;
        const windowMs = amount * factor;
        if (!threshold || !windowMs) return null;
        return { threshold, windowMs };
    },

    resolveThresholdConfig(ar, group) {
        const aliases = THRESHOLD_ALIASES[group] || [group];
        for (const key of aliases) {
            const parsed = this.parseThresholdValue(ar?.thresholds?.[key]);
            if (parsed) return parsed;
        }
        return {
            threshold: DEFAULT_THRESHOLDS[group] ?? 3,
            windowMs: DEFAULT_WINDOW_MS,
        };
    },

    cleanupCache(client) {
        const now = Date.now();
        if (client?.antiRaidCache) {
            for (const [key, tracker] of client.antiRaidCache) {
                const windowMs = tracker.windowMs || DEFAULT_WINDOW_MS * 2;
                const fresh = tracker.times?.filter(t => now - t < windowMs);
                if (!fresh || fresh.length === 0) {
                    client.antiRaidCache.delete(key);
                } else {
                    tracker.times = fresh;
                }
            }
        }
        for (const [auditId, timestamp] of processedAuditLogs) {
            if (now - timestamp > 60_000) processedAuditLogs.delete(auditId);
        }
        for (const [guildId, entry] of massJoinCache) {
            entry.joins = entry.joins.filter(t => now - t < 300_000);
            if (entry.joins.length === 0 && !entry.lockdown) {
                massJoinCache.delete(guildId);
            }
        }
        for (const [key, timestamp] of recentVanityBans) {
            if (now - timestamp > 60_000) recentVanityBans.delete(key);
        }
        for (const [auditId, timestamp] of processedVanityLogs) {
            if (now - timestamp > 60_000) processedVanityLogs.delete(auditId);
        }
    },

    /**
     * Purge les caches du module (audit logs traités, mass-join) sans client.
     * Utile pour un balayage périodique autonome.
     */
    cleanupModuleCache() {
        this.cleanupCache(null);
    },
};

// Balayage périodique : purge les caches du module (audit logs déjà traités, mass-join)
// pour éviter une fuite mémoire. `cleanupCache(client)` — qui purge aussi l'antiRaidCache
// du client — est appelé depuis ready.js qui dispose de la référence au client.
// Un hot-reload du module ne doit pas empiler plusieurs minuteries : un garde global
// n'en crée qu'une seule pour tout le processus.
if (!globalThis.__xeenAntiraidCleanupStarted) {
    globalThis.__xeenAntiraidCleanupStarted = true;
    const cleanupTimer = setInterval(() => {
        AntiraidService.cleanupModuleCache();
    }, 5 * 60_000);
    if (cleanupTimer.unref) cleanupTimer.unref();
}

module.exports = AntiraidService;
