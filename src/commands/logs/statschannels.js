'use strict';

const { ChannelType } = require('discord.js');
const Guild = require('../../models/Guild');
const Logger = require('../../utils/logger');
const { getGuildSettings, invalidateGuildSettings } = require('../../utils/guildSettings');

const COUNTER_DEFS = [
    { key: 'serverNameId', name: (stats) => `🏠 ${stats.guildName}` },
    { key: 'memberCountId', name: (stats) => `👥 Membres : ${stats.members}` },
    { key: 'onlineCountId', name: (stats) => `🟢 Actifs : ${stats.online}` },
    { key: 'voiceCountId', name: (stats) => `🔊 En vocal : ${stats.voice}` },
    { key: 'boosterCountId', name: (stats) => `💎 Boosts : ${stats.boosts}` },
];

const CATEGORY_NAME = '📊 Statistiques';
const UPDATE_INTERVAL = 5 * 60 * 1000;

const updaters = new Map();
const pendingTimers = new Map();

function isStatsChannelId(statsChannels, channelId) {
    if (!statsChannels || !channelId) return false;
    if (statsChannels.categoryId === channelId) return true;
    for (const def of COUNTER_DEFS) {
        if (statsChannels[def.key] === channelId) return true;
    }
    if (statsChannels.roleCountIds && typeof statsChannels.roleCountIds === 'object') {
        if (Object.values(statsChannels.roleCountIds).includes(channelId)) return true;
    }
    return false;
}

async function computeStats(guild, { forceMemberFetch = false } = {}) {
    // Les statuts sont tenus à jour en mémoire par la passerelle (intent GuildPresences) :
    // inutile de télécharger toute la liste des membres à chaque mise à jour (lent et limité
    // par Discord sur les gros serveurs). Téléchargement complet seulement à la configuration.
    if (forceMemberFetch) await guild.members.fetch().catch(() => null);
    const online = guild.presences?.cache?.filter((p) => p.status === 'online').size || 0;

    let voice = 0;
    for (const [, ch] of guild.channels.cache) {
        if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) {
            voice += ch.members?.size || 0;
        }
    }

    return {
        guildName: guild.name,
        members: guild.memberCount || 0,
        online,
        voice,
        boosts: guild.premiumSubscriptionCount || 0,
    };
}

async function ensureCategory(guild, saved, updates, tally) {
    let categoryId = saved?.categoryId || null;
    let category = categoryId
        ? (guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null))
        : null;

    if (!category) {
        category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory }).catch(() => null);
        if (category) {
            categoryId = category.id;
            updates['statsChannels.categoryId'] = categoryId;
            tally.created++;
        }
    }
    return category;
}

async function updateStatsChannels(client, guild, { forceMemberFetch = false, createMissing = false } = {}) {
    if (!guild?.id) return { updated: 0, created: 0 };

    const settings = await getGuildSettings(client, guild.id, { create: false });
    const saved = settings?.statsChannels;

    let updated = 0;
    let created = 0;
    const updates = {};
    const tally = { created: 0 };

    const category = createMissing
        ? await ensureCategory(guild, saved, updates, tally)
        : (saved?.categoryId
            ? (guild.channels.cache.get(saved.categoryId) || await guild.channels.fetch(saved.categoryId).catch(() => null))
            : null);

    if (!category) return { updated, created };
    created += tally.created;

    const stats = await computeStats(guild, { forceMemberFetch });

    for (const def of COUNTER_DEFS) {
        const channelId = saved?.[def.key] || null;
        const targetName = def.name(stats);

        let channel = channelId
            ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
            : null;

        // Anciens compteurs créés en salon textuel : Discord y remplace les espaces
        // par des tirets et retire les « : ». On les recrée en vocal.
        const legacyText = channel?.type === ChannelType.GuildText;
        if (legacyText) {
            await channel.delete('[Stats] Conversion en salon vocal').catch(() => {});
            channel = null;
        }

        if (channel) {
            if (channel.name !== targetName) {
                await channel.setName(targetName, '[Stats] Mise à jour').catch(() => {});
                updated++;
            }
        } else if (createMissing || legacyText) {
            const ch = await guild.channels.create({
                name: targetName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [{ id: guild.id, deny: ['Connect', 'SendMessages'] }],
            }).catch(() => null);
            if (ch) {
                updates[`statsChannels.${def.key}`] = ch.id;
                created++;
            }
        }
    }

    for (const [roleId, channelId] of Object.entries(saved?.roleCountIds || {})) {
        const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
        if (!role) continue;
        const targetName = `👥 ${role.name} : ${role.members.size}`;
        const channel = channelId
            ? (guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null))
            : null;
        if (channel && channel.name !== targetName) {
            await channel.setName(targetName, '[Stats] Mise à jour').catch(() => {});
            updated++;
        }
    }

    if (Object.keys(updates).length) {
        await Guild.updateOne({ guildId: guild.id }, updates);
        invalidateGuildSettings(client, guild.id);
    }

    return { updated, created };
}

function scheduleStatsUpdate(client, guild, reason, delay = 15_000) {
    if (!guild?.id) return;
    const guildId = guild.id;
    // Déjà en attente : on ne réinitialise pas le timer, sinon il ne se
    // déclencherait jamais sur les serveurs actifs (événements fréquents).
    if (pendingTimers.has(guildId)) return;

    const timer = setTimeout(async () => {
        pendingTimers.delete(guildId);
        try {
            await updateStatsChannels(client, guild, {});
        } catch (e) {
            Logger.error(`[StatsChannels] Update error (${reason}):`, e.message);
        }
    }, delay);
    if (timer.unref) timer.unref();
    pendingTimers.set(guildId, timer);
}

function startStatsUpdater(client, guild) {
    if (!guild?.id) return;
    stopStatsUpdater(client, guild.id);

    const interval = setInterval(async () => {
        try {
            await updateStatsChannels(client, guild, {});
        } catch (e) {
            Logger.error('[StatsChannels] Updater error:', e.message);
        }
    }, UPDATE_INTERVAL);
    if (interval.unref) interval.unref();
    updaters.set(guild.id, interval);
}

function stopStatsUpdater(client, guildId) {
    if (!guildId) return;
    if (updaters.has(guildId)) {
        clearInterval(updaters.get(guildId));
        updaters.delete(guildId);
    }
    if (pendingTimers.has(guildId)) {
        clearTimeout(pendingTimers.get(guildId));
        pendingTimers.delete(guildId);
    }
}

module.exports = {
    updateStatsChannels,
    startStatsUpdater,
    stopStatsUpdater,
    scheduleStatsUpdate,
    isStatsChannelId,
};