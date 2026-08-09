'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');

const LOG_CATEGORIES = [
    {
        name: 'Logs Serveur',
        categoryName: '📁 Logs Serveur',
        entries: [
            { key: 'messageLogs', label: 'Messages', channelName: 'logs-messages', aliases: ['message', 'messages', 'messagelog'] },
            { key: 'voiceLogs', label: 'Vocaux', channelName: 'logs-vocaux', aliases: ['voice', 'vocal', 'vocaux', 'voicelog'] },
            { key: 'roleLogs', label: 'Rôles', channelName: 'logs-rôles', aliases: ['role', 'roles', 'rôle', 'rôles', 'rolelog'] },
            { key: 'channelLogs', label: 'Salons', channelName: 'logs-salons', aliases: ['channel', 'channels', 'salon', 'salons'] },
            { key: 'serverLogs', label: 'Serveur', channelName: 'logs-serveur', aliases: ['server', 'serveur', 'guild'] },
            { key: 'joinLogs', secondaryKeys: ['leaveLogs'], label: 'Join Leave', channelName: 'logs-join-leave', aliases: ['join', 'leave', 'joinleave', 'join-leave', 'arrivees', 'départs'] },
            { key: 'boostLogs', label: 'Boosts', channelName: 'logs-boosts', aliases: ['boost', 'boosts', 'boostlog'] },
            { key: 'webhookLogs', label: 'Webhooks', channelName: 'logs-webhooks', aliases: ['webhook', 'webhooks'] },
        ],
    },
    {
        name: 'Modération & Sécurité',
        categoryName: '📁 Logs Modération & Sécurité',
        entries: [
            { key: 'modLogs', label: 'Modération', channelName: 'logs-modération', aliases: ['mod', 'moderation', 'modération', 'modlog'] },
            { key: 'securityLogs', label: 'Sécurité', channelName: 'logs-security', aliases: ['security', 'sécurité', 'secur'] },
            { key: 'raidLogs', label: 'Raid', channelName: 'logs-raid', aliases: ['raid', 'antiraid', 'raidlog'] },
            { key: 'warnLogs', label: 'Warns', channelName: 'logs-warns', aliases: ['warn', 'warns'] },
            { key: 'banLogs', label: 'Bans', channelName: 'logs-bans', aliases: ['ban', 'bans'] },
            { key: 'kickLogs', label: 'Kicks', channelName: 'logs-kicks', aliases: ['kick', 'kicks'] },
            { key: 'muteLogs', label: 'Mutes', channelName: 'logs-mutes', aliases: ['mute', 'mutes'] },
            { key: 'unmuteLogs', label: 'Unmutes', channelName: 'logs-unmutes', aliases: ['unmute', 'unmutes'] },
            { key: 'timeoutLogs', label: 'Timeout', channelName: 'logs-timeout', aliases: ['timeout', 'timeouts'] },
            { key: 'ticketLogs', label: 'Tickets', channelName: 'logs-tickets', aliases: ['ticket', 'tickets'] },
            { key: 'giveawayLogs', label: 'Giveaways', channelName: 'logs-giveaways', aliases: ['giveaway', 'giveaways'] },
            { key: 'errorLogs', label: 'Erreurs', channelName: 'logs-erreurs', aliases: ['error', 'errors', 'erreur', 'erreurs'] },
        ],
    },
];

const ALL_LOG_ENTRIES = LOG_CATEGORIES.flatMap(category => category.entries.map(entry => ({ ...entry, group: category.name })));
const LOG_ALIAS_TO_KEY = new Map();
for (const entry of ALL_LOG_ENTRIES) {
    LOG_ALIAS_TO_KEY.set(entry.key.toLowerCase(), entry.key);
    LOG_ALIAS_TO_KEY.set(entry.channelName.toLowerCase(), entry.key);
    for (const alias of entry.aliases || []) LOG_ALIAS_TO_KEY.set(alias.toLowerCase(), entry.key);
}

function getLogEntry(input) {
    if (!input) return null;
    const key = LOG_ALIAS_TO_KEY.get(String(input).toLowerCase());
    return key ? ALL_LOG_ENTRIES.find(entry => entry.key === key) : null;
}

function buildLogUpdates(channels) {
    const updates = { 'logs.enabled': true };
    for (const entry of ALL_LOG_ENTRIES) {
        const channel = channels[entry.key];
        if (!channel) continue;
        updates[`logs.${entry.key}`] = channel.id;
        for (const secondaryKey of entry.secondaryKeys || []) updates[`logs.${secondaryKey}`] = channel.id;
    }
    if (channels.ticketLogs) updates['tickets.logChannel'] = channels.ticketLogs.id;
    if (channels.joinLogs) {
        updates['welcome.enabled'] = true;
        updates['welcome.channel'] = channels.joinLogs.id;
    }
    if (channels.boostLogs) {
        updates['boost.enabled'] = true;
        updates['boost.channel'] = channels.boostLogs.id;
    }
    return updates;
}

async function ensureLogsSetup(guild, botId) {
    const categories = {};
    const channels = {};
    const created = [];
    const reused = [];
    const failed = [];

    for (const group of LOG_CATEGORIES) {
        categories[group.name] = await ensureCategory(guild, group.categoryName, botId);
        for (const entry of group.entries) {
            try {
                const channel = await ensureTextChannel(guild, entry.channelName, categories[group.name].id, botId);
                channels[entry.key] = channel;
                if (channel.__wasCreated) created.push({ entry, channel });
                else reused.push({ entry, channel });
                delete channel.__wasCreated;
            } catch (error) {
                failed.push({ entry, error });
            }
        }
    }

    return { categories, channels, created, reused, failed, updates: buildLogUpdates(channels) };
}

async function ensureCategory(guild, name, botId) {
    const existing = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === name);
    if (existing) {
        await hardenLogPermissions(existing, guild, botId).catch(() => {});
        return existing;
    }
    return guild.channels.create({
        name,
        type: ChannelType.GuildCategory,
        permissionOverwrites: buildLogOverwrites(guild, botId),
        reason: '[Logs] Création catégorie logs',
    });
}

async function ensureTextChannel(guild, name, parentId, botId) {
    const existing = guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name === name);
    if (existing) {
        await hardenLogPermissions(existing, guild, botId).catch(() => {});
        return existing;
    }
    const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: parentId || undefined,
        permissionOverwrites: buildLogOverwrites(guild, botId),
        reason: '[Logs] Création salon logs',
    });
    channel.__wasCreated = true;
    return channel;
}

async function hardenLogPermissions(channel, guild, botId) {
    await channel.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
    await channel.permissionOverwrites.edit(botId, {
        ViewChannel: true,
        SendMessages: true,
        EmbedLinks: true,
        AttachFiles: true,
    });
}

function buildLogOverwrites(guild, botId) {
    return [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: botId,
            allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks,
                PermissionFlagsBits.AttachFiles,
            ],
        },
    ];
}

module.exports = {
    LOG_CATEGORIES,
    ALL_LOG_ENTRIES,
    getLogEntry,
    ensureLogsSetup,
};
