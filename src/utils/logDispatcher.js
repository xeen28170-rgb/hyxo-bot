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

function sanitizeEmbedForDiscord(embed) {
    try {
        const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
        if (!data) return embed;

        if (data.description?.length > 4000) {
            embed.setDescription(data.description.slice(0, 3990) + '…');
        }

        const fields = data.fields || [];
        if (fields.length > 25) {
            embed.spliceFields(25, fields.length - 25);
        }
        // Re-lecture après splice pour tronquer les valeurs trop longues.
        const finalData = typeof embed?.toJSON === 'function' ? embed.toJSON() : data;
        for (const field of finalData.fields || []) {
            if (field.name?.length > 256) field.name = field.name.slice(0, 251) + '…';
            if (field.value?.length > 1024) field.value = field.value.slice(0, 1019) + '…';
        }
    } catch { /* embed non modifiable : on laisse Discord rejeter */ }

    return embed;
}

// Entrées d'audit reçues en temps réel (guildAuditLogEntryCreate) : évite un appel REST
// fetchAuditLogs à chaque événement loggé quand l'entrée est déjà arrivée.
const recentAuditEntries = new Map(); // guildId → [entry]
const AUDIT_MEMORY_MS = 30 * 1000;

function matchesAudit(entry, type, targetId, maxAgeMs, now) {
    if (type != null && entry.action !== type) return false;
    if (now - entry.createdTimestamp > maxAgeMs) return false;
    return !targetId || entry.targetId === targetId || entry.target?.id === targetId;
}

class LogDispatcher {
    static recordAuditEntry(guildId, entry) {
        if (!guildId || !entry?.createdTimestamp) return;
        const now = Date.now();
        const list = (recentAuditEntries.get(guildId) || []).filter(e => now - e.createdTimestamp < AUDIT_MEMORY_MS);
        list.unshift(entry);
        recentAuditEntries.set(guildId, list.slice(0, 50));
    }

    static async findRecentAuditEntry(guild, type, targetId = null, maxAgeMs = AUDIT_LOG_TTL_MS) {
        const now = Date.now();
        const remembered = (recentAuditEntries.get(guild.id) || []).find(entry => matchesAudit(entry, type, targetId, maxAgeMs, now));
        if (remembered) return remembered;

        const logs = await guild.fetchAuditLogs({ type, limit: 5 }).catch(() => null);
        if (!logs) return null;
        return logs.entries.find(entry => matchesAudit(entry, null, targetId, maxAgeMs, Date.now())) || null;
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
            sanitizeEmbedForDiscord(embed);
            // Un log ne doit jamais pinger : seul un rôle mis volontairement dans `content`
            // (ex: rôle d'alerte raid) est autorisé à notifier.
            const pingRoles = [...String(options.content || '').matchAll(/<@&(\d+)>/g)].map(m => m[1]);
            const payload = { embeds: [embed], files, allowedMentions: { parse: [], roles: pingRoles } };
            if (options.content) payload.content = options.content;
            await channel.send(payload);
        } catch (error) {
            Logger.error(`Error sending log to channel ${channelId}:`, { message: error.message });
        }
    }

    static async moderation(guild, embed) {
        return this.send(guild, 'modLogs', embed);
    }

    static async prison(guild, embed) {
        const settings = await getGuildSettings(guild.client, guild.id, { create: false });
        const hasPrison = Boolean(settings?.logs?.prisonLogs);
        const hasMod = Boolean(settings?.logs?.modLogs);
        if (!hasPrison && !hasMod) return;
        return this.send(guild, hasPrison ? 'prisonLogs' : 'modLogs', embed);
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
        const settings = await getGuildSettings(guild.client, guild.id, { create: false });
        if (!settings || !settings.logs?.enabled) return;

        // Pas de salon d'erreurs dédié → on replie sur le salon de logs général
        // pour ne pas perdre silencieusement les erreurs critiques.
        const type = settings.logs?.errorLogs ? 'errorLogs' : 'logs';
        return this.send(guild, type, embed);
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
            await channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } });
        } catch (error) {
            Logger.error(`Error sending ticket log to channel ${channelId}:`, { message: error.message });
        }
    }
}

module.exports = LogDispatcher;
