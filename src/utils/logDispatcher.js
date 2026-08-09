'use strict';

const Logger = require('./logger');
const { getGuildSettings } = require('./guildSettings');

const dedupeCache = new Map();
const recentModerationActions = new Map();
const DEDUPE_TTL_MS = 30 * 1000;
const MODERATION_ACTION_TTL_MS = 2 * 60 * 1000;
const AUDIT_LOG_TTL_MS = 15 * 1000;

function stableEmbedPayload(embed) {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    return JSON.stringify({
        title: data?.title || '',
        description: data?.description || '',
        fields: (data?.fields || []).map(field => ({
            name: field.name,
            value: field.value,
        })),
        footer: data?.footer?.text || '',
    });
}

function shouldSkipDuplicate(guildId, channelId, embed, files = [], dedupeKey = null) {
    const now = Date.now();
    for (const [key, timestamp] of dedupeCache) {
        if (now - timestamp > DEDUPE_TTL_MS) dedupeCache.delete(key);
    }

    const fileNames = files.map(file => file?.name || file?.attachment || '').join(',');
    const key = `${guildId}:${channelId}:${dedupeKey || stableEmbedPayload(embed)}:${fileNames}`;
    if (dedupeCache.has(key)) return true;
    dedupeCache.set(key, now);
    return false;
}

function normalizeModerationAction(action) {
    if (action === 'tempban') return 'ban';
    if (action === 'tempmute' || action === 'tempcmute' || action === 'cmute') return 'mute';
    if (action === 'uncmute') return 'unmute';
    return action;
}

function cleanupRecentModerationActions() {
    const now = Date.now();
    for (const [key, timestamp] of recentModerationActions) {
        if (now - timestamp > MODERATION_ACTION_TTL_MS) recentModerationActions.delete(key);
    }
}

class LogDispatcher {
    static async findRecentAuditEntry(guild, type, targetId = null, maxAgeMs = AUDIT_LOG_TTL_MS) {
        const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
        if (!logs) return null;

        const now = Date.now();
        return logs.entries.find(entry => {
            if (now - entry.createdTimestamp > maxAgeMs) return false;
            if (!targetId) return true;
            return entry.targetId === targetId || entry.target?.id === targetId;
        }) || null;
    }

    static isSelfAuditEntry(client, entry) {
        return Boolean(entry?.executorId && entry.executorId === client.user?.id);
    }

    static async isSelfAuditAction(client, guild, type, targetId = null) {
        const entry = await this.findRecentAuditEntry(guild, type, targetId);
        return this.isSelfAuditEntry(client, entry);
    }

    static markModerationAction(guildId, action, userId) {
        cleanupRecentModerationActions();
        recentModerationActions.set(`${guildId}:${normalizeModerationAction(action)}:${userId}`, Date.now());
    }

    static hasRecentModerationAction(guildId, action, userId) {
        cleanupRecentModerationActions();
        return recentModerationActions.has(`${guildId}:${normalizeModerationAction(action)}:${userId}`);
    }

    static async send(guild, type, embed, options = {}) {
        const settings = await getGuildSettings(guild.client, guild.id, { create: false });
        if (!settings || !settings.logs?.enabled) return;

        const channelId = settings.logs[type] || settings.logs.channel;
        if (!channelId) return;

        let channel = guild.channels.cache.get(channelId);
        if (!channel) {
            try {
                channel = await guild.channels.fetch(channelId);
            } catch {
                return;
            }
        }
        if (!channel) return;

        const files = options.files || [];
        if (options.dedupe !== false && shouldSkipDuplicate(guild.id, channel.id, embed, files, options.dedupeKey)) {
            Logger.debug(`[Logs] Doublon ignoré (${type}) dans ${guild.name}/${channel.id}`);
            return;
        }

        try {
            const payload = { embeds: [embed], files };
            if (options.content) payload.content = options.content;
            await channel.send(payload);
        } catch (error) {
            Logger.error(`Error sending log to channel ${channelId}:`, { message: error.message });
        }
    }

    static async moderation(guild, embed) {
        return this.send(guild, 'modLogs', embed);
    }

    static async moderationAction(guild, action, embed) {
        const actionToLog = {
            warn: 'warnLogs',
            ban: 'banLogs',
            tempban: 'banLogs',
            unban: 'banLogs',
            kick: 'kickLogs',
            mute: 'muteLogs',
            tempmute: 'muteLogs',
            cmute: 'muteLogs',
            tempcmute: 'muteLogs',
            unmute: 'unmuteLogs',
            uncmute: 'unmuteLogs',
            timeout: 'timeoutLogs',
        };
        return this.send(guild, actionToLog[action] || 'modLogs', embed);
    }

    static async messages(guild, embed) {
        return this.send(guild, 'messageLogs', embed);
    }

    static async voice(guild, embed) {
        return this.send(guild, 'voiceLogs', embed);
    }

    static async roles(guild, embed) {
        return this.send(guild, 'roleLogs', embed);
    }

    static async channels(guild, embed) {
        return this.send(guild, 'channelLogs', embed);
    }

    static async server(guild, embed) {
        return this.send(guild, 'serverLogs', embed);
    }

    static async webhooks(guild, embed) {
        return this.send(guild, 'webhookLogs', embed);
    }

    static async boost(guild, embed, options = {}) {
        return this.send(guild, 'boostLogs', embed, options);
    }

    static async join(guild, embed) {
        return this.send(guild, 'joinLogs', embed);
    }

    static async leave(guild, embed) {
        return this.send(guild, 'leaveLogs', embed);
    }

    static async raid(guild, embed, options = {}) {
        return this.send(guild, 'raidLogs', embed, options);
    }

    static async security(guild, embed, options = {}) {
        return this.send(guild, 'securityLogs', embed, options);
    }

    static async giveaways(guild, embed) {
        return this.send(guild, 'giveawayLogs', embed);
    }

    static async errors(guild, embed) {
        return this.send(guild, 'errorLogs', embed);
    }

    static async tickets(guild, embed, files = []) {
        const settings = await getGuildSettings(guild.client, guild.id, { create: false });
        if (!settings || !settings.logs?.enabled) return;

        const channelId = settings.logs?.ticketLogs || settings.tickets?.logChannel || settings.logs?.channel;
        if (!channelId) return;

        let channel = guild.channels.cache.get(channelId);
        if (!channel) {
            try { channel = await guild.channels.fetch(channelId); } catch { return; }
        }
        if (!channel) return;

        if (shouldSkipDuplicate(guild.id, channel.id, embed, files)) {
            Logger.debug(`[Logs] Doublon ticket ignoré dans ${guild.name}/${channel.id}`);
            return;
        }

        try {
            await channel.send({ embeds: [embed], files });
        } catch (error) {
            Logger.error(`Error sending ticket log to channel ${channelId}:`, { message: error.message });
        }
    }
}

module.exports = LogDispatcher;
