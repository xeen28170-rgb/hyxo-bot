'use strict';

const { ChannelType } = require('discord.js');
const Backup = require('../models/Backup');
const Guild = require('../models/Guild');
const Helpers = require('../utils/helpers');
const { getGuildSettings, invalidateGuildSettings } = require('../utils/guildSettings');
const { withKey } = require('../utils/keyedQueue');
const { mapLimit } = require('../utils/concurrency');

// Réglages jamais écrasés par une restauration (gérés via -secur / -owner uniquement).
const SECURITY_KEYS = ['owners', 'ownerRoles', 'antiraid', 'antidown'];

function overwrites(channel) {
    return channel.permissionOverwrites.cache.map(o => ({ id: o.id, type: o.type,
        allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }));
}

function remapConfiguration(value, ids) {
    if (typeof value === 'string') return ids.get(value) || value;
    if (Array.isArray(value)) return value.map(item => remapConfiguration(item, ids));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
        .map(([key, item]) => [ids.get(key) || key, remapConfiguration(item, ids)]));
    return value;
}

const BackupService = {
    async create(guild, userId, kind = 'server') {
        const data = { name: guild.name, icon: guild.iconURL(), emojis: guild.emojis.cache.map(e => ({ name: e.name, url: e.url })) };
        if (kind === 'server') {
            const settings = await getGuildSettings(guild.client, guild.id, { create: false });
            data.roles = guild.roles.cache.filter(r => r.id !== guild.id && !r.managed)
                .sort((a, b) => a.position - b.position).map(r => ({ id: r.id, name: r.name, color: r.color,
                    hoist: r.hoist, permissions: r.permissions.bitfield.toString(), mentionable: r.mentionable, position: r.position }));
            const channels = guild.channels.cache.filter(c => !c.isThread?.() && c.permissionOverwrites);
            const serialize = c => ({ id: c.id, name: c.name, type: c.type, parentId: c.parentId,
                parent: c.parent?.name, position: c.position, topic: c.topic, nsfw: c.nsfw,
                rateLimitPerUser: c.rateLimitPerUser, bitrate: c.bitrate, userLimit: c.userLimit,
                permissionOverwrites: overwrites(c) });
            data.categories = channels.filter(c => c.type === ChannelType.GuildCategory).map(serialize);
            data.channels = channels.filter(c => c.type !== ChannelType.GuildCategory).map(serialize);
            const config = { ...settings };
            for (const key of ['guildId', 'createdAt', 'updatedAt', 'save', 'totalCommands']) delete config[key];
            data.configuration = JSON.parse(JSON.stringify(config));
        }
        return Backup.create({ guildId: guild.id, createdBy: userId, backupId: Helpers.generateId(12), kind,
            data, size: Buffer.byteLength(JSON.stringify(data)) });
    },

    rewriteOverwrite(overwrite, roleMap, everyoneRoleId) {
        if (!overwrite?.id || ![0, 1].includes(overwrite.type)) return null;
        const id = overwrite.type === 0 && overwrite.id !== everyoneRoleId ? roleMap.get(overwrite.id) : overwrite.id;
        return id ? { ...overwrite, id, allow: BigInt(overwrite.allow), deny: BigInt(overwrite.deny) } : null;
    },

    async restore(guild, backupId) {
        return withKey(`backup-restore:${guild.id}`, async () => {
            const backup = await Backup.findOne({ backupId, guildId: guild.id });
            if (!backup) return null;
            const data = backup.data;
            const report = { restored: 0, failed: 0, duplicates: 0, roles: [], channels: [], errors: [] };
            const roleMap = new Map([[guild.id, guild.id]]);
            const channelMap = new Map();
            const categoriesByName = new Map();
            const restoredChannels = [];
            const restoredIds = { ...backup.restoredIds };
            const fail = (label, error) => { report.failed++; report.errors.push(`${label}: ${error.message}`); };
            for (const saved of [...(data.roles || [])].sort((a, b) => a.position - b.position)) {
                try {
                    const existing = guild.roles.cache.get(restoredIds[saved.id] || saved.id);
                    const role = existing || await guild.roles.create({ name: saved.name, color: saved.color,
                        hoist: saved.hoist, permissions: BigInt(saved.permissions), mentionable: saved.mentionable, reason: 'Restauration backup' });
                    roleMap.set(saved.id, role.id);
                    restoredIds[saved.id] = role.id;
                    await Backup.updateOne({ backupId, guildId: guild.id }, { restoredIds: { ...restoredIds } });
                    if (existing) report.duplicates++; else report.restored++;
                    report.roles.push({ name: saved.name, status: existing ? 'duplicate' : 'created' });
                } catch (error) { fail(saved.name, error); report.roles.push({ name: saved.name, status: 'failed' }); }
            }

            if (report.roles.length && report.failed === 0) {
                try {
                    await guild.roles.setPositions((data.roles || []).map(r => ({ role: roleMap.get(r.id), position: r.position })));
                } catch (error) { fail('Positions des roles', error); }
            }

            for (const saved of [...(data.categories || []).map(c => ({ ...c, type: ChannelType.GuildCategory })), ...(data.channels || [])]) {
                try {
                    // Les anciens backups n'avaient pas d'ID de salon : nom uniquement en migration.
                    const existing = saved.id ? guild.channels.cache.get(restoredIds[saved.id] || saved.id)
                        : guild.channels.cache.find(c => c.name === saved.name && c.type === saved.type);
                    const parent = saved.parentId ? channelMap.get(saved.parentId) || guild.channels.cache.get(saved.parentId)?.id
                        : categoriesByName.get(saved.parent);
                    if ((saved.parentId || saved.parent) && !parent) throw new Error('Categorie parente non restauree');
                    const options = { name: saved.name, type: saved.type, position: saved.position, reason: 'Restauration backup' };
                    if (saved.type !== ChannelType.GuildCategory) options.parent = parent || null;
                    for (const key of ['topic', 'nsfw', 'rateLimitPerUser', 'bitrate', 'userLimit']) if (saved[key] != null) options[key] = saved[key];
                    // Permissions presentes des la creation : pas de fenetre publique.
                    options.permissionOverwrites = (saved.permissionOverwrites || []).map(o => this.rewriteOverwrite(o, roleMap, guild.id)).filter(Boolean);
                    if (options.permissionOverwrites.length !== (saved.permissionOverwrites || []).length) throw new Error('Role requis pour les permissions non restaure');
                    const channel = existing || await guild.channels.create(options);
                    if (existing) await channel.permissionOverwrites.set(options.permissionOverwrites);
                    if (saved.id) {
                        channelMap.set(saved.id, channel.id);
                        restoredIds[saved.id] = channel.id;
                        await Backup.updateOne({ backupId, guildId: guild.id }, { restoredIds: { ...restoredIds } });
                    }
                    if (saved.type === ChannelType.GuildCategory) categoriesByName.set(saved.name, channel.id);
                    restoredChannels.push(channel);
                    if (existing) report.duplicates++; else report.restored++;
                    report.channels.push({ name: saved.name, status: existing ? 'duplicate' : 'created' });
                } catch (error) { fail(saved.name, error); report.channels.push({ name: saved.name, status: 'failed' }); }
            }
            if (backup.kind === 'emoji') {
                for (const emoji of data.emojis || []) {
                    try {
                        if (guild.emojis.cache.some(e => e.name === emoji.name)) { report.duplicates++; continue; }
                        await guild.emojis.create({ attachment: emoji.url, name: emoji.name, reason: 'Restauration backup emojis' });
                        report.restored++;
                    } catch (error) { fail(emoji.name, error); }
                }
            }
            if (data.configuration && report.failed === 0) {
                const config = remapConfiguration(data.configuration, new Map([...roleMap, ...channelMap]));
                // Ne pas annuler une detention/liberation survenue depuis la sauvegarde.
                const current = await getGuildSettings(guild.client, guild.id, { create: false, useCache: false });
                if (config.prison) config.prison = { ...config.prison, prisoners: current?.prison?.prisoners || [], memberOverwrites: current?.prison?.memberOverwrites || {} };
                // Sécurité : un simple admin (-backup restore) ne doit pas pouvoir remettre
                // d'anciens owners/whitelist ni une config antiraid désactivée.
                for (const key of SECURITY_KEYS) {
                    if (current && key in current) config[key] = current[key];
                    else delete config[key];
                }
                await Guild.updateOne({ guildId: guild.id }, config);
                invalidateGuildSettings(guild.client, guild.id);
            }
            const PrisonService = require('./prisonService');
            await mapLimit(restoredChannels, (channel) => PrisonService.enforceChannel(guild.client, channel), 3);
            return report;
        });
    },
    remapConfiguration,
};

module.exports = BackupService;
