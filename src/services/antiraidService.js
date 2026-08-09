'use strict';

const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const AntiraidLog = require('../models/AntiraidLog');
const SecurityLog = require('../models/SecurityLog');
const Logger = require('../utils/logger');
const EmbedHelper = require('../utils/embedBuilder');
const LogDispatcher = require('../utils/logDispatcher');

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

const massJoinCache = new Map(); // guildId → { joins: [timestamps], alerted: bool }

const AntiraidService = {

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

        const trust = this.getTrustReason(client, guild, settings, executorId);
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
        const tracker = client.antiRaidCache.get(cacheKey) || { times: [] };

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
        const trust = this.getTrustReason(client, guild, settings, executorId);
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
            await this.punish(client, guild, executorId, settings, moduleKey, group, 1);
            return true;
        }

        const cacheKey = `${guild.id}:${executorId}:${group}`;
        const tracker = client.antiRaidCache.get(cacheKey) || { times: [] };
        tracker.times = tracker.times.filter(t => now - t < cfg.windowMs);
        tracker.times.push(now);
        client.antiRaidCache.set(cacheKey, tracker);

        if (tracker.times.length >= cfg.threshold) {
            client.antiRaidCache.delete(cacheKey);
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
                    const trust = entry ? this.getTrustReason(client, guild, settings, entry.executorId) : null;
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

        const punishment = ar.punishments?.[moduleKey] || ar.punishment || 'derank';

        let member = null;
        try {
            member = await guild.members.fetch(executorId);
        } catch {
            // ignore
        }

        if (!member && punishment !== 'ban') return;

        const botMember = guild.members.me;
        if (!botMember) return;

        const auditReason = `[ANTIRAID] ${group} — ${count}x détecté`;

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
                    }
                    break;
                }
                case 'kick':
                    if (!member) break;
                    if (!member.kickable) break;
                    LogDispatcher.markModerationAction(guild.id, 'kick', executorId);
                    await member.kick(auditReason);
                    break;
                case 'ban':
                    if (member && !member.bannable) break;
                    LogDispatcher.markModerationAction(guild.id, 'ban', executorId);
                    await guild.members.ban(executorId, { reason: auditReason, deleteMessageSeconds: 0 });
                    break;
                case 'timeout':
                    if (!member) break;
                    if (!member.moderatable) break;
                    await member.timeout(24 * 60 * 60 * 1000, auditReason);
                    break;
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

        let locked = 0;
        const everyoneRole = guild.roles.everyone;

        for (const [, channel] of guild.channels.cache) {
            if (!['GuildText', 'GuildNews', 'GuildForum'].includes(channel.type?.toString?.() || '') &&
                channel.type !== 0 && channel.type !== 5 && channel.type !== 15) continue;

            try {
                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    AddReactions: false,
                }, { reason });
                locked++;
            } catch { /* skip channels où on n'a pas les perms */ }
        }

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

        let unlocked = 0;
        const everyoneRole = guild.roles.everyone;

        for (const [, channel] of guild.channels.cache) {
            if (channel.type !== 0 && channel.type !== 5 && channel.type !== 15) continue;

            try {
                await channel.permissionOverwrites.edit(everyoneRole, {
                    SendMessages: null,
                    SendMessagesInThreads: null,
                    AddReactions: null,
                }, { reason });
                unlocked++;
            } catch { /* skip */ }
        }

        const entry = massJoinCache.get(guild.id);
        if (entry) entry.lockdown = false;

        Logger.info(`[ANTIRAID][UNLOCK] ${guild.name}: ${unlocked} salons déverrouillés`);
        return unlocked;
    },

    async notifyRaid(client, guild, settings, user, action, count, punishment, extra = {}) {
        if (!settings?.logs?.enabled) return;
        if (!settings.logs?.raidLogs) return;

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

    getTrustReason(client, guild, settings, executorId) {
        if (!executorId) return 'executor inconnu';
        if (executorId === client.user?.id) return 'bot lui-même';
        if (client.botOwners?.has(executorId) || client.owners?.has(executorId)) return 'owner bot';
        if (settings?.owners?.includes(executorId)) return 'owner bot serveur';
        if (settings?.antiraid?.whitelist?.includes(executorId)) return 'whitelist';
        return null;
    },

    isTrustedExecutor(client, guild, settings, executorId) {
        return Boolean(this.getTrustReason(client, guild, settings, executorId));
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
            return { threshold: parseInt(text, 10), windowMs: DEFAULT_WINDOW_MS };
        }
        const match = text.match(/^(\d+)\s*\/\s*(\d+)\s*(ms|s|m)?$/i);
        if (!match) return null;
        const threshold = parseInt(match[1], 10);
        const amount = parseInt(match[2], 10);
        const unit = (match[3] || 's').toLowerCase();
        const factor = unit === 'ms' ? 1 : unit === 'm' ? 60_000 : 1000;
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
        for (const [key, tracker] of client.antiRaidCache) {
            const fresh = tracker.times?.filter(t => now - t < DEFAULT_WINDOW_MS * 2);
            if (!fresh || fresh.length === 0) {
                client.antiRaidCache.delete(key);
            } else {
                tracker.times = fresh;
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
    },
};

setInterval(() => {
    const now = Date.now();
    for (const [guildId, entry] of massJoinCache) {
        entry.joins = entry.joins.filter(t => now - t < 300_000);
        if (entry.joins.length === 0 && !entry.lockdown) massJoinCache.delete(guildId);
    }
}, 5 * 60_000);

module.exports = AntiraidService;
